#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS database migration runner.
//
//   node db/migrate.js up              bootstrap → (baseline if fresh) → apply pending
//   node db/migrate.js status          report baseline + applied + pending (read-only)
//   node db/migrate.js baseline-stamp  mark an existing DB as baselined, apply nothing
//
// Design (see db/README.md):
//   * The frozen `baseline.sql` (a pg_dump --schema-only through v88) is loaded
//     via the `psql` CLI — it contains `\restrict` psql meta-commands the pg
//     driver cannot run. It is applied ONCE, only to a truly empty database.
//   * Forward migrations live in db/migrations/NNNN_slug.sql, are plain SQL with
//     NO transaction control and NO self-stamping, and run through the pg driver,
//     each in its own transaction (unless they carry `-- migrate:no-transaction`).
//   * The runner records every applied migration in `schema_migrations`
//     (version, name, checksum, applied_at) and refuses to proceed if an
//     already-applied file's sha256 has changed (edit-an-applied-migration guard).
//   * A session-level Postgres advisory lock serialises concurrent runners.
//
// Connection uses the same resolution as src/db/pool.js (DATABASE_URL or DB_*).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pool } = require('../src/db/pool');

const BASELINE_FILE = path.join(__dirname, 'baseline.sql');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const BASELINE_VERSION = 'baseline';
const FIRST_FORWARD_VERSION = 89;            // forward migrations are 0089+
const ADVISORY_LOCK_KEY = '7480010132';      // frozen; do not change
const NAME_RE = /^(\d{4,})_[a-z0-9][a-z0-9_-]*\.sql$/;
const NO_TX_RE = /^\s*--\s*migrate:no-transaction\b/m;
const { splitStatements } = require('./splitStatements');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ── connection resolution (mirrors src/db/pool.js) ──────────────────────────────
function resolvePsql() {
  // Returns { args, env, dbLabel } for invoking psql against the target DB.
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    let dbLabel = url;
    try { dbLabel = new URL(url).pathname.replace(/^\//, '') || url; } catch { /* keep raw */ }
    return { args: [url], env: process.env, dbLabel };
  }
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const db   = process.env.DB_NAME || 'riskapp_dev';
  const user = process.env.DB_USER || 'postgres';
  return {
    args: ['-h', host, '-p', port, '-U', user, '-d', db],
    env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' },
    dbLabel: `${db} @ ${host}:${port}`,
  };
}

function loadBaselineViaPsql() {
  const { args, env } = resolvePsql();
  execFileSync('psql', [...args, '-v', 'ON_ERROR_STOP=1', '-q', '-f', BASELINE_FILE],
    { env, stdio: ['ignore', 'pipe', 'inherit'] });
}

// ── migration file discovery ────────────────────────────────────────────────────
function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const m = file.match(NAME_RE);
      if (!m) throw new Error(`Bad migration filename: "${file}". Expected NNNN_slug.sql (4+ digits).`);
      const version = String(parseInt(m[1], 10)); // canonical int string, e.g. 0089 → "89"
      const buf = fs.readFileSync(path.join(MIGRATIONS_DIR, file));
      return { file, version, checksum: sha256(buf), text: buf.toString('utf8') };
    });
}

// ── state detection ─────────────────────────────────────────────────────────────
async function regclass(client, qualified) {
  const { rows } = await client.query('SELECT to_regclass($1) AS oid', [qualified]);
  return rows[0].oid != null;
}

async function detectState(client) {
  const coreExist =
    (await regclass(client, 'public.users')) && (await regclass(client, 'public.org_config'));
  const ledgerExist = await regclass(client, 'public.schema_migrations');
  let markerExist = false;
  if (ledgerExist) {
    const { rows } = await client.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1', [BASELINE_VERSION]);
    markerExist = rows.length > 0;
  }
  if (!coreExist && ledgerExist) return 'CORRUPT';      // ledger but no schema
  if (!coreExist && !ledgerExist) return 'FRESH';       // truly empty
  if (markerExist) return 'NORMAL';                     // core + marker
  return 'EXISTING_UNSTAMPED';                           // core, pre-runner
}

