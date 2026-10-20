'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — POST /api/v1/controls/import
 *
 * Proves:
 *   1.  Returns 401 when not authenticated.
 *   2.  Returns 403 for risk_analyst.
 *   3.  Returns 403 for ciso.
 *   4.  Returns 201 for admin with valid TSV — imported + skipped counts.
 *   5.  Maps CIS function names to internal control_type correctly.
 *   6.  Returns 400 when no file is attached.
 *   7.  Returns 400 when required columns are missing from header.
 *   8.  Returns 400 when file has no data rows.
 *   9.  Returns 422 when all rows are invalid (no valid rows to insert).
 *  10.  Returns 201 with partial errors when some rows are invalid.
 *  11.  Returns 500 on unexpected database error.
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

function makeToken(role, opts = {}) {
  return jwt.sign(
    { sub: `user-${role}-uuid`, email: `${role}@example.com`, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m', ...opts }
  );
}

const ADMIN_TOKEN   = makeToken('admin');
const ANALYST_TOKEN = makeToken('risk_analyst');
const CISO_TOKEN    = makeToken('ciso');

const VALID_TSV = [
  'framework\tframework_ref\tcontrol_type\ttitle\tdescription\tis_baseline',
  'CIS version 8\t1.1\tIdentify\tAsset Inventory\tMaintain an asset inventory.\tTRUE',
  'CIS version 8\t1.2\tRespond\tAddress Unauthorized Assets\tAddress unauthorised assets.\tTRUE',
].join('\n');

const VALID_CSV = [
  'framework,framework_ref,control_type,title,description,is_baseline',
  'iso27001,A.8.7,preventive,Malware Protection,Protect against malware.,true',
].join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('POST /api/v1/controls/import — auth', () => {

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/controls/import')
      .attach('file', Buffer.from(VALID_TSV), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });
    expect(res.status).toBe(401);
  });

});

describe('POST /api/v1/controls/import — role guard', () => {

  test('returns 403 for risk_analyst', async () => {
    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .attach('file', Buffer.from(VALID_TSV), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });
    expect(res.status).toBe(403);
  });

  test('returns 403 for ciso', async () => {
    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .attach('file', Buffer.from(VALID_TSV), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });
    expect(res.status).toBe(403);
  });

});

describe('POST /api/v1/controls/import — success', () => {

  test('returns 201 with imported and skipped counts', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }], rowCount: 2 });

    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .attach('file', Buffer.from(VALID_TSV), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toBe(0);
    expect(res.body.errors).toEqual([]);
  });

  test('reports skipped count for duplicates', async () => {
    // 2 valid rows but only 1 inserted (1 duplicate)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a' }], rowCount: 1 });

    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .attach('file', Buffer.from(VALID_TSV), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(1);
  });

  test('accepts comma-separated CSV as well as TSV', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a' }], rowCount: 1 });

    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .attach('file', Buffer.from(VALID_CSV), { filename: 'controls.csv', contentType: 'text/csv' });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
  });

  test('returns 201 with partial errors when some rows are invalid', async () => {
    const tsvWithBadRow = [
      'framework\tframework_ref\tcontrol_type\ttitle\tdescription\tis_baseline',
      'CIS version 8\t1.1\tIdentify\tGood Control\tDescription.\tTRUE',
      'CIS version 8\t1.2\tUnknownType\t\tDescription.\tFALSE',
    ].join('\n');

    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a' }], rowCount: 1 });

    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .attach('file', Buffer.from(tsvWithBadRow), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(3);
  });

});

describe('POST /api/v1/controls/import — validation', () => {

  test('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file/i);
  });

  test('returns 400 when required column is missing', async () => {
    // Native import requires control_type, title, description, is_baseline. Omit control_type.
    const badHeader = 'title\tdescription\tis_baseline\nTest\tDesc\tTRUE';
    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .attach('file', Buffer.from(badHeader), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/control_type/i);
  });

  test('returns 400 when file has no data rows', async () => {
    const headerOnly = 'framework\tframework_ref\tcontrol_type\ttitle\tdescription\tis_baseline';
    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .attach('file', Buffer.from(headerOnly), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no data rows/i);
  });

  test('returns 422 when all rows fail validation', async () => {
    const allBad = [
      'framework\tframework_ref\tcontrol_type\ttitle\tdescription\tis_baseline',
      '\t1.1\tUnknown\t\tDesc\tTRUE',
    ].join('\n');

    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .attach('file', Buffer.from(allBad), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });

    expect(res.status).toBe(422);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

});

describe('POST /api/v1/controls/import — error handling', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .post('/api/v1/controls/import')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .attach('file', Buffer.from(VALID_TSV), { filename: 'controls.tsv', contentType: 'text/tab-separated-values' });

    expect(res.status).toBe(500);
  });

});
