'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Mocked unit tests for PATCH /controls/:id/maturity-cap after the v83 maturity
// CEILING was retired (Stage 3). The endpoint now sets only the control's
// responsible owner (controls.owner_user_id); maturity is organisation-wide.
// DB pool is mocked — these exercise route/controller logic only.

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
const app = createApp();

const ciso = () => `Bearer ${makeToken({ role: 'ciso' })}`;                 // controls.write
const consultant = () => `Bearer ${makeToken({ role: 'security_consultant' })}`; // controls.read, NOT write
const noRead = () => `Bearer ${makeToken({ role: 'meeting_secretary' })}`;  // no controls.read

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('PATCH /controls/:id/maturity-cap — responsible owner', () => {
  it('403 for a role without controls.read (route guard)', async () => {
    const res = await request(app).patch('/api/v1/controls/c1/maturity-cap').set('Authorization', noRead()).send({ owner_user_id: 'u1' });
    expect(res.status).toBe(403);
  });

  it('400 when owner_user_id is not supplied', async () => {
    const res = await request(app).patch('/api/v1/controls/c1/maturity-cap').set('Authorization', ciso()).send({});
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403 when a controls.read-only role tries to assign the owner', async () => {
    const res = await request(app).patch('/api/v1/controls/c1/maturity-cap').set('Authorization', consultant()).send({ owner_user_id: 'u1' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/controls\.write/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('404 when the control does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // control lookup → none
    const res = await request(app).patch('/api/v1/controls/c1/maturity-cap').set('Authorization', ciso()).send({ owner_user_id: 'u1' });
    expect(res.status).toBe(404);
  });

  it('200 lets a control editor set the owner and audit-logs it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }], rowCount: 1 })                                // control exists
      .mockResolvedValueOnce({ rows: [{ id: 'c1', owner_user_id: 'u1' }], rowCount: 1 })           // UPDATE
      .mockResolvedValueOnce({ rows: [{ full_name: 'Owner One' }], rowCount: 1 })                  // owner name
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                           // audit
    const res = await request(app).patch('/api/v1/controls/c1/maturity-cap').set('Authorization', ciso()).send({ owner_user_id: 'u1' });
    expect(res.status).toBe(200);
    expect(res.body.control).toMatchObject({ owner_user_id: 'u1', owner_name: 'Owner One' });
    expect(mockQuery.mock.calls.some(c => /INSERT INTO audit_log/.test(c[0]))).toBe(true);
  });

  it('200 clears the owner (null)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'c1', owner_user_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                           // audit (no owner-name lookup)
    const res = await request(app).patch('/api/v1/controls/c1/maturity-cap').set('Authorization', ciso()).send({ owner_user_id: null });
    expect(res.status).toBe(200);
    expect(res.body.control).toMatchObject({ owner_user_id: null, owner_name: null });
  });
});
