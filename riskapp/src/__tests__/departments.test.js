'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Mocked unit tests for the departments router. DB pool mocked — these cover
// capability gating (departments.write), the open reads, input validation, and
// the detail-endpoint shape / 404. Real SQL/roll-up behaviour is verified at
// runtime against the dev DB.

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

const admin   = () => `Bearer ${makeToken({ role: 'admin' })}`;         // holds departments.write
const noWrite = () => `Bearer ${makeToken({ role: 'risk_analyst' })}`;  // read-only re: departments

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/v1/departments', () => {
  it('401 unauthenticated', async () => {
    expect((await request(app).get('/api/v1/departments')).status).toBe(401);
  });
  it('200 for any authenticated role (no capability guard)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'd1', name: 'Finance', system_count: 3, active_risk_count: 13 }], rowCount: 1 });
    const res = await request(app).get('/api/v1/departments').set('Authorization', noWrite());
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ name: 'Finance', active_risk_count: 13 });
  });
});

describe('GET /api/v1/departments/:id', () => {
  it('404 when the department does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // dept lookup
    const res = await request(app).get('/api/v1/departments/nope').set('Authorization', noWrite());
    expect(res.status).toBe(404);
  });
  it('returns profile + roll-ups + child lists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', name: 'Finance', description: null, owner_user_id: 'u9', owner_name: 'Joe' }], rowCount: 1 }) // dept
      .mockResolvedValueOnce({ rows: [{ id: 'u1', full_name: 'A', email: 'a@x', role: 'ciso', is_active: true }], rowCount: 1 }) // staff
      .mockResolvedValueOnce({ rows: [{ asset_count: 3, system_count: 3, service_count: 1, impact_table_count: 0, active_user_count: 2, active_risk_count: 13, active_exception_count: 0 }], rowCount: 1 }) // counts
      .mockResolvedValueOnce({ rows: [{ id: 's1', name: 'Ledger', is_shared: false, max_risk_score: 16 }], rowCount: 1 }) // systems
      .mockResolvedValueOnce({ rows: [{ id: 'a1', name: 'GL', is_shared: false }], rowCount: 1 }) // assets
      .mockResolvedValueOnce({ rows: [{ id: 'sv1', name: 'Payroll', is_shared: false }], rowCount: 1 }); // services
    const res = await request(app).get('/api/v1/departments/d1').set('Authorization', noWrite());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Finance', owner_name: 'Joe', system_count: 3, active_risk_count: 13 });
    expect(res.body.staff).toHaveLength(1);
    expect(res.body.systems[0]).toMatchObject({ name: 'Ledger', max_risk_score: 16 });
    expect(res.body.assets).toHaveLength(1);
    expect(res.body.services).toHaveLength(1);
  });
});

describe('write endpoints require departments.write', () => {
  it('POST 403 for a role without departments.write', async () => {
    const res = await request(app).post('/api/v1/departments').set('Authorization', noWrite()).send({ name: 'X' });
    expect(res.status).toBe(403);
  });
  it('POST 400 when name is missing', async () => {
    const res = await request(app).post('/api/v1/departments').set('Authorization', admin()).send({});
    expect(res.status).toBe(400);
  });
  it('POST 201 creates a department', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'd2', name: 'Legal', description: null, owner_user_id: null }], rowCount: 1 });
    const res = await request(app).post('/api/v1/departments').set('Authorization', admin()).send({ name: 'Legal' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Legal' });
  });
  it('PATCH 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).patch('/api/v1/departments/d9').set('Authorization', admin()).send({ description: 'x' });
    expect(res.status).toBe(404);
  });
  it('DELETE 403 for a role without departments.write', async () => {
    const res = await request(app).delete('/api/v1/departments/d1').set('Authorization', noWrite());
    expect(res.status).toBe(403);
  });
});
