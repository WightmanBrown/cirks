#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS password reset. Sets a new password on an EXISTING user (any role) —
// the supported way to recover a forgotten login, since create-admin.js refuses
// an email that already exists.
//
//   node db/reset-password.js --email you@org
//
// Password resolution (in order):
//   1. NEW_PASSWORD env var (for automation / non-interactive use)
//   2. an interactive hidden prompt (entered twice) when stdin is a TTY
// Email may also come from the RESET_EMAIL env var.
//
// bcrypt cost 12 (matches create-admin.js and the app). Connection resolves
// like src/db/pool.js. Only the password_hash is changed — role, department and
// active state are left untouched.

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const { pool } = require('../src/db/pool');
const { assertPassword } = require('../src/auth/passwordPolicy');

const SALT_ROUNDS = 12;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email') out.email = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (ans) => { rl.close(); res(ans.trim()); }));
}

// Hidden prompt — echoes nothing as the user types.
function promptHidden(question) {
  return new Promise((res) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode && stdin.setRawMode(true);
    stdin.resume();
    let val = '';
    const finish = () => {
      stdin.setRawMode && stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    const onData = (ch) => {
      const s = ch.toString('utf8');
      for (const c of s) {
        const code = c.charCodeAt(0);
        if (code === 13 || code === 10 || code === 4) {       // Enter / Ctrl-D
          finish(); res(val); return;
        } else if (code === 3) {                              // Ctrl-C
          finish(); process.exit(130);
        } else if (code === 127 || code === 8) {              // Backspace / Del
          val = val.slice(0, -1);
        } else if (code >= 32) {                              // printable only
          val += c;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function resolvePassword() {
  if (process.env.NEW_PASSWORD) return process.env.NEW_PASSWORD;
  if (!process.stdin.isTTY) {
    throw new Error('No password: set NEW_PASSWORD or run interactively (a TTY is required for the hidden prompt).');
  }
  const p1 = await promptHidden('New password: ');
  const p2 = await promptHidden('Confirm password: ');
  if (p1 !== p2) throw new Error('Passwords do not match.');
  return p1;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node db/reset-password.js --email <email>\n' +
                '  Password via NEW_PASSWORD env or interactive hidden prompt.');
    return;
  }

  const email = (args.email || process.env.RESET_EMAIL ||
    (process.stdin.isTTY ? await prompt('User email: ') : '')).trim().toLowerCase();

  if (!EMAIL_RE.test(email)) throw new Error(`Invalid email: "${email}". Pass --email or set RESET_EMAIL.`);

  const found = await pool.query(
    'SELECT id, full_name, role FROM users WHERE lower(email) = $1', [email]);
  if (!found.rowCount) throw new Error(`No user with email "${email}".`);
  const user = found.rows[0];

  const password = await resolvePassword();
  assertPassword(password);

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);

  console.log(`[reset-password] Password reset for "${user.full_name}" <${email}> (${user.role}).`);
  console.log('[reset-password] Log in at the app URL with the new password.');
}

main()
  .catch((err) => { console.error(`[reset-password] ERROR: ${err.message}`); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
