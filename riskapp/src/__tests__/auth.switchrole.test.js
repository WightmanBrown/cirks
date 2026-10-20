'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — POST /api/v1/auth/switch-role
 *
 * Proves:
 *   1. authenticate() rejects missing / malformed / expired tokens with 401.
 *   2. Returns 400 when role is missing from the request body.
 *   3. Returns 403 when the requested role is not held by the user.
 *   4. Returns 200 with a new access token and updated user object on success.
 *   5. The new access token contains the switched role in its payload.
 *   6. The switch is written to audit_log.
 *   7. Returns 500 on unexpected database error.
 */

const request = require('supertest');
const jwt     = require('jsonwebtoken');

// ── Mock pg pool before any app module loads ──────────────────────────────────

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

// ── Token factory ─────────────────────────────────────────────────────────────

function makeToken(payload, secret = process.env.JWT_ACCESS_SECRET, opts = {}) {
  return jwt.sign(payload, secret, { expiresIn: '15m', ...opts });
}

const CISO_TOKEN = makeToken({
  sub:   'user-ciso-uuid',
  email: 'ciso@example.com',
  role:  'ciso',
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

// v_user_roles rows returned when the CISO user holds ciso + risk_analyst
const DUAL_ROLE_ROWS = [
  { role: 'ciso',         source: 'primary'    },
  { role: 'risk_analyst', source: 'additional' },
];

// users row returned by the user lookup inside switchRole
const CISO_USER_ROW = {
  id:        'user-ciso-uuid',
  email:     'ciso@example.com',
  full_name: 'Chris CISO',
  role:      'ciso',
  is_active: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sets up the two DB calls a successful switch-role makes:
 *   1. SELECT from users WHERE id = $1
 *   2. SELECT role FROM v_user_roles WHERE user_id = $1
 * Subsequent calls (audit_log insert, requestLogger) fall through to the
 * default no-op resolve set in beforeEach.
 */
function dbSuccessfulSwitch({ userRow = CISO_USER_ROW, roleRows = DUAL_ROLE_ROWS } = {}) {
  mockQuery
    .mockResolvedValueOnce({ rows: [userRow],  rowCount: 1 }) // users lookup
    .mockResolvedValueOnce({ rows: roleRows,   rowCount: roleRows.length }); // v_user_roles
}

function dbUserNotFound() {
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
}

function dbThrows(message = 'DB error') {
  mockQuery.mockRejectedValueOnce(new Error(message));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: any unmocked call (audit_log insert, requestLogger) resolves silently.
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('POST /api/v1/auth/switch-role — authentication', () => {

  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .send({ role: 'risk_analyst' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or malformed/i);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', 'Bearer not.a.jwt')
      .send({ role: 'risk_analyst' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid access token/i);
  });

  test('returns 401 when token is signed with wrong secret', async () => {
    const wrongToken = makeToken(
      { sub: 'uuid', email: 'ciso@example.com', role: 'ciso' },
      'completely-wrong-secret-xxxxxxxxxxxxxxxxxx'
    );

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${wrongToken}`)
      .send({ role: 'risk_analyst' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid access token/i);
  });

  test('returns 401 when token is expired', async () => {
    const expiredToken = makeToken(
      { sub: 'uuid', email: 'ciso@example.com', role: 'ciso' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -1 }
    );

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ role: 'risk_analyst' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

});

// ── Request body validation ───────────────────────────────────────────────────

describe('POST /api/v1/auth/switch-role — body validation', () => {

  test('returns 400 when role is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role is required/i);
  });

  test('returns 400 when role is an empty string', async () => {
    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role is required/i);
  });

});

// ── Role authorisation ────────────────────────────────────────────────────────

describe('POST /api/v1/auth/switch-role — role authorisation', () => {

  test('returns 403 when requested role is not held by the user', async () => {
    // User lookup succeeds, but v_user_roles only returns ciso — not siro.
    mockQuery
      .mockResolvedValueOnce({ rows: [CISO_USER_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ role: 'ciso', source: 'primary' }], rowCount: 1 });

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'siro' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorised/i);
  });

  test('returns 403 when user account is not found', async () => {
    dbUserNotFound();

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'risk_analyst' });

    expect(res.status).toBe(403);
  });

});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/switch-role — success', () => {

  test('returns 200 with access_token, token_type, expires_in, and user', async () => {
    dbSuccessfulSwitch();

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'risk_analyst' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access_token');
    expect(res.body).toHaveProperty('token_type', 'Bearer');
    expect(res.body).toHaveProperty('expires_in');
    expect(res.body).toHaveProperty('user');
  });

  test('user object contains id, email, full_name, role, and roles', async () => {
    dbSuccessfulSwitch();

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'risk_analyst' });

    expect(res.body.user).toMatchObject({
      id:        'user-ciso-uuid',
      email:     'ciso@example.com',
      full_name: 'Chris CISO',
      role:      'risk_analyst',
    });
    expect(Array.isArray(res.body.user.roles)).toBe(true);
  });

  test('new access token payload contains the switched role', async () => {
    dbSuccessfulSwitch();

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'risk_analyst' });

    const decoded = jwt.verify(
      res.body.access_token,
      process.env.JWT_ACCESS_SECRET
    );

    expect(decoded.role).toBe('risk_analyst');
    expect(decoded.sub).toBe('user-ciso-uuid');
  });

  test('roles array in response includes all roles held by the user', async () => {
    dbSuccessfulSwitch();

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'risk_analyst' });

    expect(res.body.user.roles).toContain('ciso');
    expect(res.body.user.roles).toContain('risk_analyst');
  });

  test('switch to own current role is permitted', async () => {
    // Switching to the role you already hold is valid — no business rule against it.
    dbSuccessfulSwitch();

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'ciso' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ciso');
  });

  test('switch is written to audit_log', async () => {
    dbSuccessfulSwitch();

    await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'risk_analyst' });

    // Find the audit_log INSERT among all mock calls.
    const auditCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('audit_log') && sql.includes('INSERT')
    );

    expect(auditCall).toBeDefined();
    // The human_narrative param should mention the switch.
    const params = auditCall[1];
    const narrative = params.find(p => typeof p === 'string' && p.includes('switched'));
    expect(narrative).toBeDefined();
  });

});

// ── Database error handling ───────────────────────────────────────────────────

describe('POST /api/v1/auth/switch-role — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    dbThrows('connection refused');

    const res = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'risk_analyst' });

    expect(res.status).toBe(500);
  });

});