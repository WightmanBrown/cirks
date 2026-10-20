'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — GET /api/v1/actions/acceptance-queue
 *
 * Proves:
 *   1. Returns 401 when Authorization header is absent.
 *   2. Returns 401 when token is malformed.
 *   3. Returns 403 for non-SWG roles (risk_analyst, meeting_secretary).
 *   4. Returns 200 with { count, actions } for ciso.
 *   5. Returns 200 for siro.
 *   6. Returns 200 for admin.
 *   7. Returns 200 with empty actions when queue is clear.
 *   8. Returns 200 with expected fields on each action row.
 *   9. Returns 500 on unexpected database error.
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

function makeToken(role) {
  return jwt.sign(
    { sub: `user-${role}-uuid`, email: `${role}@example.com`, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

const CISO_TOKEN      = makeToken('ciso');
const SIRO_TOKEN      = makeToken('siro');
const ADMIN_TOKEN     = makeToken('admin');
const ANALYST_TOKEN   = makeToken('risk_analyst');
const SEC_TOKEN       = makeToken('meeting_secretary');

// ── Fixture ───────────────────────────────────────────────────────────────────

const ACTION_ROW = {
  action_id:              'action-uuid-1',
  action_title:           'Patch public API endpoints',
  action_description:     'Apply input validation and rate limiting.',
  target_date:            '2026-09-01',
  created_at:             '2026-05-01T10:00:00Z',
  owner_name:             'Alice Analyst',
  risk_id:                'risk-uuid-1',
  current_p_c:            4, current_p_i: 4, current_p_a: 4,
  current_imp_c:          4, current_imp_i: 4, current_imp_a: 4,
  threat_name:            'SQL Injection',
  system_id:              'system-uuid-1',
  system_name:            'Public API Gateway',
  department_name:        'Engineering',
  // Item summary — what the CISO is being asked to commit to.
  item_count:             3,
  control_count:          2,
  component_count:        1,
  system_count:           1,
  target_p_c:             2, target_p_i: 2, target_p_a: 2,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/v1/actions/acceptance-queue — auth', () => {
  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/v1/actions/acceptance-queue');
    expect(res.status).toBe(401);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });
});

// ── Role guard ────────────────────────────────────────────────────────────────

describe('GET /api/v1/actions/acceptance-queue — role guard', () => {
  test('returns 403 for risk_analyst', async () => {
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 for meeting_secretary', async () => {
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${SEC_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('returns 200 for ciso', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(200);
  });

  test('returns 200 for siro', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);
    expect(res.status).toBe(200);
  });

  test('returns 200 for admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
  });
});

// ── Response shape ────────────────────────────────────────────────────────────

describe('GET /api/v1/actions/acceptance-queue — response shape', () => {
  test('returns { count: 0, actions: [] } when queue is clear', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 0, actions: [] });
  });

  test('count reflects number of rows returned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ACTION_ROW, ACTION_ROW] });
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.actions).toHaveLength(2);
  });

  test('each row contains expected fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ACTION_ROW] });
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(200);
    const a = res.body.actions[0];
    expect(a).toHaveProperty('action_id');
    expect(a).toHaveProperty('action_title');
    expect(a).toHaveProperty('risk_id');
    expect(a).toHaveProperty('system_name');
    expect(a).toHaveProperty('threat_name');
    expect(a).toHaveProperty('owner_name');
    // Item summary replaces the retired per-action target_residual_* block.
    expect(a).toHaveProperty('item_count');
    expect(a).toHaveProperty('control_count');
    expect(a).toHaveProperty('component_count');
    expect(a).toHaveProperty('target_p_c');
    expect(a).not.toHaveProperty('target_residual_p_c');
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GET /api/v1/actions/acceptance-queue — error handling', () => {
  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app)
      .get('/api/v1/actions/acceptance-queue')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(500);
  });
});
