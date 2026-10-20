'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Login against the REAL database, because v112 (H-17) moved the password
// comparison inside it.
//
// The app role no longer holds SELECT on users.password_hash; the controller
// calls verify_user_credentials(), a SECURITY DEFINER function that does the
// bcrypt work and returns a verdict. Two consequences make DB-backed tests
// necessary rather than nice to have:
//
//   1. The mocked suite can no longer prove case-insensitive lookup, because the
//      lowering moved into SQL. It used to assert on the query text.
//   2. pgcrypto's crypt() implements $2a$ while node-bcrypt writes $2b$, and it
//      returns FALSE for a $2b$ hash rather than erroring — so getting this
//      wrong fails EVERY login silently. Only a real comparison catches that.

const bcrypt = require('bcrypt');
const { query, request, app } = require('./helpers');

const PASSWORD = 'Correct-Horse-9';
const made = [];

async function mkUser(email) {
  const hash = await bcrypt.hash(PASSWORD, 12);   // $2b$, as the app writes
  const { rows } = await query(
    `INSERT INTO users (email, full_name, password_hash, role, is_active)
     VALUES ($1, 'ITG Login Probe', $2, 'risk_analyst', TRUE) RETURNING id`,
    [email, hash]);
  made.push(rows[0].id);
  return rows[0].id;
}

const login = (email, password) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

afterAll(async () => {
  for (const id of made) await query('DELETE FROM users WHERE id = $1', [id]);
});

describe('login against a real bcrypt hash (v112)', () => {
  test('the correct password is accepted — $2b$ hashes verify in-database', async () => {
    await mkUser('itg-login-1@org.local');
    const res = await login('itg-login-1@org.local', PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
  });

  test('a wrong password is refused', async () => {
    await mkUser('itg-login-2@org.local');
    const res = await login('itg-login-2@org.local', 'not-the-password');
    expect(res.status).toBe(401);
    expect(res.body.access_token).toBeUndefined();
  });

  test('an unknown email is refused with the same message — no enumeration', async () => {
    const known   = await login('itg-login-2@org.local', 'not-the-password');
    const unknown = await login('nobody-at-all@org.local', 'not-the-password');
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(known.body.error);
  });

  test('lookup is case-insensitive in BOTH directions', async () => {
    // The regression this guards: emails arrive mixed-case from CSV import, and
    // a case-sensitive match silently 401s valid users. Pinned here because the
    // mocked suite can no longer see the comparison.
    await mkUser('ITG-Login-Mixed@Org.Local');
    for (const attempt of ['ITG-Login-Mixed@Org.Local',
                           'itg-login-mixed@org.local',
                           'ITG-LOGIN-MIXED@ORG.LOCAL',
                           '  itg-login-mixed@org.local  ']) {
      const res = await login(attempt, PASSWORD);
      expect([attempt, res.status]).toEqual([attempt, 200]);
    }
  });

  test('an inactive account is refused even with the right password', async () => {
    const id = await mkUser('itg-login-3@org.local');
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
    const res = await login('itg-login-3@org.local', PASSWORD);
    expect(res.status).toBe(401);
  });

  test('the login response never carries credential material', async () => {
    await mkUser('itg-login-4@org.local');
    const res = await login('itg-login-4@org.local', PASSWORD);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/\$2[aby]\$/);       // no bcrypt hash, in any shape
    expect(body).not.toMatch(/password_hash/);
    expect(body).not.toMatch(/totp_secret/);
  });

  test('the function itself never returns a hash', async () => {
    await mkUser('itg-login-5@org.local');
    const { rows } = await query(
      'SELECT * FROM verify_user_credentials($1, $2)',
      ['itg-login-5@org.local', PASSWORD]);
    expect(rows[0].password_ok).toBe(true);
    expect(Object.keys(rows[0])).not.toContain('password_hash');
    expect(Object.keys(rows[0])).not.toContain('totp_secret');
  });

  test('an unknown email returns no row at all, not a row saying false', async () => {
    const { rows } = await query(
      'SELECT * FROM verify_user_credentials($1, $2)',
      ['definitely-nobody@org.local', PASSWORD]);
    expect(rows).toHaveLength(0);
  });
});
