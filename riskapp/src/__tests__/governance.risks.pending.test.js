'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — GET /api/v1/governance/risks/pending
 *
 * What this proves (the vertical slice):
 *   1. The Express app mounts and responds.
 *   2. authenticate() rejects missing / malformed / expired tokens with 401.
 *   3. requireRole('ciso') rejects non-CISO roles with 403.
 *   4. A valid CISO token reaches the controller.
 *   5. The controller queries v_pending_risks and returns { count, risks }.
 *   6. Optional ?status filter is validated — bad values return 400.
 *
 * Database:
 *   The pg pool is mocked so no live database is required.
 *   The mock returns a realistic v_pending_risks row shape.
 *
 * Auth:
 *   Tokens are signed with the test secrets set in setup.js.
 *   No refresh token or login endpoint is exercised here — those get their
 *   own test file when the auth routes are unit-tested.
 */

const request = require('supertest');
const jwt     = require('jsonwebtoken');

// ── Mock the pg pool before any app module loads ──────────────────────────────
// Jest hoists jest.mock() calls, so this mock is in place before require('./app').

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return {
    pool:  { query: mockQuery, on: jest.fn() },
    query: mockQuery,
  };
});

// Grab the mock reference so individual tests can configure it.
const { query: mockQuery } = require('../db/pool');

// ── App under test ────────────────────────────────────────────────────────────

const createApp = require('../app');
const app       = createApp();

// ── Token factory ─────────────────────────────────────────────────────────────

function makeToken(payload, secret = process.env.JWT_ACCESS_SECRET, opts = {}) {
  return jwt.sign(payload, secret, { expiresIn: '15m', ...opts });
}

const CISO_TOKEN = makeToken({ sub: 'user-ciso-uuid', email: 'ciso@example.com', role: 'ciso' });
const ANALYST_TOKEN = makeToken({ sub: 'user-analyst-uuid', email: 'analyst@example.com', role: 'risk_analyst' });
const SIRO_TOKEN = makeToken({ sub: 'user-siro-uuid', email: 'siro@example.com', role: 'siro' });

// ── Fixture — representative v_pending_risks row ──────────────────────────────

const PENDING_ROW = {
  risk_id:           'risk-uuid-001',
  department_id:     'dept-uuid-001',
  department:        'Finance',
  asset_id:          'asset-uuid-001',
  asset_name:        'Payroll Data',
  system_name:       'HR System',
  threat_name:       'Unauthorised Access',
  threat_category:   'human',
  rationale:         'High-privilege accounts with no MFA on a system processing payroll data.',
  validation_status: 'pending',
  validation_notes:  null,
  last_actioned_by:  null,
  last_actioned_at:  null,
  identified_by:     'Jane Analyst',
  identified_at:     '2025-03-01T09:00:00.000Z',
};

const RETURNED_ROW = {
  ...PENDING_ROW,
  risk_id:           'risk-uuid-002',
  validation_status: 'returned',
  validation_notes:  'Rationale insufficient — please detail the specific access paths.',
  last_actioned_by:  'Chris CISO',
  last_actioned_at:  '2025-03-10T14:30:00.000Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function dbReturns(rows) {
  mockQuery.mockResolvedValueOnce({ rows, rowCount: rows.length });
}

function dbThrows(message = 'DB error') {
  mockQuery.mockRejectedValueOnce(new Error(message));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // requestLogger fires a DB insert on every response. Give it a default
  // no-op resolve so it doesn't interfere with assertions below.
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('GET /api/v1/governance/risks/pending — authentication', () => {

  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app)
      .get('/api/v1/governance/risks/pending');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing or malformed/i);
  });

  test('returns 401 when token is malformed (not a JWT)', async () => {
    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', 'Bearer not.a.jwt');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid access token/i);
  });

  test('returns 401 when token is signed with wrong secret', async () => {
    const wrongToken = makeToken(
      { sub: 'uuid', email: 'x@x.com', role: 'ciso' },
      'completely-wrong-secret-xxxxxxxxxxxxxxxxxx'
    );

    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${wrongToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid access token/i);
  });

  test('returns 401 when token is expired', async () => {
    const expiredToken = makeToken(
      { sub: 'uuid', email: 'ciso@example.com', role: 'ciso' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -1 }   // already expired
    );

    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

});

// ── Role guard ────────────────────────────────────────────────────────────────

describe('GET /api/v1/governance/risks/pending — role enforcement', () => {

  test('returns 403 for risk_analyst role', async () => {
    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(403);
    // Guard migrated to capability-based RBAC (Phase 2): 403 body now names the
    // missing capability rather than the role.
    expect(res.body.error).toMatch(/capability|governance\.review/i);
  });

  test('returns 403 for siro role', async () => {
    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${SIRO_TOKEN}`);

    expect(res.status).toBe(403);
  });

  test('returns 403 for information_asset_manager role', async () => {
    const iamToken = makeToken({ sub: 'uuid', email: 'iam@x.com', role: 'information_asset_manager' });

    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${iamToken}`);

    expect(res.status).toBe(403);
  });

});

// ── Controller — happy paths ──────────────────────────────────────────────────

describe('GET /api/v1/governance/risks/pending — controller', () => {

  test('returns 200 with count and risks array for valid CISO token', async () => {
    // First call: the data query. Subsequent calls: requestLogger insert.
    mockQuery
      .mockResolvedValueOnce({ rows: [PENDING_ROW, RETURNED_ROW], rowCount: 2 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.risks).toHaveLength(2);
  });

  test('response body contains expected v_pending_risks fields', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PENDING_ROW], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    const risk = res.body.risks[0];

    // Assert every column v_pending_risks exposes is present in the response.
    const expectedFields = [
      'risk_id', 'department_id', 'department', 'asset_id', 'asset_name',
      'system_name', 'threat_name', 'threat_category', 'rationale',
      'validation_status', 'validation_notes', 'last_actioned_by',
      'last_actioned_at', 'identified_by', 'identified_at',
    ];

    expectedFields.forEach(field => {
      expect(risk).toHaveProperty(field);
    });
  });

  test('returns empty array when no risks are pending', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.risks).toEqual([]);
  });

  test('?status=pending filter is forwarded to query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PENDING_ROW], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/governance/risks/pending?status=pending')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);

    // Confirm the data query included the param.
    const dataCall = mockQuery.mock.calls[0];
    expect(dataCall[1]).toContain('pending'); // params array contains the value
  });

  test('?status=returned filter is forwarded to query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [RETURNED_ROW], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/governance/risks/pending?status=returned')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.risks[0].validation_status).toBe('returned');
  });

  test('?status= with invalid value returns 400', async () => {
    const res = await request(app)
      .get('/api/v1/governance/risks/pending?status=validated')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid status/i);
  });

  test('?department_id filter is accepted', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [PENDING_ROW], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/governance/risks/pending?department_id=dept-uuid-001')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);

    const dataCall = mockQuery.mock.calls[0];
    expect(dataCall[1]).toContain('dept-uuid-001');
  });

  test('returns 500 when database query throws', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/governance/risks/pending')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(500);
  });

});

// ── Route existence ───────────────────────────────────────────────────────────

describe('Route surface sanity checks', () => {

  test('GET /health returns 200 without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/v1/operations returns 200 (operations stub)', async () => {
    const res = await request(app).get('/api/v1/operations');
    expect(res.status).toBe(200);
  });

  test('unknown route returns 404', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
  });

});
