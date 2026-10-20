'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration tests — GET /api/v1/exceptions/stats
 *                     GET /api/v1/exceptions/active
 *
 * Proves:
 * Exceptions are read-visible to EVERYONE (every role holds exceptions.read),
 * org-wide and unscoped. Reads issue a single stats/list query — no dept lookup,
 * no IAO identity scope. See memory project_access_scoping.
 *
 *   GET /exceptions/stats
 *     1.  Returns 401 when unauthenticated.
 *     2.  Returns 200 for meeting_secretary (visible to everyone).
 *     3.  Returns 200 with all expected fields for ciso.
 *     4.  Returns 200 for siro.
 *     5.  Returns 200 for risk_analyst.
 *     6.  Returns 200 for information_asset_owner (unscoped, 1 query).
 *     7.  Returns 200 for information_asset_manager (unscoped, 1 query).
 *     8.  new_count, oldest_age_days, siro_escalated_count are numeric.
 *     9.  Dept-scoped roles issue a single query (no dept lookup).
 *    10.  No dept filter applied for non-scoped roles (ciso).
 *
 *   GET /exceptions/active
 *    11.  Returns 401 when unauthenticated.
 *    12.  Returns 200 for meeting_secretary (visible to everyone).
 *    13.  Returns 200 array for ciso.
 */

const request = require('supertest');
const { makeToken } = require('./setup');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery };
});
const { query: mockQuery } = require('../db/pool');

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

// ── App ───────────────────────────────────────────────────────────────────────

const createApp = require('../app');

// ── Helpers ───────────────────────────────────────────────────────────────────

const statsRow = {
  total: '3', overdue: '1', due_soon: '1', ok: '1',
  critical: '0', high: '2',
  new_count: '1', oldest_age_days: '210', siro_escalated_count: '0',
};

const deptRow  = { department_id: 'dept-uuid-1' };

beforeEach(() => {
  jest.clearAllMocks();
  // Default: first query returns empty (dept lookup), second returns statsRow.
  mockQuery
    .mockResolvedValueOnce({ rows: [deptRow], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
});

// ── GET /exceptions/stats ─────────────────────────────────────────────────────

describe('GET /api/v1/exceptions/stats', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('1. returns 401 when unauthenticated', async () => {
    mockQuery.mockReset();
    const res = await request(app).get('/api/v1/exceptions/stats');
    expect(res.status).toBe(401);
  });

  it('2. returns 200 for meeting_secretary (exceptions are visible to everyone)', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'meeting_secretary' })}`);
    expect(res.status).toBe(200);
  });

  it('3. returns 200 with all fields for ciso', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total:   expect.anything(),
      overdue: expect.anything(),
      due_soon: expect.anything(),
    });
  });

  it('4. returns 200 for siro', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'siro' })}`);
    expect(res.status).toBe(200);
  });

  it('5. returns 200 for risk_analyst', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'risk_analyst' })}`);
    expect(res.status).toBe(200);
  });

  it('6. returns 200 for information_asset_owner (unscoped, 1 query)', async () => {
    // Exceptions are universally visible — no IAO identity scope, no dept lookup.
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('7. returns 200 for information_asset_manager (unscoped, 1 query)', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_manager' })}`);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('8. new_count, oldest_age_days, siro_escalated_count are present', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('new_count');
    expect(res.body).toHaveProperty('oldest_age_days');
    expect(res.body).toHaveProperty('siro_escalated_count');
    expect(Number(res.body.new_count)).toBe(1);
    expect(Number(res.body.oldest_age_days)).toBe(210);
    expect(Number(res.body.siro_escalated_count)).toBe(0);
  });

  it('9. dept-scoped roles now issue 1 query (no dept lookup — exceptions are unscoped)', async () => {
    // IAM: single stats query, no dept lookup.
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_manager' })}`);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    // IAO: also a single stats query.
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('10. ciso issues only 1 query (no dept lookup)', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 });
    await request(app)
      .get('/api/v1/exceptions/stats')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ── GET /exceptions/active ────────────────────────────────────────────────────

describe('GET /api/v1/exceptions/active', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('11. returns 401 when unauthenticated', async () => {
    mockQuery.mockReset();
    const res = await request(app).get('/api/v1/exceptions/active');
    expect(res.status).toBe(401);
  });

  it('12. returns 200 for meeting_secretary (exceptions are visible to everyone)', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/api/v1/exceptions/active')
      .set('Authorization', `Bearer ${makeToken({ role: 'meeting_secretary' })}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('13. returns 200 array for ciso', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/api/v1/exceptions/active')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
