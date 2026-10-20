'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — PATCH /api/v1/controls/:id/rate
 *
 * Proves:
 *   1.  Returns 401 when unauthenticated.
 *   2.  Returns 403 for security_consultant (view-only).
 *   3.  Returns 403 for siro.
 *   4.  Returns 400 when effectiveness is missing.
 *   5.  Returns 400 when effectiveness is out of range (0, 6).
 *   6.  Returns 400 when effectiveness_notes is missing.
 *   7.  Returns 400 when effectiveness_notes is blank.
 *   8.  Returns 404 when control does not exist.
 *   9.  Returns 200 for risk_analyst with updated control fields.
 *  10.  Returns 200 for ciso.
 *  11.  Returns 200 for admin.
 *  12.  Response contains effectiveness, effectiveness_notes, rated_at, rated_by_name.
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

function makeToken(role) {
  return jwt.sign(
    { sub: `user-${role}-uuid`, email: `${role}@example.com`, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

const ANALYST_TOKEN    = makeToken('risk_analyst');
const CISO_TOKEN       = makeToken('ciso');
const ADMIN_TOKEN      = makeToken('admin');
const CONSULTANT_TOKEN = makeToken('security_consultant');
const SIRO_TOKEN       = makeToken('siro');

const CONTROL_ID = 'ctrl-uuid-rate-1';

const VALID_BODY = {
  effectiveness:       4,
  effectiveness_notes: 'AV deployed to all endpoints; detection rate >99%.',
};

const UPDATED_CONTROL = {
  id:                  CONTROL_ID,
  effectiveness:       4,
  effectiveness_notes: VALID_BODY.effectiveness_notes,
  rated_at:            '2026-05-08T12:00:00Z',
  rated_by_name:       'Alice Analyst',
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Auth guard ────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/controls/:id/rate — authentication', () => {

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });

});

// ── Role guard ────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/controls/:id/rate — role guard', () => {

  test('returns 403 for security_consultant', async () => {
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${CONSULTANT_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  test('returns 403 for siro', async () => {
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${SIRO_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

});

// ── Validation ────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/controls/:id/rate — validation', () => {

  test('returns 400 when effectiveness is missing', async () => {
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ effectiveness_notes: 'Some notes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/effectiveness/i);
  });

  test('returns 400 when effectiveness is 0', async () => {
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ effectiveness: 0, effectiveness_notes: 'Notes' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when effectiveness is 6', async () => {
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ effectiveness: 6, effectiveness_notes: 'Notes' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when effectiveness_notes is missing', async () => {
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ effectiveness: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notes/i);
  });

  test('returns 400 when effectiveness_notes is blank', async () => {
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ effectiveness: 3, effectiveness_notes: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notes/i);
  });

});

// ── Not found ─────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/controls/:id/rate — not found', () => {

  test('returns 404 when control does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .patch('/api/v1/controls/no-such-id/rate')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/controls/:id/rate — success', () => {

  test('returns 200 for risk_analyst', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [UPDATED_CONTROL], rowCount: 1 });
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(200);
  });

  test('returns 200 for ciso', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [UPDATED_CONTROL], rowCount: 1 });
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(200);
  });

  test('returns 200 for admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [UPDATED_CONTROL], rowCount: 1 });
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(200);
  });

  test('response contains expected rating fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [UPDATED_CONTROL], rowCount: 1 });
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(VALID_BODY);
    const ctrl = res.body.control;
    expect(ctrl).toHaveProperty('effectiveness', 4);
    expect(ctrl).toHaveProperty('effectiveness_notes');
    expect(ctrl).toHaveProperty('rated_at');
    expect(ctrl).toHaveProperty('rated_by_name');
  });

  // The lifecycle promotion (under_review -> active on rating an applicable control)
  // is enforced SQL-side; assert the wiring is present in the UPDATE.
  test('rating writes no status: it is derived, and reported from the SoA entry (v124)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...UPDATED_CONTROL, status: 'adopted' }], rowCount: 1 });
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.control).toHaveProperty('status', 'adopted');
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).not.toMatch(/SET[\s\S]*\bstatus\s*=/i);
    expect(sql).toMatch(/soa_entries/);
  });

});

// ── Error handling ────────────────────────────────────────────────────────────

describe('PATCH /api/v1/controls/:id/rate — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app)
      .patch(`/api/v1/controls/${CONTROL_ID}/rate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(500);
  });

});
