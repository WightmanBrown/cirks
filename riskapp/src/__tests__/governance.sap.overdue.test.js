'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — GET /api/v1/governance/sap/overdue
 *
 * Proves:
 *   1. Returns 401 when Authorization header is absent.
 *   2. Returns 401 when token is malformed.
 *   3. Returns 401 when token is expired.
 *   4. Returns 403 when role is not ciso.
 *   5. Returns 200 with { count } for a valid ciso token.
 *   6. count is a number, not a string (parseInt applied).
 *   7. Returns 200 with count 0 when no overdue actions exist.
 *   8. Returns 500 on unexpected database error.
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

const CISO_TOKEN    = makeToken('ciso');
const ANALYST_TOKEN = makeToken('risk_analyst');

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [{ count: '0' }], rowCount: 1 });
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/overdue — authentication', () => {

  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/v1/governance/sap/overdue');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or malformed/i);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/governance/sap/overdue')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid access token/i);
  });

  test('returns 401 when token is expired', async () => {
    const expired = makeToken('ciso', { expiresIn: -1 });
    const res = await request(app)
      .get('/api/v1/governance/sap/overdue')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

});

// ── Role guard ────────────────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/overdue — role guard', () => {

  test('returns 403 when role is risk_analyst', async () => {
    const res = await request(app)
      .get('/api/v1/governance/sap/overdue')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 when role is siro', async () => {
    const res = await request(app)
      .get('/api/v1/governance/sap/overdue')
      .set('Authorization', `Bearer ${makeToken('siro')}`);
    expect(res.status).toBe(403);
  });

});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/overdue — success', () => {

  test('returns 200 with a count property', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/governance/sap/overdue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count');
  });

  test('count is a number, not a string', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/governance/sap/overdue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(typeof res.body.count).toBe('number');
    expect(res.body.count).toBe(7);
  });

  test('returns count 0 when no overdue actions exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/governance/sap/overdue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/overdue — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .get('/api/v1/governance/sap/overdue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(500);
  });

});
