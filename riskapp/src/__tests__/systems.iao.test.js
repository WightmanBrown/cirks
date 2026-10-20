'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration tests — IAO access to GET /api/v1/systems
 *
 * Proves:
 *   1.  information_asset_owner is permitted (200, not 403).
 *   2.  information_asset_owner triggers a department lookup query.
 *   3.  No department → returns empty array immediately.
 *   4.  Returns systems array with max_risk_level when rows exist.
 *   5.  information_asset_manager still works (not broken by IAO addition).
 *   6.  meeting_secretary — still permitted (200).
 *   7.  siro — still 403 (not in canView).
 *   8.  GET /systems/:id — information_asset_owner gets 200.
 *   9.  GET /systems/:id — information_asset_owner gets 404 when not found.
 */

const request = require('supertest');
const { makeToken } = require('./setup');

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery };
});
const { query: mockQuery } = require('../db/pool');

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

const createApp = require('../app');

const deptRow   = { department_id: 'dept-uuid-1' };
const systemRow = {
  id: 'sys-uuid-1', name: 'Finance System', description: null,
  impact_c: 4, impact_i: 4, impact_a: 3, impact_changed_in_cycle: false,
  is_active: true, created_at: new Date().toISOString(),
  department_id: 'dept-uuid-1', department_name: 'Finance',
  owner_id: 'user-uuid-1', owner_name: 'Joe Walker',
  information_asset_count: 2, component_count: 1,
  max_risk_score: 16,
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/v1/systems — IAO access', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('1. information_asset_owner returns 200', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [deptRow], rowCount: 1 })   // dept lookup
      .mockResolvedValueOnce({ rows: [systemRow], rowCount: 1 }); // systems query
    const res = await request(app)
      .get('/api/v1/systems')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('2. information_asset_owner triggers dept lookup (2 queries)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [deptRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [systemRow], rowCount: 1 });
    await request(app)
      .get('/api/v1/systems')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('3. no department → returns empty array', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // dept lookup returns nothing
    const res = await request(app)
      .get('/api/v1/systems')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('4. systems array includes max_risk_score', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [deptRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [systemRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/systems')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`);
    expect(res.body[0]).toHaveProperty('max_risk_score', 16);
  });

  it('5. information_asset_manager still works', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [deptRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [systemRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/systems')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_manager' })}`);
    expect(res.status).toBe(200);
  });

  it('6. meeting_secretary still permitted', async () => {
    // The viewer's department is now resolved for EVERY role, not only the
    // dept-scoped ones, because GET /systems reports each row's viewer stake
    // (viewer_asset_count) regardless of who is asking. So the dept lookup is
    // queued here too — previously the secretary skipped it.
    mockQuery
      .mockResolvedValueOnce({ rows: [deptRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [systemRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/systems')
      .set('Authorization', `Bearer ${makeToken({ role: 'meeting_secretary' })}`);
    expect(res.status).toBe(200);
  });

  it('7. siro still returns 403', async () => {
    const res = await request(app)
      .get('/api/v1/systems')
      .set('Authorization', `Bearer ${makeToken({ role: 'siro' })}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/systems/:id — IAO access', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('8. information_asset_owner gets non-403 on system detail', async () => {
    // mock the detail query (returns one row)
    mockQuery.mockResolvedValueOnce({ rows: [systemRow], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/systems/sys-uuid-1')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`);
    expect(res.status).not.toBe(403);
  });

  it('9. information_asset_owner gets 404 when system not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/api/v1/systems/no-such-id')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`);
    expect(res.status).toBe(404);
  });
});
