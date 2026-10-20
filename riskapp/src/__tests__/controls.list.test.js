'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — GET /api/v1/controls
 *
 * Proves:
 *   1. Returns 401 when Authorization header is absent.
 *   2. Returns 401 when token is malformed.
 *   3. Returns 401 when token is expired.
 *   4. Returns 403 when role is information_asset_owner.
 *   5. Returns 403 when role is siro.
 *   6. Returns 200 for risk_analyst with { controls: [], summary: {...} }.
 *   7. Returns 200 for ciso.
 *   8. Returns 200 for security_consultant.
 *   9. Returns 200 with control rows containing expected fields.
 *  10. Returns 200 filtering by ?framework=iso27001.
 *  11. Returns 200 filtering by ?type=preventive.
 *  12. Returns 200 filtering by ?status=adopted (a derived status, v124).
 *  13. Returns 200 filtering by ?needs_rating=true.
 *  14. Returns 400 on invalid framework value.
 *  15. Returns 400 on invalid type value.
 *  16. Returns 400 on invalid status value.
 *  17. Returns 500 on unexpected database error.
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

const ANALYST_TOKEN    = makeToken('risk_analyst');
const CISO_TOKEN       = makeToken('ciso');
const CONSULTANT_TOKEN = makeToken('security_consultant');
const SIRO_TOKEN       = makeToken('siro');
// meeting_secretary lacks controls.read (IAO/IAM gained it in v84, so they no longer 403 here)
const NO_READ_TOKEN    = makeToken('meeting_secretary');

const SAMPLE_CONTROL = {
  id:                   'ctrl-uuid-1',
  framework:            'iso27001',
  framework_ref:        'A.8.7',
  title:                'Malware Protection',
  description:          'Controls against malware.',
  control_type:         'preventive',
  effectiveness:        4,
  effectiveness_notes:  'AV deployed to all endpoints.',
  status:               'active',
  is_baseline:          true,
  rated_by_name:        'Alice Analyst',
  rated_at:             '2026-01-15T10:00:00Z',
  created_at:           '2026-01-01T09:00:00Z',
};

const SAMPLE_SUMMARY = {
  total: 8, active: 6, under_review: 1,
  ineffective: 1, planned: 0, not_applicable: 0, needs_rating: 1,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('GET /api/v1/controls — authentication', () => {

  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/api/v1/controls');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or malformed/i);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid access token/i);
  });

  test('returns 401 when token is expired', async () => {
    const expired = makeToken('risk_analyst', { expiresIn: -1 });
    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

});

// ── Role guard ────────────────────────────────────────────────────────────────

describe('GET /api/v1/controls — role guard', () => {

  test('returns 403 for a role without controls.read (meeting_secretary)', async () => {
    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${NO_READ_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 for siro', async () => {
    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);
    expect(res.status).toBe(403);
  });

});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('GET /api/v1/controls — success', () => {

  test('returns 200 for risk_analyst with empty controls', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_SUMMARY], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('controls');
    expect(res.body).toHaveProperty('summary');
    expect(res.body.controls).toEqual([]);
    expect(res.body.summary.total).toBe(8);
  });

  test('returns 200 for ciso', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_SUMMARY], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('controls');
  });

  test('returns 200 for security_consultant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_SUMMARY], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${CONSULTANT_TOKEN}`);

    expect(res.status).toBe(200);
  });

  test('returns 200 with control rows containing expected fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_SUMMARY], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.controls).toHaveLength(1);

    const ctrl = res.body.controls[0];
    expect(ctrl).toHaveProperty('id');
    expect(ctrl).toHaveProperty('framework');
    expect(ctrl).toHaveProperty('framework_ref');
    expect(ctrl).toHaveProperty('title');
    expect(ctrl).toHaveProperty('control_type');
    expect(ctrl).toHaveProperty('effectiveness');
    expect(ctrl).toHaveProperty('status');
    expect(ctrl).toHaveProperty('is_baseline');
  });

  test('returns 200 filtering by ?framework=iso27001', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_SUMMARY], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/controls?framework=iso27001')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.controls).toHaveLength(1);
  });

  test('returns 200 filtering by ?type=preventive', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_SUMMARY], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/controls?type=preventive')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
  });

  test('returns 200 filtering by ?status=adopted, against the derived status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_SUMMARY], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/controls?status=adopted')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toMatch(/vcs\.status = \$1/);
    expect(mockQuery.mock.calls[0][1]).toContain('adopted');
  });

  // The retired stored values are refused rather than silently matching nothing.
  test.each(['active', 'under_review', 'ineffective', 'planned'])('returns 400 for the retired status %s', async (st) => {
    const res = await request(app)
      .get(`/api/v1/controls?status=${st}`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(400);
  });

  test('returns 200 filtering by ?needs_rating=true', async () => {
    const unrated = { ...SAMPLE_CONTROL, effectiveness: null, status: 'under_review' };
    mockQuery.mockResolvedValueOnce({ rows: [unrated], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_SUMMARY], rowCount: 1 });

    const res = await request(app)
      .get('/api/v1/controls?needs_rating=true')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.controls).toHaveLength(1);
  });

  test('falls back to empty summary when DB returns no summary row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(0);
    expect(res.body.summary.needs_rating).toBe(0);
  });

});

// ── Validation ────────────────────────────────────────────────────────────────

describe('GET /api/v1/controls — input validation', () => {

  test('returns 400 for a malformed framework code', async () => {
    const res = await request(app)
      .get('/api/v1/controls?framework=Not%20a%20code!')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid standard/i);
  });

  // The filter used to accept only four hard-coded codes, so a standard loaded
  // later (e.g. the fictional tpss_test) could never be filtered on. Any code in
  // the registry is valid now; an unknown one simply matches nothing.
  test('accepts a standard code that is not on any list in the code', async () => {
    const res = await request(app)
      .get('/api/v1/controls?framework=tpss_test')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toContain('tpss_test');
  });

  test('returns 400 for invalid type value', async () => {
    const res = await request(app)
      .get('/api/v1/controls?type=bogus')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid type/i);
  });

  test('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .get('/api/v1/controls?status=bogus')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid status/i);
  });

});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GET /api/v1/controls — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .get('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(500);
  });

});
