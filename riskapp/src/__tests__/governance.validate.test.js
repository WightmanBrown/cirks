'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — POST /api/v1/governance/risks/:id/validate
 *
 * Proves:
 *   1. authenticate() and requireRole('ciso') gate the route correctly.
 *   2. Request body is validated — missing action, invalid action, missing notes.
 *   3. validate_risk() is called with correct params on action='validate'.
 *   4. return_risk() is called with correct params on action='return'.
 *   5. Stored function exceptions map to correct HTTP status codes:
 *      - 'not found'            → 404
 *      - 'already validated'    → 409
 *      - 'validation_notes mandatory' → 400
 *   6. 204 is returned on success with no body.
 *   7. Unexpected DB errors are passed to the global error handler (500).
 */

const request = require('supertest');
const jwt     = require('jsonwebtoken');

// ── Mock pg pool before any app module loads ──────────────────────────────────

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

function makeToken(payload, secret = process.env.JWT_ACCESS_SECRET) {
  return jwt.sign(payload, secret, { expiresIn: '15m' });
}

const CISO_TOKEN     = makeToken({ sub: 'ciso-uuid-001', email: 'ciso@example.com', role: 'ciso' });
const ANALYST_TOKEN  = makeToken({ sub: 'analyst-uuid', email: 'analyst@example.com', role: 'risk_analyst' });

const RISK_ID = '92e09acc-3043-5b27-acfe-5ba874049fdc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dbSucceeds() {
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
}

function dbThrowsMessage(message) {
  mockQuery.mockRejectedValueOnce(new Error(message));
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: requestLogger insert succeeds silently.
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Authentication & role guard ───────────────────────────────────────────────

describe('POST /api/v1/governance/risks/:id/validate — auth & role', () => {

  test('returns 401 with no token', async () => {
    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .send({ action: 'validate' });

    expect(res.status).toBe(401);
  });

  test('returns 403 for risk_analyst role', async () => {
    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ action: 'validate' });

    expect(res.status).toBe(403);
  });

});

// ── Request body validation ───────────────────────────────────────────────────

describe('POST /api/v1/governance/risks/:id/validate — body validation', () => {

  test('returns 400 when action is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/action is required/i);
  });

  test('returns 400 when action is invalid', async () => {
    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/action is required/i);
  });

  test('returns 400 when action is return but notes are missing', async () => {
    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'return' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notes are required/i);
  });

  test('returns 400 when action is return but notes are empty string', async () => {
    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'return', notes: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notes are required/i);
  });

});

// ── Happy paths ───────────────────────────────────────────────────────────────

describe('POST /api/v1/governance/risks/:id/validate — success', () => {

  test('action=validate calls validate_risk with correct params and returns 204', async () => {
    dbSucceeds();

    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'validate' });

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    // Confirm the stored function was called with the right args.
    const dataCall = mockQuery.mock.calls[0];
    expect(dataCall[0]).toContain('validate_risk');
    expect(dataCall[1]).toEqual([RISK_ID, 'ciso-uuid-001']);
  });

  test('action=return calls return_risk with correct params and returns 204', async () => {
    dbSucceeds();

    const notes = 'Rationale insufficient — please clarify the exposure vector.';

    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'return', notes });

    expect(res.status).toBe(204);

    const dataCall = mockQuery.mock.calls[0];
    expect(dataCall[0]).toContain('return_risk');
    expect(dataCall[1]).toEqual([RISK_ID, notes, 'ciso-uuid-001']);
  });

  test('notes are trimmed before being passed to return_risk', async () => {
    dbSucceeds();

    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'return', notes: '  needs more detail  ' });

    expect(res.status).toBe(204);

    const dataCall = mockQuery.mock.calls[0];
    expect(dataCall[1][1]).toBe('needs more detail');
  });

});

// ── Stored function error mapping ─────────────────────────────────────────────

describe('POST /api/v1/governance/risks/:id/validate — error mapping', () => {

  test('returns 404 when stored function says risk not found', async () => {
    dbThrowsMessage('validate_risk: risk abc not found');

    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'validate' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('returns 409 when risk is already validated', async () => {
    dbThrowsMessage('validate_risk: already validated');

    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'validate' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been validated/i);
  });

  test('returns 400 when stored function rejects missing notes', async () => {
    dbThrowsMessage('return_risk: validation_notes mandatory');

    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'return', notes: 'some notes' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notes are required/i);
  });

  test('returns 500 on unexpected database error', async () => {
    dbThrowsMessage('connection refused');

    const res = await request(app)
      .post(`/api/v1/governance/risks/${RISK_ID}/validate`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ action: 'validate' });

    expect(res.status).toBe(500);
  });

});
