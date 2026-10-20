'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration tests — dashboard layout (per-user UI preference)
 *
 *   GET /api/v1/users/me/dashboard-layout
 *     1.  401 when unauthenticated.
 *     2.  200 { layout: null } when the user has no saved layout.
 *     3.  200 returns the stored JSONB layout.
 *
 *   PUT /api/v1/users/me/dashboard-layout
 *     4.  401 when unauthenticated.
 *     5.  200 persists a valid layout (writes via parameterized UPDATE on req.user.id).
 *     6.  200 accepts null (reset to default) and writes NULL.
 *     7.  400 rejects a non-object layout.
 *     8.  400 rejects items missing/!integer x/y/w.
 *     9.  400 rejects a non-string item key.
 *    10.  Any authenticated role may use it (information_asset_owner).
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

const createApp = require('../app');

const validLayout = {
  lg: [{ i: 'my-risks', x: 0, y: 0, w: 3 }, { i: 'my-actions', x: 3, y: 0, w: 3 }],
  sm: [{ i: 'my-risks', x: 0, y: 0, w: 4 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [{ dashboard_layout: null }], rowCount: 1 });
});

describe('GET /api/v1/users/me/dashboard-layout', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('1. returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/users/me/dashboard-layout');
    expect(res.status).toBe(401);
  });

  it('2. returns { layout: null } when none saved', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/dashboard-layout')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ layout: null });
  });

  it('3. returns the stored layout', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dashboard_layout: validLayout }], rowCount: 1 });
    const res = await request(app)
      .get('/api/v1/users/me/dashboard-layout')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`);
    expect(res.status).toBe(200);
    expect(res.body.layout).toEqual(validLayout);
  });
});

describe('PUT /api/v1/users/me/dashboard-layout', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('4. returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/dashboard-layout')
      .send({ layout: validLayout });
    expect(res.status).toBe(401);
  });

  it('5. persists a valid layout for req.user.id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dashboard_layout: validLayout }], rowCount: 1 });
    const token = makeToken({ role: 'ciso', sub: 'user-123' });
    const res = await request(app)
      .put('/api/v1/users/me/dashboard-layout')
      .set('Authorization', `Bearer ${token}`)
      .send({ layout: validLayout });
    expect(res.status).toBe(200);
    expect(res.body.layout).toEqual(validLayout);
    // UPDATE ... WHERE id = $2 with the requesting user's id
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE\s+users\s+SET\s+dashboard_layout/i);
    expect(params[1]).toBe('user-123');
    expect(JSON.parse(params[0])).toEqual(validLayout);
  });

  it('6. accepts null (reset to default) and writes NULL', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/dashboard-layout')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({ layout: null });
    expect(res.status).toBe(200);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBeNull();
  });

  it('7. rejects a non-object layout', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/dashboard-layout')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({ layout: 'nope' });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('8. rejects items with non-integer x/y/w', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/dashboard-layout')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({ layout: { lg: [{ i: 'a', x: 0, y: 0, w: 1.5 }] } });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('9. rejects a non-string item key', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/dashboard-layout')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({ layout: { lg: [{ i: 123, x: 0, y: 0, w: 1 }] } });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('10. is available to any authenticated role (information_asset_owner)', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/dashboard-layout')
      .set('Authorization', `Bearer ${makeToken({ role: 'information_asset_owner' })}`)
      .send({ layout: validLayout });
    expect(res.status).toBe(200);
  });
});