// Add name/checksum columns + ensure the table exists (idempotent).
async function ensureLedger(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version varchar(50) NOT NULL PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now(),
    description text
  )`);
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS name text');
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
}

async function stampBaseline(client, description) {
  const checksum = sha256(fs.readFileSync(BASELINE_FILE));
  await client.query(
    `INSERT INTO schema_migrations (version, name, checksum, description)
     VALUES ($1, 'baseline.sql', $2, $3)
     ON CONFLICT (version) DO NOTHING`,
    [BASELINE_VERSION, checksum, description]);
}

async function appliedForward(client) {
  const { rows } = await client.query(
    `SELECT version, name, checksum FROM schema_migrations
     WHERE version ~ '^[0-9]+$' AND version::int >= $1`, [FIRST_FORWARD_VERSION]);
  return new Map(rows.map((r) => [r.version, r]));
}

// ── commands ────────────────────────────────────────────────────────────────────
async function cmdUp() {
  const { dbLabel } = resolvePsql();
  console.log(`[migrate] target: ${dbLabel}`);
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    locked = true;

    const state = await detectState(client);
    if (state === 'CORRUPT') {
      throw new Error('schema_migrations exists but core tables are missing — refusing to run on a partial/corrupt DB.');
    }

    if (state === 'FRESH') {
      console.log('[migrate] empty database → loading baseline.sql (psql)…');
      loadBaselineViaPsql();
      await ensureLedger(client);
      await stampBaseline(client, 'fresh install — baseline applied');
      console.log('[migrate] baseline applied + stamped.');
    } else {
      await ensureLedger(client);
      if (state === 'EXISTING_UNSTAMPED') {
        await stampBaseline(client, 'reconciled — pre-existing schema assumed at baseline');
        console.log('[migrate] existing schema reconciled → baseline marker inserted (baseline NOT re-applied).');
      }
    }

    const files = listMigrationFiles();
    const applied = await appliedForward(client);

    // Verify checksums of already-applied migrations (tamper guard).
    for (const f of files) {
      const row = applied.get(f.version);
      if (!row) continue;
      if (row.checksum && row.checksum !== f.checksum) {
        throw new Error(
          `Checksum mismatch for an already-applied migration "${f.file}".\n` +
          `  stored:   ${row.checksum}\n  computed: ${f.checksum}\n` +
          'Never edit an applied migration — fix forward with a new file.');
      }
      if (!row.checksum) {
        await client.query('UPDATE schema_migrations SET checksum = $1, name = COALESCE(name,$2) WHERE version = $3',
          [f.checksum, f.file, f.version]); // backfill legacy/null checksum
      }
    }

    const pending = files.filter((f) => !applied.has(f.version));
    // Out-of-order guard: every pending version must exceed the max applied.
    const maxApplied = [...applied.keys()].reduce((m, v) => Math.max(m, parseInt(v, 10)), 0);
    for (const f of pending) {
      if (parseInt(f.version, 10) <= maxApplied) {
        throw new Error(`Out-of-order migration "${f.file}" (v${f.version}) ≤ already-applied v${maxApplied}.`);
      }
    }

    if (pending.length === 0) {
      console.log('[migrate] up to date — 0 pending.');
      return;
    }

    for (const f of pending) {
      const noTx = NO_TX_RE.test(f.text);
      process.stdout.write(`[migrate] applying ${f.file}${noTx ? ' (no-transaction)' : ''}… `);
      if (noTx) {
        // One statement at a time: see splitStatements above. Sending the whole
        // file would put them all in one implicit transaction, which is the very
        // thing the directive exists to avoid.
        for (const stmt of splitStatements(f.text)) {
          await client.query(stmt);
        }
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum, description) VALUES ($1,$2,$3,$4)',
          [f.version, f.file, f.checksum, null]);
      } else {
        try {
          await client.query('BEGIN');
          await client.query(f.text);
          await client.query(
            'INSERT INTO schema_migrations (version, name, checksum, description) VALUES ($1,$2,$3,$4)',
            [f.version, f.file, f.checksum, null]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          process.stdout.write('FAILED\n');
          throw err;
        }
      }
      process.stdout.write('ok\n');
    }
    console.log(`[migrate] applied ${pending.length} migration(s).`);
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

async function cmdStatus() {
  const { dbLabel } = resolvePsql();
  console.log(`[migrate] target: ${dbLabel}`);
  const client = await pool.connect();
  let drift = false;
  try {
    if (!(await regclass(client, 'public.schema_migrations'))) {
      console.log('  baseline: ABSENT (no schema_migrations table) — DB looks empty.');
      return;
    }
    const { rows: bl } = await client.query(
      'SELECT applied_at, checksum FROM schema_migrations WHERE version = $1', [BASELINE_VERSION]);
    if (bl.length === 0) {
      console.log('  baseline: not stamped (run `migrate up` to reconcile).');
    } else {
      let match = 'n/a';
      if (bl[0].checksum) {
        match = bl[0].checksum === sha256(fs.readFileSync(BASELINE_FILE)) ? 'match' : 'MISMATCH';
        if (match === 'MISMATCH') drift = true;
      }
      console.log(`  baseline: present (${bl[0].applied_at.toISOString()}) checksum:${match}`);
    }

    const files = listMigrationFiles();
    const applied = await appliedForward(client);
    const appliedList = [...applied.values()];
    console.log(`  applied forward migrations: ${appliedList.length}`);
    for (const f of files) {
      const row = applied.get(f.version);
      if (row && row.checksum && row.checksum !== f.checksum) drift = true;
    }
    const pending = files.filter((f) => !applied.has(f.version));
    console.log(`  pending: ${pending.length}${pending.length ? ' → ' + pending.map((f) => f.file).join(', ') : ''}`);
    // applied files missing on disk
    const onDisk = new Set(files.map((f) => f.version));
    for (const v of applied.keys()) if (!onDisk.has(v)) { console.log(`  ⚠ applied v${v} has no file on disk`); drift = true; }
    console.log(`  summary: baseline ${bl.length ? 'present' : 'absent'} | applied ${appliedList.length} | pending ${pending.length}${drift ? ' | DRIFT' : ''}`);
  } finally {
    client.release();
  }
  if (drift) process.exitCode = 3;
}

async function cmdBaselineStamp() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
      await ensureLedger(client);
      await stampBaseline(client, 'manual baseline-stamp');
      console.log('[migrate] baseline marker ensured (no migrations applied).');
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

(async () => {
  const cmd = process.argv[2] || 'up';
  try {
    if (cmd === 'up') await cmdUp();
    else if (cmd === 'status') await cmdStatus();
    else if (cmd === 'baseline-stamp') await cmdBaselineStamp();
    else { console.error(`Usage: migrate.js <up|status|baseline-stamp>`); process.exitCode = 2; }
  } catch (err) {
    console.error(`[migrate] ERROR: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
