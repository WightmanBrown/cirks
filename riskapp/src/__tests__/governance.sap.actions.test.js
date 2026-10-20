'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — GET /api/v1/governance/sap/actions
 *
 * Proves:
 *   1. Returns 401 when Authorization header is absent.
 *   2. Returns 401 when token is malformed.
 *   3. Returns 401 when token is expired.
 *   4. Returns 403 when role is not ciso.
 *   5. Returns 200 with { actions: [] } when no actions exist.
 *   6. Returns 200 with action rows containing expected fields.
 *   7. Returns 400 on invalid status query param.
 *   8. Returns 200 filtering by ?status=planned.
 *   9. Returns 200 filtering by ?status=overdue.
 *  10. Returns 500 on unexpected database error.
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

const CISO_TOKEN    = makeToken('ciso');
const ANALYST_TOKEN = makeToken('risk_analyst');

const SAMPLE_ACTION = {
  id:                   'action-uuid-1',
  title:                'Patch legacy VPN endpoints',
  status:               'in_progress',
  treatment_type:       'mitigate',
  target_date:          '2026-06-01',
  completed_at:         null,
  requires_siro_signoff: false,
  siro_signoff_at:      null,
  owner_name:           'Alice Smith',
  plan_title:           'FY26 Q1 SAP',
  is_overdue:           false,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/actions — authentication', () => {

  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/v1/governance/sap/actions');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or malformed/i);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/governance/sap/actions')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid access token/i);
  });

  test('returns 401 when token is expired', async () => {
    const expired = makeToken('ciso', { expiresIn: -1 });
    const res = await request(app)
      .get('/api/v1/governance/sap/actions')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

});

// ── Role guard ────────────────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/actions — role guard', () => {

  test('returns 403 when role is risk_analyst', async () => {
    const res = await request(app)
      .get('/api/v1/governance/sap/actions')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 when role is siro', async () => {
    const res = await request(app)
      .get('/api/v1/governance/sap/actions')
      .set('Authorization', `Bearer ${makeToken('siro')}`);
    expect(res.status).toBe(403);
  });

});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/actions — success', () => {

  test('returns 200 with empty actions array when none exist', async () => {
    const res = await request(app)
      .get('/api/v1/governance/sap/actions')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('actions');
    expect(res.body.actions).toEqual([]);
  });

  test('returns 200 with action rows containing expected fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_ACTION], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/governance/sap/actions')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(1);

    const action = res.body.actions[0];
    expect(action).toHaveProperty('id');
    expect(action).toHaveProperty('title');
    expect(action).toHaveProperty('status');
    expect(action).toHaveProperty('treatment_type');
    expect(action).toHaveProperty('target_date');
    expect(action).toHaveProperty('owner_name');
    expect(action).toHaveProperty('plan_title');
    expect(action).toHaveProperty('is_overdue');
  });

  test('returns 200 with filtered results for ?status=planned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...SAMPLE_ACTION, status: 'planned' }], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/governance/sap/actions?status=planned')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(1);
    expect(res.body.actions[0].status).toBe('planned');
  });

  test('returns 200 filtering by ?status=overdue (pseudo-status)', async () => {
    const overdueAction = { ...SAMPLE_ACTION, status: 'in_progress', is_overdue: true, target_date: '2026-01-01' };
    mockQuery.mockResolvedValueOnce({ rows: [overdueAction], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/governance/sap/actions?status=overdue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(1);
  });

});

// ── Validation ────────────────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/actions — input validation', () => {

  test('returns 400 for an invalid status value', async () => {
    const res = await request(app)
      .get('/api/v1/governance/sap/actions?status=bogus')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid status/i);
  });

});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GET /api/v1/governance/sap/actions — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .get('/api/v1/governance/sap/actions')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(500);
  });

});
