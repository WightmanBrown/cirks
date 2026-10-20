'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Mocked unit tests for the standards router (v87 Phase B). DB pool mocked — these
// cover capability gating + input validation + GET shape. The real import behaviour
// is covered by runtime verification.

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

const admin = () => `Bearer ${makeToken({ role: 'admin' })}`;       // holds controls.import
const ciso  = () => `Bearer ${makeToken({ role: 'ciso' })}`;        // controls.read, not import
const noRead = () => `Bearer ${makeToken({ role: 'meeting_secretary' })}`;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/v1/standards', () => {
  it('401 unauthenticated', async () => {
    expect((await request(app).get('/api/v1/standards')).status).toBe(401);
  });
  it('403 for a role without controls.read', async () => {
    expect((await request(app).get('/api/v1/standards').set('Authorization', noRead())).status).toBe(403);
  });
  it('returns the standards registry for a reader', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { id: 's1', code: 'iso27001', name: 'ISO/IEC 27001', is_enabled: true, bundled: true, reference_count: 93, mapped_count: 93, applicable_count: 91 },
    ], rowCount: 1 });
    const res = await request(app).get('/api/v1/standards').set('Authorization', ciso());
    expect(res.status).toBe(200);
    expect(res.body.standards[0]).toMatchObject({ code: 'iso27001', reference_count: 93 });
  });
});

describe('PATCH /api/v1/standards/:id', () => {
  it('403 without controls.import (read-only role)', async () => {
    const res = await request(app).patch('/api/v1/standards/s1').set('Authorization', ciso()).send({ is_enabled: false });
    expect(res.status).toBe(403);
  });
  it('400 when is_enabled missing', async () => {
    const res = await request(app).patch('/api/v1/standards/s1').set('Authorization', admin()).send({});
    expect(res.status).toBe(400);
  });
  it('200 toggles enabled', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 's1', code: 'cis_v8', is_enabled: false }], rowCount: 1 });
    const res = await request(app).patch('/api/v1/standards/s1').set('Authorization', admin()).send({ is_enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.standard).toMatchObject({ is_enabled: false });
  });
});

describe('POST /api/v1/standards/:id/controls/import', () => {
  it('403 without controls.import', async () => {
    const res = await request(app).post('/api/v1/standards/s1/controls/import').set('Authorization', ciso());
    expect(res.status).toBe(403);
  });
  it('400 when no file uploaded', async () => {
    const res = await request(app).post('/api/v1/standards/s1/controls/import').set('Authorization', admin());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file/i);
  });
  it('400 when required column missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 's1' }], rowCount: 1 }); // standard exists
    const csv = 'title,description\nFoo,Bar';
    const res = await request(app).post('/api/v1/standards/s1/controls/import')
      .set('Authorization', admin())
      .attach('file', Buffer.from(csv), { filename: 'cat.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ref_code/i);
  });
});

describe('POST /api/v1/standards/mappings/import', () => {
  it('403 without controls.import', async () => {
    const res = await request(app).post('/api/v1/standards/mappings/import').set('Authorization', ciso());
    expect(res.status).toBe(403);
  });
  it('400 when required column missing', async () => {
    const csv = 'control_title,standard\nMFA,iso27001';
    const res = await request(app).post('/api/v1/standards/mappings/import')
      .set('Authorization', admin())
      .attach('file', Buffer.from(csv), { filename: 'm.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/standard_ref/i);
  });
});
