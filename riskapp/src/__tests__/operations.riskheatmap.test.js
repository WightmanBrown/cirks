'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — GET /api/v1/operations/risk-heatmap
 *
 * Proves:
 *   1. Returns 401 when Authorization header is absent.
 *   2. Returns 401 when token is malformed or expired.
 *   3. Returns 403 when role is not permitted (e.g. siro, admin).
 *   4. CISO — returns 200 with risks array, no department query.
 *   5. risk_analyst — returns 200 with risks array, no department query.
 *   6. information_asset_manager — looks up department, returns scoped risks.
 *   7. information_asset_owner — looks up department, returns scoped risks.
 *   8. information_asset_manager with no department_id — returns empty risks.
 *   9. Each risk has risk_id, max_probability, max_impact.
 *   10. Returns 500 on unexpected database error.
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
  return (req, res, next) => {
    res.on('finish', () => {});
    next();
  };
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

const CISO_TOKEN      = makeToken('ciso');
const ANALYST_TOKEN   = makeToken('risk_analyst');
const IAM_TOKEN       = makeToken('information_asset_manager');
const BU_TOKEN        = makeToken('information_asset_owner');
const SECRETARY_TOKEN = makeToken('meeting_secretary');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RISK_ROWS = [
  { risk_id: 'risk-001', max_probability: 4, max_impact: 5 },
  { risk_id: 'risk-002', max_probability: 2, max_impact: 3 },
  { risk_id: 'risk-003', max_probability: 5, max_impact: 5 },
];

const DEPT_ROW = { department_id: 'dept-uuid' };

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('GET /api/v1/operations/risk-heatmap — authentication', () => {

  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/v1/operations/risk-heatmap');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or malformed/i);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  test('returns 401 when token is expired', async () => {
    const expired = makeToken('ciso', { expiresIn: -1 });
    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

});

// ── Role guard ────────────────────────────────────────────────────────────────

describe('GET /api/v1/operations/risk-heatmap — role guard', () => {

  test('returns 200 when role is meeting_secretary', async () => {
    mockQuery.mockResolvedValueOnce({ rows: RISK_ROWS });
    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${SECRETARY_TOKEN}`);
    expect(res.status).toBe(200);
  });

  test('returns 403 when role is siro', async () => {
    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${makeToken('siro')}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 when role is admin', async () => {
    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${makeToken('admin')}`);
    expect(res.status).toBe(403);
  });

});

// ── Global roles (ciso, risk_analyst) ────────────────────────────────────────

describe('GET /api/v1/operations/risk-heatmap — global roles', () => {

  test('ciso: returns 200 with risks array', async () => {
    mockQuery.mockResolvedValueOnce({ rows: RISK_ROWS, rowCount: 3 });

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.risks)).toBe(true);
    expect(res.body.risks).toHaveLength(3);
  });

  test('ciso: does not make a department lookup query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: RISK_ROWS, rowCount: 3 });

    await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    // Only one query — the risk SELECT. No user/department lookup.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('risk_analyst: returns 200 with risks array', async () => {
    mockQuery.mockResolvedValueOnce({ rows: RISK_ROWS, rowCount: 3 });

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.risks).toHaveLength(3);
  });

  test('risk_analyst: does not make a department lookup query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: RISK_ROWS, rowCount: 3 });

    await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('returns 200 with empty risks array when no active risks exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.risks).toEqual([]);
  });

});

// ── Department-scoped roles (iam, information_asset_owner) ──────────────────────────────

describe('GET /api/v1/operations/risk-heatmap — department-scoped roles', () => {

  test('information_asset_manager: makes department lookup then returns scoped risks', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [DEPT_ROW], rowCount: 1 })   // dept lookup
      .mockResolvedValueOnce({ rows: RISK_ROWS,  rowCount: 3 });   // risk SELECT

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${IAM_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.risks).toHaveLength(3);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test('information_asset_manager: department lookup uses correct user id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [DEPT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [],         rowCount: 0 });

    await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${IAM_TOKEN}`);

    const deptLookupCall = mockQuery.mock.calls[0];
    expect(deptLookupCall[1]).toContain('user-information_asset_manager-uuid');
  });

  test('information_asset_manager: risk query includes department_id as parameter', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [DEPT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: RISK_ROWS,  rowCount: 3 });

    await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${IAM_TOKEN}`);

    const riskQueryCall = mockQuery.mock.calls[1];
    expect(riskQueryCall[1]).toContain('dept-uuid');
  });

  test('information_asset_owner: makes department lookup then returns scoped risks', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [DEPT_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: RISK_ROWS,  rowCount: 3 });

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${BU_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.risks).toHaveLength(3);
  });

  test('returns empty risks array when user has no department assigned', async () => {
    // department_id is null — no dept row returned
    mockQuery.mockResolvedValueOnce({ rows: [{ department_id: null }], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${IAM_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.risks).toEqual([]);
    // Only one query — the dept lookup. No risk query made.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('returns empty risks array when user row is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${IAM_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.risks).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

});

// ── Response shape ────────────────────────────────────────────────────────────

describe('GET /api/v1/operations/risk-heatmap — response shape', () => {

  test('each risk has risk_id, max_probability, and max_impact', async () => {
    mockQuery.mockResolvedValueOnce({ rows: RISK_ROWS, rowCount: 3 });

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    for (const risk of res.body.risks) {
      expect(risk).toHaveProperty('risk_id');
      expect(risk).toHaveProperty('max_probability');
      expect(risk).toHaveProperty('max_impact');
    }
  });

});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GET /api/v1/operations/risk-heatmap — error handling', () => {

  test('returns 500 on unexpected database error (global role)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(500);
  });

  test('returns 500 on database error during department lookup', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${IAM_TOKEN}`);

    expect(res.status).toBe(500);
  });

  test('returns 500 on database error during risk query (department-scoped)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [DEPT_ROW], rowCount: 1 })
      .mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap')
      .set('Authorization', `Bearer ${IAM_TOKEN}`);

    expect(res.status).toBe(500);
  });

});
