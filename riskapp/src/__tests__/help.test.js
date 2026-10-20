'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Mocked unit tests for the contextual-help route (Phase 1).
// DB pool is mocked — these exercise route logic only: capability gating, input
// validation, locale fallback, and the clear-on-empty-body behaviour. Real data
// shape is covered by runtime verification, not here.

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

const admin     = () => `Bearer ${makeToken({ role: 'admin' })}`;      // holds admin.manage
const nonAdmin  = () => `Bearer ${makeToken({ role: 'risk_analyst' })}`; // no admin.manage

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/v1/help', () => {
  it('401 unauthenticated', async () => {
    const res = await request(app).get('/api/v1/help');
    expect(res.status).toBe(401);
  });

  it('any authenticated role can read (open, no capability)', async () => {
    const res = await request(app).get('/api/v1/help').set('Authorization', nonAdmin());
    expect(res.status).toBe(200);
  });

  it('resolves locale text and flags fallbacks; skips keys with no text', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { help_key: 'a', placement: 'top',   title: 'A', body: 'fr body', locale_used: 'fr' },
        { help_key: 'b', placement: 'right', title: 'B', body: 'en body', locale_used: 'en' },
        { help_key: 'c', placement: 'top',   title: null, body: null,     locale_used: null },
      ],
      rowCount: 3,
    });
    const res = await request(app).get('/api/v1/help?locale=fr').set('Authorization', nonAdmin());
    expect(res.status).toBe(200);
    expect(res.body.locale).toBe('fr');
    expect(Object.keys(res.body.entries)).toEqual(['a', 'b']); // 'c' has no body
    expect(res.body.entries.a.is_fallback).toBe(false);
    expect(res.body.entries.b.is_fallback).toBe(true); // requested fr, served en
    expect(res.body.known_keys).toEqual(['a', 'b', 'c']);
  });

  it('falls back to en for a malformed locale', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/v1/help?locale=not-a-locale').set('Authorization', nonAdmin());
    expect(res.status).toBe(200);
    expect(res.body.locale).toBe('en');
  });
});

describe('PUT /api/v1/help/:key', () => {
  it('403 for a role without admin.manage', async () => {
    const res = await request(app).put('/api/v1/help/some.key')
      .set('Authorization', nonAdmin()).send({ body: 'hi' });
    expect(res.status).toBe(403);
  });

  it('400 on an invalid placement', async () => {
    const res = await request(app).put('/api/v1/help/some.key')
      .set('Authorization', admin()).send({ body: 'hi', placement: 'sideways' });
    expect(res.status).toBe(400);
  });

  it('upserts key + content and writes an audit row', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                              // INSERT help_keys
      .mockResolvedValueOnce({ rows: [{ help_key: 'some.key', locale: 'en', body: 'hi' }], rowCount: 1 }) // upsert content
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                             // audit_log
    const res = await request(app).put('/api/v1/help/some.key')
      .set('Authorization', admin()).send({ title: 'T', body: 'hi', placement: 'right' });
    expect(res.status).toBe(200);
    expect(res.body.entry).toMatchObject({ help_key: 'some.key', body: 'hi' });
    // last call is the audit insert
    const auditCall = mockQuery.mock.calls.find(c => /INTO audit_log/.test(c[0]));
    expect(auditCall).toBeTruthy();
  });

  it('clears the locale text on an empty body', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT help_keys
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE help_content
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit_log
    const res = await request(app).put('/api/v1/help/some.key')
      .set('Authorization', admin()).send({ body: '   ' });
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(true);
    const deleteCall = mockQuery.mock.calls.find(c => /DELETE FROM help_content/.test(c[0]));
    expect(deleteCall).toBeTruthy();
  });
});

describe('POST /api/v1/help/keys', () => {
  it('403 for a non-admin', async () => {
    const res = await request(app).post('/api/v1/help/keys')
      .set('Authorization', nonAdmin()).send({ key: 'x' });
    expect(res.status).toBe(403);
  });

  it('400 with no key', async () => {
    const res = await request(app).post('/api/v1/help/keys')
      .set('Authorization', admin()).send({});
    expect(res.status).toBe(400);
  });

  it('201 registering a key (idempotent)', async () => {
    const res = await request(app).post('/api/v1/help/keys')
      .set('Authorization', admin()).send({ key: 'risk.detail.residual', placement: 'right' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /api/v1/help/coverage', () => {
  it('403 for a non-admin', async () => {
    const res = await request(app).get('/api/v1/help/coverage').set('Authorization', nonAdmin());
    expect(res.status).toBe(403);
  });

  it('returns registered keys with their locales for an admin', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ help_key: 'a', placement: 'top', page_hint: null, locales: ['en'] }],
      rowCount: 1,
    });
    const res = await request(app).get('/api/v1/help/coverage').set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(res.body.keys[0]).toMatchObject({ help_key: 'a', locales: ['en'] });
  });
});
