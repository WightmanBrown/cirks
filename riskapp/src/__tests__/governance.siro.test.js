'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration tests — SIRO governance endpoints
 *
 * GET /api/v1/governance/siro/cycles/pending
 *   1. Returns 401 when Authorization header is absent.
 *   2. Returns 401 when token is malformed.
 *   3. Returns 401 when token is expired.
 *   4. Returns 403 when role is ciso.
 *   5. Returns 403 when role is risk_analyst.
 *   6. Returns 200 with { count: 0 } when no cycles pending.
 *   7. Returns 200 with count as a number.
 *   8. Returns 500 on unexpected database error.
 *
 * GET /api/v1/governance/siro/actions/pending
 *   9.  Returns 403 when role is ciso.
 *  10.  Returns 200 with { count: 0 } when no actions pending.
 *  11.  Returns 200 with count as a number.
 *  12.  Returns 500 on unexpected database error.
 */

const request = require('supertest');
const jwt     = require('jsonwebtoken');

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
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

// ── App under test ────────────────────────────────────────────────────────────

const createApp = require('../app');
const app       = createApp();

// ── Token factory ─────────────────────────────────────────────────────────────

function makeToken(role, opts = {}) {
  return jwt.sign(
    { sub: `user-${role}-uuid`, email: `${role}@example.com`, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m', ...opts }
  );
}

const SIRO_TOKEN    = makeToken('siro');
const CISO_TOKEN    = makeToken('ciso');
const ANALYST_TOKEN = makeToken('risk_analyst');

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [{ count: '0' }], rowCount: 1 });
});

// ── /siro/cycles/pending ──────────────────────────────────────────────────────

describe('GET /api/v1/governance/siro/cycles/pending — authentication', () => {

  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/v1/governance/siro/cycles/pending');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or malformed/i);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/governance/siro/cycles/pending')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid access token/i);
  });

  test('returns 401 when token is expired', async () => {
    const expired = makeToken('siro', { expiresIn: -1 });
    const res = await request(app)
      .get('/api/v1/governance/siro/cycles/pending')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

});

describe('GET /api/v1/governance/siro/cycles/pending — role guard', () => {

  test('returns 403 when role is ciso', async () => {
    const res = await request(app)
      .get('/api/v1/governance/siro/cycles/pending')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 when role is risk_analyst', async () => {
    const res = await request(app)
      .get('/api/v1/governance/siro/cycles/pending')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(403);
  });

});

describe('GET /api/v1/governance/siro/cycles/pending — success', () => {

  test('returns 200 with count 0 when no cycles are under review', async () => {
    const res = await request(app)
      .get('/api/v1/governance/siro/cycles/pending')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count', 0);
  });

  test('count is a number, not a string', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/governance/siro/cycles/pending')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');
    expect(res.body.count).toBe(3);
  });

});

describe('GET /api/v1/governance/siro/cycles/pending — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app)
      .get('/api/v1/governance/siro/cycles/pending')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);
    expect(res.status).toBe(500);
  });

});

// ── /siro/actions/pending ─────────────────────────────────────────────────────

describe('GET /api/v1/governance/siro/actions/pending — role guard', () => {

  test('returns 403 when role is ciso', async () => {
    const res = await request(app)
      .get('/api/v1/governance/siro/actions/pending')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(403);
  });

});

describe('GET /api/v1/governance/siro/actions/pending — success', () => {

  test('returns 200 with count 0 when no actions need sign-off', async () => {
    const res = await request(app)
      .get('/api/v1/governance/siro/actions/pending')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count', 0);
  });

  test('count is a number, not a string', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/governance/siro/actions/pending')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');
    expect(res.body.count).toBe(5);
  });

});

describe('GET /api/v1/governance/siro/actions/pending — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app)
      .get('/api/v1/governance/siro/actions/pending')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);
    expect(res.status).toBe(500);
  });

});
