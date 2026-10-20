'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — GET /api/v1/controls/:id
 *
 * Proves:
 *   1.  Returns 401 when Authorization header is absent.
 *   2.  Returns 401 when token is malformed.
 *   3.  Returns 401 when token is expired.
 *   4.  Returns 403 for information_asset_owner.
 *   5.  Returns 403 for siro.
 *   6.  Returns 200 for risk_analyst with control + threats.
 *   7.  Returns 200 for ciso.
 *   8.  Returns 200 for security_consultant.
 *   9.  Control response contains all expected fields.
 *  10.  Threat linkages are included and contain expected fields.
 *  11.  Returns 200 with empty threats array when no linkages exist.
 *  12.  Returns 404 when control id does not exist.
 *  13.  Returns 500 on unexpected database error.
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

const CONTROL_ID = 'ctrl-uuid-1';

const SAMPLE_CONTROL = {
  id:                   CONTROL_ID,
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
  created_by_name:      'Admin User',
  created_at:           '2026-01-01T09:00:00Z',
  updated_at:           '2026-01-15T10:00:00Z',
};

const SAMPLE_THREAT = {
  id:             'ct-uuid-1',
  mitigates_c:    true,
  mitigates_i:    false,
  mitigates_a:    false,
  notes:          'Reduces likelihood of malware exfiltration.',
  threat_id:      'threat-uuid-1',
  threat_name:    'Malware / Ransomware',
  threat_category: 'malicious_code',
  threat_source:  'external',
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('GET /api/v1/controls/:id — authentication', () => {

  test('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get(`/api/v1/controls/${CONTROL_ID}`);
    expect(res.status).toBe(401);
  });

  test('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  test('returns 401 when token is expired', async () => {
    const expired = makeToken('risk_analyst', { expiresIn: -1 });
    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

});

// ── Role guard ────────────────────────────────────────────────────────────────

describe('GET /api/v1/controls/:id — role guard', () => {

  test('returns 403 for a role without controls.read (meeting_secretary)', async () => {
    // IAO/IAM gained controls.read in v84, so they no longer 403 here.
    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${makeToken('meeting_secretary')}`);
    expect(res.status).toBe(403);
  });

  test('returns 403 for siro', async () => {
    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${makeToken('siro')}`);
    expect(res.status).toBe(403);
  });

});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('GET /api/v1/controls/:id — success', () => {

  test('returns 200 for risk_analyst with control and threats', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_THREAT],  rowCount: 1 });

    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('control');
    expect(res.body).toHaveProperty('threats');
  });

  test('returns 200 for ciso', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [],               rowCount: 0 });

    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`);

    expect(res.status).toBe(200);
  });

  test('returns 200 for security_consultant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [],               rowCount: 0 });

    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${CONSULTANT_TOKEN}`);

    expect(res.status).toBe(200);
  });

  test('control contains all expected fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [],               rowCount: 0 });

    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    const ctrl = res.body.control;
    expect(ctrl).toHaveProperty('id');
    expect(ctrl).toHaveProperty('framework');
    expect(ctrl).toHaveProperty('framework_ref');
    expect(ctrl).toHaveProperty('title');
    expect(ctrl).toHaveProperty('description');
    expect(ctrl).toHaveProperty('control_type');
    expect(ctrl).toHaveProperty('effectiveness');
    expect(ctrl).toHaveProperty('effectiveness_notes');
    expect(ctrl).toHaveProperty('status');
    expect(ctrl).toHaveProperty('is_baseline');
    expect(ctrl).toHaveProperty('rated_by_name');
    expect(ctrl).toHaveProperty('rated_at');
    expect(ctrl).toHaveProperty('created_by_name');
    expect(ctrl).toHaveProperty('created_at');
  });

  test('threat linkages contain expected fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_THREAT],  rowCount: 1 });

    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.body.threats).toHaveLength(1);
    const threat = res.body.threats[0];
    expect(threat).toHaveProperty('threat_name');
    expect(threat).toHaveProperty('threat_category');
    expect(threat).toHaveProperty('threat_source');
    expect(threat).toHaveProperty('mitigates_c');
    expect(threat).toHaveProperty('mitigates_i');
    expect(threat).toHaveProperty('mitigates_a');
  });

  test('returns empty threats array when no linkages exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_CONTROL], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [],               rowCount: 0 });

    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.threats).toEqual([]);
  });

});

// ── Not found ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/controls/:id — not found', () => {

  test('returns 404 when control does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/controls/non-existent-uuid')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

});

// ── Error handling ────────────────────────────────────────────────────────────

describe('GET /api/v1/controls/:id — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .get(`/api/v1/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(500);
  });

});
