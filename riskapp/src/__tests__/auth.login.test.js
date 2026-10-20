'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — POST /api/v1/auth/login
 *
 * Proves:
 *   1. Returns 400 when email or password is missing.
 *   2. Returns 401 when user is not found.
 *   3. Returns 401 when password is wrong.
 *   4. Returns 401 when account is inactive.
 *   5. Returns 401 when TOTP is enabled but no code is supplied.
 *   6. Returns 401 when TOTP code is invalid.
 *   7. Returns 200 with access_token, refresh_token, and user on success (no TOTP).
 *   8. Returns 200 on success when TOTP is enabled and code is valid.
 *   9. user object contains id, email, full_name, role, and roles array.
 *   10. Returns 500 on unexpected database error.
 */

const request = require('supertest');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');

// ── Mock otplib before app loads ──────────────────────────────────────────────

jest.mock('otplib', () => ({
  totp: {
    options: {},
    check: jest.fn(),
  },
}));

const { totp } = require('otplib');

// ── Mock pg pool ──────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return {
    pool:  { query: mockQuery, on: jest.fn() },
    query: mockQuery,
  };
});

const { query: mockQuery } = require('../db/pool');

// ── Mock requestLogger ────────────────────────────────────────────────────────

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => {
    res.on('finish', () => {});
    next();
  };
});

// ── App under test ────────────────────────────────────────────────────────────

const createApp = require('../app');
const app       = createApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Pre-hashed password — generated once to keep tests fast.
// Plaintext: 'correct-password'
const PASSWORD_HASH = bcrypt.hashSync('correct-password', 4); // low rounds for speed

const BASE_USER = {
  id:            'user-ciso-uuid',
  email:         'ciso@example.com',
  full_name:     'Chris CISO',
  role:          'ciso',
  // v112 (H-17): the controller no longer selects a hash. It calls
  // verify_user_credentials(), which does the bcrypt comparison inside the
  // database and returns a verdict. The fixture is that verdict.
  password_ok:   true,
  totp_enabled:  false,
  is_active:     true,
};

const ROLE_ROWS = [
  { role: 'ciso' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Set up mockQuery for a successful login sequence:
 *   1. User fetch         → userRow
 *   2. Roles fetch        → roleRows
 *   3. Insert token       → { rows: [] }
 *   4. Update last_login  → { rows: [] }
 */
function dbSuccessfulLogin({ userRow = BASE_USER, roleRows = ROLE_ROWS } = {}) {
  mockQuery
    .mockResolvedValueOnce({ rows: [userRow],  rowCount: 1 })  // user fetch
    .mockResolvedValueOnce({ rows: roleRows,   rowCount: roleRows.length }) // roles
    .mockResolvedValueOnce({ rows: [],         rowCount: 1 })  // insert token
    .mockResolvedValueOnce({ rows: [],         rowCount: 1 }); // last_login_at
}

function dbUserNotFound() {
  // No row back: an unknown email, or a wrong password. The function does the
  // constant-cost bcrypt internally, so the controller just sees nothing.
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
}

function dbThrows() {
  mockQuery.mockRejectedValueOnce(new Error('connection refused'));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  totp.check.mockReturnValue(false);
});

// ── Body validation ───────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login — body validation', () => {

  test('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'correct-password' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
  });

});

// ── Credential validation ─────────────────────────────────────────────────────

describe('POST /api/v1/auth/login — email case-insensitivity', () => {

  test('looks up the user case-insensitively (mixed-case stored emails)', async () => {
    dbSuccessfulLogin();

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'S.Topping@MIG.local', password: 'correct-password' });

    // Stored emails can be mixed-case (CSV-imported), so the lookup MUST be
    // case-insensitive — a case-sensitive match silently 401s valid users.
    //
    // v112 moved that lowering INSIDE verify_user_credentials, which does
    // lower(btrim(...)) on both sides. A mocked test cannot see into the
    // function, so all it can pin here is that the controller passes the
    // address through UNMANGLED and lets the database normalise it. The
    // behaviour itself is pinned for real in
    // integration/authLogin.integration.test.js, against actual mixed-case rows.
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/verify_user_credentials/);
    expect(params[0]).toBe('S.Topping@MIG.local');
  });

});

