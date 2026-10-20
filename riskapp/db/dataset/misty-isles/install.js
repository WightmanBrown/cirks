#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Misty Isles — build a complete training instance in one command.
//
//   docker compose exec app node riskapp/db/dataset/misty-isles/install.js
//   node db/dataset/misty-isles/install.js [--base <api>]   # outside a container
//
// It ASKS for the administrator's password (hidden, twice, at least 12
// characters; ADMIN_PASSWORD in the environment for an unattended run). There
// is no default: an instance anyone builds must not open with a password that
// is published here.
//
// Runs the pipeline in README.md, in order, against the database and API this
// process is configured for (DATABASE_URL, JWT_ACCESS_SECRET — the app
// container already has both):
//
//   1. build.js            the architecture tier from the story, into a temporary
//                          directory (the container's root filesystem is read-only)
//   2. import.js           loads it — every account gets the demo password
//   3. isms-cycle.js       a first risk portfolio, actions, exceptions, a meeting
//   4. isms-cycle.js --assess-backlog
//   5. story-cycle.js      the story's problems bite; a year of history
//   6. architecture.js     the security architecture and each system's answers
//   7. objective-solutions.js   a security solution for every objective that needs one
//   8. lock every account except the administrator
//
// The steps sign in as Misty Isles people (the CISO, the analyst, …), so while
// they run every account has the password typed. Step 8 then gives each
// account except the primary administrator (A.James@mig.local) its own random
// password that nobody knows, and ends its sessions. The accounts stay ACTIVE —
// a department's risk owner and the Owner/Manager columns are read from active
// accounts, so deactivating them would leave every risk without an owner (owner,
// 2026-10-16: "no usable password", not deactivation). The administrator
// enables a persona by setting its password: Admin → Account Management →
// Reset password.
//
// It refuses a database that already holds an organisation: Misty Isles is for
// a fresh, throwaway instance, never one with real data in it. Stops at the
// first step that fails, and says which.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RISKAPP = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node db/dataset/misty-isles/install.js [--base <api>]\n'
    + '  Asks for the administrator\'s password (or reads ADMIN_PASSWORD). Every other account is\n'
    + '  left with no usable password until the administrator sets one.\n'
    + '  --base      the CIRKS API (default http://127.0.0.1:$PORT/api/v1)');
  process.exit(0);
}
const ADMIN_EMAIL = 'A.James@mig.local';
const MIN_PASSWORD_LEN = 12;
const MAX_PASSWORD_LEN = 128;   // the application's own limit (routes/admin)
const BASE = opt('--base', `http://127.0.0.1:${process.env.PORT || 3000}/api/v1`);

require('dotenv').config({ path: path.join(RISKAPP, '.env') });
const { pool, query } = require(path.join(RISKAPP, 'src/db/pool'));
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { resolvePassword } = require(path.join(RISKAPP, 'db/promptPassword'));

function step(n, label, script, scriptArgs, env = {}) {
  console.log(`\n[misty-isles] ── step ${n} of 8: ${label}`);
  const r = spawnSync(process.execPath, [path.join(RISKAPP, script), ...scriptArgs], {
    cwd: RISKAPP, stdio: 'inherit', env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    console.error(`\n[misty-isles] step ${n} (${label}) failed — stopped. Nothing after it ran.`);
    process.exit(1);
  }
}

async function waitForApi() {
  const health = BASE.replace(/\/api\/v1\/?$/, '') + '/health';
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(health)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`the CIRKS API is not answering at ${health} — is the app running?`);
}

// Step 8. Each account but the administrator gets a random password nobody is
// told — a valid hash, so a sign-in attempt is simply refused — and its
// sessions end. Active, so it still owns what it owns.
async function lockPersonas() {
  console.log('\n[misty-isles] ── step 8 of 8: lock every account except the administrator');
  const { rows } = await query(
    `SELECT id, email FROM users WHERE lower(email) <> lower($1) ORDER BY email`, [ADMIN_EMAIL]);
  for (const u of rows) {
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('base64'), 12);
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, u.id]);
  }
  await query(`DELETE FROM refresh_tokens WHERE user_id IN
                 (SELECT id FROM users WHERE lower(email) <> lower($1))`, [ADMIN_EMAIL]);
  console.log(`[misty-isles] ${rows.length} accounts locked: active, but nobody can sign in to them until the`
    + ' administrator sets a password (Admin → Account Management → Reset password).');
}

(async () => {
  const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM departments');
  if (n > 0) {
    console.error(`[misty-isles] This database already has ${n} department(s). Misty Isles goes only into a`
      + ' fresh, empty CIRKS database — never one with real data in it. Nothing was changed.');
    process.exit(1);
  }
  const PASSWORD = await resolvePassword(`Password for the administrator, ${ADMIN_EMAIL}: `);
  if (PASSWORD.length < MIN_PASSWORD_LEN) throw new Error(`Password too short — at least ${MIN_PASSWORD_LEN} characters.`);
  if (PASSWORD.length > MAX_PASSWORD_LEN) throw new Error(`Password too long — at most ${MAX_PASSWORD_LEN} characters.`);
  await waitForApi();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'misty-isles-'));
  const pw = { DEMO_PASSWORD: PASSWORD, CIRKS_PASSWORD: PASSWORD };
  step(1, 'build the organisation from the story', 'db/dataset/misty-isles/build.js', ['--out', dir]);
  step(2, 'import it', 'db/import.js', [dir, '--password', PASSWORD], pw);
  fs.rmSync(dir, { recursive: true, force: true });
  step(3, 'first risk portfolio', 'db/isms-cycle.js', ['--base', BASE], pw);
  step(4, 'assess the backlog', 'db/isms-cycle.js', ['--base', BASE, '--assess-backlog'], pw);
  step(5, 'a year of history', 'db/dataset/misty-isles/story-cycle.js', ['--base', BASE], pw);
  step(6, 'security architecture', 'db/dataset/misty-isles/architecture.js', ['--base', BASE], pw);
  step(7, 'security solutions for objectives', 'db/dataset/misty-isles/objective-solutions.js', ['--base', BASE], pw);
  await lockPersonas();
  await pool.end();

  console.log(`\n[misty-isles] Done. Sign in as ${ADMIN_EMAIL}, the administrator, with the password you chose.`
    + ' To use another Misty Isles account, set its password first on Admin → Account Management.');
})().catch(async (e) => { console.error(`[misty-isles] ${e.message}`); await pool.end().catch(() => {}); process.exit(1); });
