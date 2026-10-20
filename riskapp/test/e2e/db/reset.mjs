#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Reset riskapp_test to the deterministic E2E baseline.
//
//   node test/e2e/db/reset.mjs           # seed only (fast; assumes schema exists)
//   node test/e2e/db/reset.mjs --clone   # re-clone schema from riskapp_dev, then seed
//
// On a fresh machine where riskapp_test does not yet exist, the schema is
// cloned automatically. Connection is derived from DATABASE_URL in riskapp/.env
// (the db name is swapped to riskapp_test) or overridden via TEST_DATABASE_URL.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE        = dirname(fileURLToPath(import.meta.url));
const RISKAPP_DIR = join(HERE, '..', '..', '..');
const ENV_FILE    = join(RISKAPP_DIR, '.env');
const SEED_FILE   = join(HERE, 'seed.sql');
const CLONE_SH    = join(HERE, 'clone-schema.sh');
const MIGRATE_JS  = join(RISKAPP_DIR, 'db', 'migrate.js');

function parseDbUrl(url) {
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/(.+)$/);
  if (!m) throw new Error(`Unrecognised DATABASE_URL: ${url}`);
  return { user: m[1], password: m[2], host: m[3], port: m[4], database: m[5] };
}

function readEnvDbUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!existsSync(ENV_FILE)) throw new Error(`No .env at ${ENV_FILE} and TEST_DATABASE_URL unset`);
  const line = readFileSync(ENV_FILE, 'utf8').split('\n').find(l => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found in .env');
  const devUrl = line.slice('DATABASE_URL='.length).trim();
  // Swap the db name to the test database.
  return devUrl.replace(/\/[^/]+$/, '/riskapp_test');
}

const testUrl = readEnvDbUrl();
const cfg = parseDbUrl(testUrl);
const env = { ...process.env, PGPASSWORD: cfg.password };
const psqlBase = ['-U', cfg.user, '-h', cfg.host, '-p', cfg.port];

function psql(db, args) {
  return execFileSync('psql', [...psqlBase, '-d', db, '-X', '-v', 'ON_ERROR_STOP=1', ...args],
    { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function testDbExists() {
  const out = execFileSync('psql', [...psqlBase, '-d', 'postgres', '-X', '-tAc',
    `SELECT 1 FROM pg_database WHERE datname = '${cfg.database}'`],
    { env, encoding: 'utf8' });
  return out.trim() === '1';
}

const wantClone = process.argv.includes('--clone');

if (wantClone || !testDbExists()) {
  console.log(`→ Recreating empty ${cfg.database}…`);
  execFileSync('bash', [CLONE_SH], { env, stdio: 'inherit' });
}

// Build/upgrade the schema via the migration runner (baseline on a fresh DB,
// pending migrations on an existing one). Same path as CI and production.
console.log(`→ Running migrations on ${cfg.database}…`);
execFileSync('node', [MIGRATE_JS, 'up'], { env: { ...env, DATABASE_URL: testUrl }, stdio: 'inherit' });

console.log(`→ Seeding ${cfg.database}…`);
psql(cfg.database, ['-q', '-f', SEED_FILE]);

// Verify the baseline the specs depend on.
const checks = psql(cfg.database, ['-tAF', '|', '-c', `
  SELECT 'users',              count(*) FROM users
  UNION ALL SELECT 'pending_risks',      count(*) FROM risks WHERE validation_status='pending'
  UNION ALL SELECT 'proposed_actions',   count(*) FROM security_actions WHERE status='proposed'
  UNION ALL SELECT 'completed_actions',  count(*) FROM security_actions WHERE status='completed'
  UNION ALL SELECT 'draft_cycles',       count(*) FROM review_cycles WHERE status='draft'
  UNION ALL SELECT 'open_meetings',      count(*) FROM working_group_meetings WHERE closed_at IS NULL
  UNION ALL SELECT 'closed_unissued',    count(*) FROM working_group_meetings WHERE closed_at IS NOT NULL AND minutes_issued_at IS NULL
  UNION ALL SELECT 'issued_meetings',    count(*) FROM working_group_meetings WHERE minutes_issued_at IS NOT NULL
  UNION ALL SELECT 'active_exceptions',  count(*) FROM exceptions WHERE status='active'
  UNION ALL SELECT 'recorded_decisions', count(*) FROM meeting_agenda_items WHERE decision_recorded_at IS NOT NULL
`]);

const expected = {
  users: 8, pending_risks: 1, proposed_actions: 1, completed_actions: 1,
  draft_cycles: 1, open_meetings: 1, closed_unissued: 1, issued_meetings: 1,
  active_exceptions: 1, recorded_decisions: 3,
};
let ok = true;
console.log('\n  baseline checks:');
for (const row of checks.trim().split('\n')) {
  const [k, v] = row.split('|');
  const pass = Number(v) === expected[k];
  ok = ok && pass;
  console.log(`    ${pass ? '✓' : '✗'} ${k} = ${v}${pass ? '' : ` (expected ${expected[k]})`}`);
}
if (!ok) { console.error('\n✗ Baseline verification failed.'); process.exit(1); }
console.log(`\n✓ ${cfg.database} reset to E2E baseline`);
