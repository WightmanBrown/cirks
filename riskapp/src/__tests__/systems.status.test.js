'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * PATCH /systems/:id/controls/:cid  and  /systems/:id/components/:cid — per-system
 * status write (per-system control & component status model). Proves: valid status
 * → 204; invalid status → 400 (no UPDATE run); no matching row → 404.
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

const SYS = '11111111-1111-1111-1111-111111111111';
const CID = '22222222-2222-2222-2222-222222222222';
const token = makeToken({ role: 'ciso' }); // global role → assertWriteScope is a no-op

beforeEach(() => jest.clearAllMocks());

describe('PATCH /systems/:id/controls/:cid — status', () => {
  test('valid status → 204', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/systems/${SYS}/controls/${CID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'degraded' });
    expect(res.status).toBe(204);
    // Three since v152: the check that the status is not derived from a security
    // solution, the UPDATE, and the settle after a write. No dept lookup for a global role.
    const sql = mockQuery.mock.calls.map(c => String(c[0]));
    expect(sql.filter(q => /UPDATE system_controls/.test(q))).toHaveLength(1);
    expect(sql.filter(q => /settle_system_security/.test(q))).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  test('invalid status → 400, no UPDATE', async () => {
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/systems/${SYS}/controls/${CID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'bogus' });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('no matching row → 404', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/systems/${SYS}/controls/${CID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'operational' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /systems/:id/components/:cid — status', () => {
  test('valid status → 204', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/systems/${SYS}/components/${CID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'missing' });
    expect(res.status).toBe(204);
  });

  test('invalid status → 400', async () => {
    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/systems/${SYS}/components/${CID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: '' });
    expect(res.status).toBe(400);
  });
});
