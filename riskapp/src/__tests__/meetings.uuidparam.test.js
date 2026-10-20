'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Regression test — hardening H-09 (path traversal in meeting-attachment upload).
 *
 * The upload's multer storage engine derived its destination directory from
 * req.params.id. Express URL-decodes route parameters, so `%2e%2e%2f` in the id
 * segment decoded to `../` and path.join() walked out of uploads/meetings/ —
 * before any handler had checked that the meeting existed. Any holder of
 * meetings.read could create directories anywhere the runtime user could write.
 *
 * The guard is a router.param() UUID check, which Express runs ahead of all
 * route-level middleware (including multer's storage engine).
 *
 * NOTE: multer is deliberately NOT mocked here. The other meetings suite stubs
 * it out, which would make this test vacuous — the whole point is that the real
 * storage engine never gets to run.
 */

const request       = require('supertest');
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
let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const secretary  = () => makeToken({ role: 'meeting_secretary', sub: 'sec-uuid' });

// Encoded `../../../var/tmp/pwn` — one path segment as far as route matching is
// concerned, but `../../../var/tmp/pwn` once Express decodes it.
const TRAVERSAL = '%2e%2e%2f%2e%2e%2f%2e%2e%2fvar%2ftmp%2fpwn';

describe('H-09 — meetings router rejects non-UUID id parameters', () => {
  test('attachment upload with a traversal id is refused with 400', async () => {
    const res = await request(app)
      .post(`/api/v1/meetings/${TRAVERSAL}/attachments`)
      .set('Authorization', `Bearer ${secretary()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid id/);
  });

  test('the request never reaches the database', async () => {
    await request(app)
      .post(`/api/v1/meetings/${TRAVERSAL}/attachments`)
      .set('Authorization', `Bearer ${secretary()}`);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('authentication still runs first — no token is 401, not 400', async () => {
    const res = await request(app).post(`/api/v1/meetings/${TRAVERSAL}/attachments`);
    expect(res.status).toBe(401);
  });

  test.each([
    ['plain relative traversal', '..%2f..%2fetc'],
    ['absolute path',            '%2fetc%2fpasswd'],
    ['non-uuid placeholder',     'meeting-uuid-1234'],
    ['empty-ish',                '.'],
  ])('rejects %s', async (_label, id) => {
    const res = await request(app)
      .get(`/api/v1/meetings/${id}/pack`)
      .set('Authorization', `Bearer ${secretary()}`);
    expect(res.status).toBe(400);
  });

  test('a valid UUID passes the guard and reaches the handler', async () => {
    const res = await request(app)
      .get(`/api/v1/meetings/${VALID_UUID}/pack`)
      .set('Authorization', `Bearer ${secretary()}`);

    expect(res.status).not.toBe(400);
    expect(mockQuery).toHaveBeenCalled();
  });

  test('the :aid parameter is guarded too', async () => {
    const res = await request(app)
      .get(`/api/v1/meetings/${VALID_UUID}/attachments/${TRAVERSAL}/download`)
      .set('Authorization', `Bearer ${secretary()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid aid/);
  });

  test('literal routes declared before /:id are unaffected', async () => {
    const res = await request(app)
      .get('/api/v1/meetings/swg-summary')
      .set('Authorization', `Bearer ${secretary()}`);

    expect(res.status).not.toBe(400);
  });
});
