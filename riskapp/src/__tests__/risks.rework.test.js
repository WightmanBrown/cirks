'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Mocked unit test — returned-risk rework endpoints on the risks router:
 *   GET    /api/v1/risks/returned-mine   (count returned to this user)
 *   POST   /api/v1/risks/:id/resubmit    (wires resubmit_risk)
 *   POST   /api/v1/risks/:id/discard     (analyst-facing archive of a returned risk)
 *
 * The DB pool is mocked, so these exercise route/controller logic only — the
 * status/ownership guards, error mapping, and capability gates.
 */

const request = require('supertest');
const jwt     = require('jsonwebtoken');

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery };
});
const { query: mockQuery } = require('../db/pool');

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

const createApp = require('../app');
const app       = createApp();

function makeToken(role) {
  return jwt.sign(
    { sub: `user-${role}-uuid`, email: `${role}@example.com`, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

const ANALYST_TOKEN   = makeToken('risk_analyst');
const SECRETARY_TOKEN  = makeToken('meeting_secretary'); // lacks risks.write/read
const ANALYST_ID       = 'user-risk_analyst-uuid';
const RISK_ID          = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/v1/risks/returned-mine', () => {
  test('401 without Authorization header', async () => {
    const res = await request(app).get('/api/v1/risks/returned-mine');
    expect(res.status).toBe(401);
  });

  test('returns the count of risks returned to this user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 3 }], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/risks/returned-mine')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 3 });
  });

  test('is not swallowed by the /:id param route (scopes by user)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/risks/returned-mine')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(200);
    // The scoping query must reference the caller's id.
    const sql = mockQuery.mock.calls[0][1];
    expect(sql).toEqual([ANALYST_ID]);
  });
});

describe('POST /api/v1/risks/:id/resubmit', () => {
  test('204 on success', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ resubmit_risk: '' }], rowCount: 1 });
    const res = await request(app)
      .post(`/api/v1/risks/${RISK_ID}/resubmit`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(204);
  });

  test('409 when the risk is not in the returned state', async () => {
    mockQuery.mockRejectedValueOnce(new Error('resubmit_risk: must be returned (current: pending)'));
    const res = await request(app)
      .post(`/api/v1/risks/${RISK_ID}/resubmit`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(409);
  });

  test('404 when the risk does not exist', async () => {
    mockQuery.mockRejectedValueOnce(new Error('resubmit_risk: risk ... not found'));
    const res = await request(app)
      .post(`/api/v1/risks/${RISK_ID}/resubmit`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  test('403 for a role lacking risks.write', async () => {
    const res = await request(app)
      .post(`/api/v1/risks/${RISK_ID}/resubmit`)
      .set('Authorization', `Bearer ${SECRETARY_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/risks/:id/discard', () => {
  test('204 when the originator discards a returned risk', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ validation_status: 'returned', identified_by: ANALYST_ID, owner_user_ids: [] }], rowCount: 1 }) // lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE is_active = FALSE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit insert
    const res = await request(app)
      .post(`/api/v1/risks/${RISK_ID}/discard`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ notes: 'duplicate of an existing risk' });
    expect(res.status).toBe(204);
  });

  test('404 when the risk does not exist / is already inactive', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .post(`/api/v1/risks/${RISK_ID}/discard`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  test('403 when the analyst is not the originator', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ validation_status: 'returned', identified_by: 'someone-else', owner_user_ids: ['another-person'] }],
      rowCount: 1,
    });
    const res = await request(app)
      .post(`/api/v1/risks/${RISK_ID}/discard`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('409 when the risk is not in the returned state', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ validation_status: 'pending', identified_by: ANALYST_ID, owner_user_ids: [] }],
      rowCount: 1,
    });
    const res = await request(app)
      .post(`/api/v1/risks/${RISK_ID}/discard`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(409);
  });
});
