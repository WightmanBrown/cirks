#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS first-admin bootstrap. Creates an `admin` user — there is NO default
// account and NO default password.
//
//   node db/create-admin.js --email you@org --name "Your Name"
//
// Password resolution (in order):
//   1. ADMIN_PASSWORD env var (for automation / non-interactive installs)
//   2. an interactive hidden prompt (entered twice) when stdin is a TTY
// Email/name may also come from ADMIN_EMAIL / ADMIN_NAME env vars.
//
// bcrypt cost 12 (matches the app's admin user-create path). department_id is
// left NULL — admin is a global role. Connection resolves like src/db/pool.js.

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const { pool } = require('../src/db/pool');

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LEN = 12;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email') out.email = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (ans) => { rl.close(); res(ans.trim()); }));
}

const { resolvePassword } = require('./promptPassword');

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node db/create-admin.js --email <email> --name "<full name>"\n' +
                '  Password via ADMIN_PASSWORD env or interactive hidden prompt.');
    return;
  }

  const email = (args.email || process.env.ADMIN_EMAIL ||
    (process.stdin.isTTY ? await prompt('Admin email: ') : '')).trim().toLowerCase();
  const name = (args.name || process.env.ADMIN_NAME ||
    (process.stdin.isTTY ? await prompt('Full name: ') : '')).trim();

  if (!EMAIL_RE.test(email)) throw new Error(`Invalid email: "${email}". Pass --email or set ADMIN_EMAIL.`);
  if (!name) throw new Error('A full name is required (--name or ADMIN_NAME).');

  const password = await resolvePassword();
  if (password.length < MIN_PASSWORD_LEN) {
    throw new Error(`Password too short — minimum ${MIN_PASSWORD_LEN} characters.`);
  }

  const dup = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
  if (dup.rowCount) throw new Error(`A user with email "${email}" already exists.`);

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role, department_id, is_active)
     VALUES ($1, $2, $3, 'admin', NULL, TRUE) RETURNING id`,
    [email, name, hash]);

  console.log(`[create-admin] Created admin "${name}" <${email}> (id ${rows[0].id}).`);
  console.log('[create-admin] Log in at the app URL with this email and the password you set.');
}

main()
  .catch((err) => { console.error(`[create-admin] ERROR: ${err.message}`); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
