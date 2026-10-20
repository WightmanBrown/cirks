// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// riskapp/src/__tests__/operations.riskheatmapdetail.test.js
'use strict';

/**
 * Tests for:
 *   GET /api/v1/operations/risk-heatmap/current
 *   GET /api/v1/operations/risk-heatmap/future
 *
 * Coverage:
 *   - 401 when unauthenticated or malformed token
 *   - 403 for roles without access (siro)
 *   - 200 + correct shape for global roles (ciso, risk_analyst)
 *   - 200 + department-scoped response for dept roles (iam, information_asset_owner)
 *   - current only returns validated risks
 *   - future only returns pending/returned risks
 *   - mitigation_status is one of the expected enum values or null
 *   - count field matches risks array length
 *   - iam with no department_id returns empty risks array
 *
 * All DB calls are mocked — no real database connection required.
 * The requestLogger middleware is also mocked to prevent it consuming
 * mockQuery calls and breaking call-count assertions.
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

// ── Mock requestLogger so it doesn't consume mockQuery calls ──────────────────

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

function makeToken(role, sub, opts = {}) {
  return jwt.sign(
    { sub: sub ?? `user-${role}-uuid`, email: `${role}@example.com`, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m', ...opts }
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALIDATED_RISKS = [
  {
    risk_id: 'risk-001', system_name: 'ERP', asset_name: 'Finance Data',
    threat_name: 'Ransomware', department: 'Finance',
    prob_c: 4, prob_i: 3, prob_a: 2,
    impact_c: 5, impact_i: 4, impact_a: 3,
    mitigation_title: 'Patch cycle', mitigation_status: 'in_progress',
  },
  {
    risk_id: 'risk-002', system_name: 'CRM', asset_name: 'Customer Records',
    threat_name: 'Phishing', department: 'Sales',
    prob_c: 2, prob_i: 2, prob_a: 1,
    impact_c: 3, impact_i: 3, impact_a: 2,
    mitigation_title: null, mitigation_status: null,
  },
];

const PENDING_RISKS = [
  {
    risk_id: 'risk-003', system_name: 'HR System', asset_name: 'HR Records',
    threat_name: 'Insider Threat', department: 'HR',
    prob_c: 3, prob_i: 3, prob_a: 3,
    impact_c: 4, impact_i: 4, impact_a: 4,
    mitigation_title: 'Access review', mitigation_status: 'planned',
  },
];

const DEPT_RISKS = [
  {
    risk_id: 'risk-004', system_name: 'ERP', asset_name: 'Finance Data',
    threat_name: 'Ransomware', department: 'Finance',
    prob_c: 4, prob_i: 3, prob_a: 2,
    impact_c: 5, impact_i: 4, impact_a: 3,
    mitigation_title: null, mitigation_status: null,
  },
];

const REQUIRED_FIELDS = [
  'risk_id', 'system_name', 'asset_name', 'threat_name', 'department',
  'prob_c', 'prob_i', 'prob_a',
  'impact_c', 'impact_i', 'impact_a',
  'mitigation_title', 'mitigation_status',
];

const VALID_MITIGATION_STATUSES = ['planned', 'in_progress', 'deferred', null];

const ENDPOINTS = [
  '/api/v1/operations/risk-heatmap/current',
  '/api/v1/operations/risk-heatmap/future',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockGlobalRisks(risks) {
  mockQuery.mockResolvedValueOnce({ rows: risks, rowCount: risks.length });
}

function mockDeptRisks(deptId, risks) {
  // First call: user dept lookup
  mockQuery.mockResolvedValueOnce({ rows: [{ department_id: deptId }], rowCount: 1 });
  // Second call: scoped risk query
  mockQuery.mockResolvedValueOnce({ rows: risks, rowCount: risks.length });
}

function mockNoDept() {
  // User has no department_id
  mockQuery.mockResolvedValueOnce({ rows: [{ department_id: null }], rowCount: 1 });
}

function mockUserNotFound() {
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/operations/risk-heatmap/current and /future', () => {

  beforeEach(() => {
    mockQuery.mockReset();
  });

  // ── authentication ──────────────────────────────────────────────────────────

  describe('authentication', () => {
    test.each(ENDPOINTS)('%s — 401 with no token', async (endpoint) => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    });

    test.each(ENDPOINTS)('%s — 401 with malformed token', async (endpoint) => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', 'Bearer not-a-token');
      expect(res.status).toBe(401);
    });
  });

  // ── role access ─────────────────────────────────────────────────────────────

  describe('role access', () => {
    // admin joined the global roles in v109: it already held risks.read and
    // every other cross-department read, so the risk register was the one page
    // an administrator could not open.
    const GLOBAL_ROLES    = ['admin', 'ciso', 'risk_analyst', 'meeting_secretary'];
    const DEPT_ROLES      = ['information_asset_manager', 'information_asset_owner'];
    const FORBIDDEN_ROLES = ['siro'];

    test.each(
      ENDPOINTS.flatMap(ep => GLOBAL_ROLES.map(role => [ep, role]))
    )('%s — 200 for global role %s', async (endpoint, role) => {
      mockGlobalRisks(VALIDATED_RISKS);
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${makeToken(role)}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('risks');
      expect(Array.isArray(res.body.risks)).toBe(true);
    });

    test.each(
      ENDPOINTS.flatMap(ep => DEPT_ROLES.map(role => [ep, role]))
    )('%s — 200 for dept role %s', async (endpoint, role) => {
      mockDeptRisks('dept-finance-uuid', DEPT_RISKS);
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${makeToken(role)}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('risks');
      expect(Array.isArray(res.body.risks)).toBe(true);
    });

    test.each(
      ENDPOINTS.flatMap(ep => FORBIDDEN_ROLES.map(role => [ep, role]))
    )('%s — 403 for role %s', async (endpoint, role) => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${makeToken(role)}`);
      expect(res.status).toBe(403);
    });
  });

  // ── response shape ──────────────────────────────────────────────────────────

  describe('response shape', () => {
    test.each(ENDPOINTS)('%s — each risk has all required fields', async (endpoint) => {
      mockGlobalRisks(VALIDATED_RISKS);
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${makeToken('ciso')}`);

      expect(res.status).toBe(200);

      for (const risk of res.body.risks) {
        for (const field of REQUIRED_FIELDS) {
          expect(risk).toHaveProperty(field);
        }
        for (const field of ['prob_c', 'prob_i', 'prob_a', 'impact_c', 'impact_i', 'impact_a']) {
          if (risk[field] !== null) {
            expect(risk[field]).toBeGreaterThanOrEqual(1);
            expect(risk[field]).toBeLessThanOrEqual(5);
          }
        }
        expect(VALID_MITIGATION_STATUSES).toContain(risk.mitigation_status);
      }
    });

    test('count field matches risks array length', async () => {
      mockGlobalRisks(VALIDATED_RISKS);
      const res = await request(app)
        .get('/api/v1/operations/risk-heatmap/current')
        .set('Authorization', `Bearer ${makeToken('ciso')}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(res.body.risks.length);
    });
  });

  // ── validation_status filtering ─────────────────────────────────────────────

  describe('validation_status filtering', () => {
    test('current — query uses validated status clause', async () => {
      mockGlobalRisks(VALIDATED_RISKS);
      await request(app)
        .get('/api/v1/operations/risk-heatmap/current')
        .set('Authorization', `Bearer ${makeToken('ciso')}`);

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toMatch(/validation_status\s*=\s*'validated'/);
    });

    test('future — query uses pending/returned status clause', async () => {
      mockGlobalRisks(PENDING_RISKS);
      await request(app)
        .get('/api/v1/operations/risk-heatmap/future')
        .set('Authorization', `Bearer ${makeToken('ciso')}`);

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toMatch(/validation_status\s+IN\s*\('pending',\s*'returned'\)/);
    });
  });

  // ── department scoping ──────────────────────────────────────────────────────

  describe('department scoping', () => {
    test('iam — dept lookup uses correct user id from token', async () => {
      mockDeptRisks('dept-finance-uuid', DEPT_RISKS);
      await request(app)
        .get('/api/v1/operations/risk-heatmap/current')
        .set('Authorization', `Bearer ${makeToken('information_asset_manager', 'user-iam-uuid')}`);

      const deptLookupCall = mockQuery.mock.calls[0];
      expect(deptLookupCall[1][0]).toBe('user-iam-uuid');
    });

    test('iam — risk query includes department_id as parameter', async () => {
      mockDeptRisks('dept-finance-uuid', DEPT_RISKS);
      await request(app)
        .get('/api/v1/operations/risk-heatmap/current')
        .set('Authorization', `Bearer ${makeToken('information_asset_manager')}`);

      const riskQueryCall = mockQuery.mock.calls[1];
      expect(riskQueryCall[1]).toContain('dept-finance-uuid');
    });

    test('iam — returns only risks for own department', async () => {
      mockDeptRisks('dept-finance-uuid', DEPT_RISKS);
      const res = await request(app)
        .get('/api/v1/operations/risk-heatmap/current')
        .set('Authorization', `Bearer ${makeToken('information_asset_manager')}`);

      expect(res.status).toBe(200);
      expect(res.body.risks).toHaveLength(DEPT_RISKS.length);
      for (const risk of res.body.risks) {
        expect(risk.department).toBe('Finance');
      }
    });

    test('iam with no department — returns empty risks array', async () => {
      mockNoDept();
      const res = await request(app)
        .get('/api/v1/operations/risk-heatmap/current')
        .set('Authorization', `Bearer ${makeToken('information_asset_manager', '00000000-0000-0000-0000-000000000000')}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.risks).toHaveLength(0);
    });

    test('iam with user not found — returns empty risks array', async () => {
      mockUserNotFound();
      const res = await request(app)
        .get('/api/v1/operations/risk-heatmap/current')
        .set('Authorization', `Bearer ${makeToken('information_asset_manager')}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.risks).toHaveLength(0);
    });
  });

  // ── error handling ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    test('returns 500 on unexpected database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));
      const res = await request(app)
        .get('/api/v1/operations/risk-heatmap/current')
        .set('Authorization', `Bearer ${makeToken('ciso')}`);

      expect(res.status).toBe(500);
    });
  });

});