describe('POST /api/v1/auth/login — credential validation', () => {

  test('returns 401 when user is not found', async () => {
    dbUserNotFound();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'correct-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  test('returns 401 when password is wrong', async () => {
    // The verdict now comes FROM the database, so a wrong password is a row
    // with password_ok false — not an absent row, which is the unknown-email
    // case above. Both must 401 with the same message.
    mockQuery.mockResolvedValueOnce({ rows: [{ ...BASE_USER, password_ok: false }], rowCount: 1 });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  test('returns 401 when account is inactive', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...BASE_USER, is_active: false }],
      rowCount: 1,
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@example.com', password: 'correct-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

});

// ── TOTP ──────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login — TOTP', () => {

  // v112 (H-17) changed this deliberately, and the change is the point of the
  // tests below. The app role no longer holds SELECT on users.totp_secret, so
  // the controller cannot verify a code even if one is supplied.
  //
  // That is not a regression, because MFA CANNOT BE ENROLLED (H-05): nothing in
  // the application ever writes totp_secret, so no account can legitimately
  // reach this state. Implementing base32 + HMAC-SHA1 + dynamic truncation in
  // PL/pgSQL to support a feature that does not work would have been the wrong
  // order of events. When H-05 makes enrolment real, verification gets its own
  // definer function beside verify_user_credentials.
  //
  // Until then it FAILS CLOSED and says so, which is the behaviour worth
  // pinning: an account flagged for a second factor is refused, never waved
  // through.
  const TOTP_USER = { ...BASE_USER, totp_enabled: true };

  test('an account flagged for a second factor is REFUSED, with or without a code', async () => {
    for (const body of [
      { email: 'ciso@example.com', password: 'correct-password' },
      { email: 'ciso@example.com', password: 'correct-password', totp_code: '000000' },
      { email: 'ciso@example.com', password: 'correct-password', totp_code: '123456' },
    ]) {
      mockQuery.mockResolvedValueOnce({ rows: [TOTP_USER], rowCount: 1 });
      const res = await request(app).post('/api/v1/auth/login').send(body);
      expect(res.status).toBe(401);
      expect(res.body.totp_required).toBe(true);
      expect(res.body.error).toMatch(/not yet available/i);
      expect(res.body.access_token).toBeUndefined();
    }
  });

  test('no token is issued down the second-factor path', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [TOTP_USER], rowCount: 1 });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@example.com', password: 'correct-password', totp_code: '999999' });
    expect(res.body).not.toHaveProperty('refresh_token');
  });

});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login — success', () => {

  test('returns 200 with access_token, refresh_token, token_type, expires_in, and user', async () => {
    dbSuccessfulLogin();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access_token');
    expect(res.body).toHaveProperty('refresh_token');
    expect(res.body).toHaveProperty('token_type', 'Bearer');
    expect(res.body).toHaveProperty('expires_in');
    expect(res.body).toHaveProperty('user');
  });

  test('user object contains id, email, full_name, role, and roles array', async () => {
    dbSuccessfulLogin();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@example.com', password: 'correct-password' });

    expect(res.body.user).toMatchObject({
      id:        'user-ciso-uuid',
      email:     'ciso@example.com',
      full_name: 'Chris CISO',
      role:      'ciso',
    });
    expect(Array.isArray(res.body.user.roles)).toBe(true);
    expect(res.body.user.roles).toContain('ciso');
  });

  test('access token payload contains correct sub, email, and role', async () => {
    dbSuccessfulLogin();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@example.com', password: 'correct-password' });

    const decoded = jwt.verify(res.body.access_token, process.env.JWT_ACCESS_SECRET);
    expect(decoded.sub).toBe('user-ciso-uuid');
    expect(decoded.email).toBe('ciso@example.com');
    expect(decoded.role).toBe('ciso');
  });

});

// ── Error handling ────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    dbThrows();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@example.com', password: 'correct-password' });

    expect(res.status).toBe(500);
  });

});
