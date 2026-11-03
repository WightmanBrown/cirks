'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Two-factor sign-in end to end (H-05, v166), against the real database: the
// codes are computed in PL/pgSQL (verify_user_totp), so this is where they are
// proved to agree with an authenticator app (otplib, which the apps match).
// Uses the meeting secretary from the deterministic seed and puts it back.

const { authenticator } = require('otplib');
const { app, request, query, USERS, tokenFor } = require('./helpers');

const EMAIL = 'meeting.secretary@org.local';
const PASSWORD = 'Riskapp123';
const ME = USERS.secretary.id;
const as = (method, path, key = 'secretary') =>
  request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${tokenFor(key)}`);
const login = (body) => request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD, ...body });
// The code for a step offset from now, as the app on a phone would show it.
const codeAt = (secret, offset = 0) => authenticator.clone({ epoch: Date.now() + offset * 30000 }).generate(secret);
const clear = () => query(
  `UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_enabled_at = NULL, totp_pending_secret = NULL,
                    totp_pending_at = NULL, totp_last_step = NULL WHERE id = $1`, [ME]);

let secret;
beforeAll(clear);
afterAll(async () => {
  await clear();
  await query(`DELETE FROM audit_log WHERE entity_id = $1 AND human_narrative LIKE 'Two-factor%'`, [ME]);
  await query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [ME]);
});

describe('setting it up', () => {
  test('starts off', async () => {
    const r = await as('get', '/auth/totp');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ enabled: false, pending: false });
    expect((await login({})).status).toBe(200);              // password alone, while it is off
  });

  test('setup gives a secret to scan and a QR code, and switches nothing on', async () => {
    const r = await as('post', '/auth/totp/setup');
    expect(r.status).toBe(200);
    secret = r.body.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);                // 20 bytes, base32
    expect(r.body.otpauth_url).toContain(`secret=${secret}`);
    expect(r.body.otpauth_url).toContain('issuer=CIRKS');
    expect(r.body.qr).toMatch(/^data:image\/png;base64,/);
    const { rows: [u] } = await query('SELECT totp_enabled, totp_secret, totp_pending_secret FROM users WHERE id = $1', [ME]);
    expect(u).toEqual({ totp_enabled: false, totp_secret: null, totp_pending_secret: secret });
    expect((await as('get', '/auth/totp')).body.pending).toBe(true);
  });

  test('a wrong code does not switch it on', async () => {
    const wrong = codeAt(secret) === '000000' ? '111111' : '000000';
    const r = await as('post', '/auth/totp/confirm').send({ code: wrong });
    expect(r.status).toBe(400);
    expect((await as('get', '/auth/totp')).body.enabled).toBe(false);
  });

  test('the right code switches it on, ends other sessions and is recorded', async () => {
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, 'totp-test-other-session', gen_random_uuid(), now() + interval '1 day')`, [ME]);
    const r = await as('post', '/auth/totp/confirm').send({ code: codeAt(secret) });
    expect(r.status).toBe(200);
    const { rows: [u] } = await query(
      'SELECT totp_enabled, totp_secret, totp_pending_secret, totp_enabled_at FROM users WHERE id = $1', [ME]);
    expect(u.totp_enabled).toBe(true);
    expect(u.totp_secret).toBe(secret);
    expect(u.totp_pending_secret).toBeNull();
    expect(u.totp_enabled_at).not.toBeNull();
    const other = await query(`SELECT revoked_at FROM refresh_tokens WHERE token_hash = 'totp-test-other-session'`);
    expect(other.rows[0].revoked_at).not.toBeNull();
    const audit = await query(
      `SELECT 1 FROM audit_log WHERE entity_id = $1 AND human_narrative = 'Two-factor sign-in switched on.'`, [ME]);
    expect(audit.rowCount).toBe(1);
  });

  test('setting up again while it is on is refused', async () => {
    expect((await as('post', '/auth/totp/setup')).status).toBe(409);
  });
});

describe('signing in', () => {
  test('the password alone is no longer enough', async () => {
    const r = await login({});
    expect(r.status).toBe(401);
    expect(r.body.totp_required).toBe(true);
    expect(r.body.access_token).toBeUndefined();
  });

  test('a code already used is refused — the confirming code cannot be replayed', async () => {
    const r = await login({ totp_code: codeAt(secret) });
    expect(r.status).toBe(401);
    expect(r.body.totp_required).toBe(true);
  });

  test('the next code signs in; the same code again does not', async () => {
    const next = codeAt(secret, 1);                          // allowed: one step of clock drift
    const ok = await login({ totp_code: next });
    expect(ok.status).toBe(200);
    expect(ok.body.access_token).toBeTruthy();
    const again = await login({ totp_code: next });
    expect(again.status).toBe(401);
  });

  test('a code from two steps away is refused', async () => {
    await query('UPDATE users SET totp_last_step = NULL WHERE id = $1', [ME]);
    expect((await login({ totp_code: codeAt(secret, 3) })).status).toBe(401);
    expect((await login({ totp_code: codeAt(secret, -3) })).status).toBe(401);
  });

  test('the code is not a password: wrong password with the right code is refused', async () => {
    await query('UPDATE users SET totp_last_step = NULL WHERE id = $1', [ME]);
    const r = await request(app).post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'not-the-password', totp_code: codeAt(secret) });
    expect(r.status).toBe(401);
    expect(r.body.totp_required).toBeUndefined();
  });
});

describe('turning it off', () => {
  test('needs the password and a code', async () => {
    await query('UPDATE users SET totp_last_step = NULL WHERE id = $1', [ME]);
    expect((await as('post', '/auth/totp/disable').send({ password: 'wrong-password', code: codeAt(secret) })).status).toBe(400);
    await query('UPDATE users SET totp_last_step = NULL WHERE id = $1', [ME]);
    expect((await as('post', '/auth/totp/disable').send({ password: PASSWORD, code: '123' })).status).toBe(400);
    expect((await as('get', '/auth/totp')).body.enabled).toBe(true);

    await query('UPDATE users SET totp_last_step = NULL WHERE id = $1', [ME]);
    const r = await as('post', '/auth/totp/disable').send({ password: PASSWORD, code: codeAt(secret) });
    expect(r.status).toBe(200);
    const { rows: [u] } = await query('SELECT totp_enabled, totp_secret FROM users WHERE id = $1', [ME]);
    expect(u).toEqual({ totp_enabled: false, totp_secret: null });
    expect((await login({})).status).toBe(200);
  });
});

describe('an administrator clears a lost authenticator', () => {
  test('the account list says who has it on; the reset clears it and is recorded', async () => {
    const s = (await as('post', '/auth/totp/setup')).body.secret;
    expect((await as('post', '/auth/totp/confirm').send({ code: codeAt(s) })).status).toBe(200);
    const listed = (await as('get', '/admin/users', 'admin')).body.find((u) => u.id === ME);
    expect(listed.totp_enabled).toBe(true);

    const r = await as('post', `/admin/users/${ME}/reset-totp`, 'admin');
    expect(r.status).toBe(200);
    const { rows: [u] } = await query('SELECT totp_enabled, totp_secret, totp_pending_secret FROM users WHERE id = $1', [ME]);
    expect(u).toEqual({ totp_enabled: false, totp_secret: null, totp_pending_secret: null });
    const audit = await query(
      `SELECT user_id FROM audit_log WHERE entity_id = $1 AND human_narrative = 'Two-factor sign-in cleared by an administrator.'`, [ME]);
    expect(audit.rows.map((x) => x.user_id)).toEqual([USERS.admin.id]);
  });
});
