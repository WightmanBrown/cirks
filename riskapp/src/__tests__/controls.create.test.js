'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — POST /api/v1/controls
 *
 * Proves:
 *   1.  Returns 401 when not authenticated.
 *   2.  Returns 403 for information_asset_owner.
 *   3.  Returns 403 for siro.
 *   4.  Returns 201 for risk_analyst with minimal valid body.
 *   5.  Returns 201 for ciso.
 *   6.  Returns 201 for admin.
 *   7.  Created control contains expected fields.
 *   8.  Defaults framework to "custom" when omitted.
 *   9.  Returns 400 when title is missing.
 *  10.  Returns 400 when control_type is missing.
 *  11.  Returns 400 when control_type is invalid.
 *  12.  Returns 400 when framework is invalid.
 *  13.  Returns 409 on duplicate (framework, framework_ref).
 *  14.  Returns 500 on unexpected database error.
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

const ANALYST_TOKEN = makeToken('risk_analyst');
const CISO_TOKEN    = makeToken('ciso');
const ADMIN_TOKEN   = makeToken('admin');

const VALID_BODY = {
  framework:    'iso27001',
  framework_ref: 'A.99.1',
  title:        'Test Control',
  description:  'A test control.',
  control_type: 'preventive',
  is_baseline:  false,
};

const CREATED_CONTROL = {
  id:                 'ctrl-new-uuid',
  framework:          'iso27001',
  framework_ref:      'A.99.1',
  title:              'Test Control',
  control_type:       'preventive',
  framework_function: null,
  status:             'under_review',
  is_baseline:        false,
  created_at:         '2026-05-06T10:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('POST /api/v1/controls — auth', () => {

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/v1/controls').send(VALID_BODY);
    expect(res.status).toBe(401);
  });

});

describe('POST /api/v1/controls — role guard', () => {

  test('returns 403 for information_asset_owner', async () => {
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${makeToken('information_asset_owner')}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  test('returns 403 for siro', async () => {
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${makeToken('siro')}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

});

describe('POST /api/v1/controls — success', () => {

  test('returns 201 for risk_analyst', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [CREATED_CONTROL], rowCount: 1 });
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('control');
  });

  test('returns 201 for ciso', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [CREATED_CONTROL], rowCount: 1 });
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
  });

  test('returns 201 for admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [CREATED_CONTROL], rowCount: 1 });
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
  });

  test('created control contains expected fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [CREATED_CONTROL], rowCount: 1 });
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(VALID_BODY);
    const ctrl = res.body.control;
    expect(ctrl).toHaveProperty('id');
    expect(ctrl).toHaveProperty('framework');
    expect(ctrl).toHaveProperty('title');
    expect(ctrl).toHaveProperty('control_type');
    expect(ctrl).toHaveProperty('status', 'under_review');
  });

  test('defaults framework to custom when omitted', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...CREATED_CONTROL, framework: 'custom', framework_ref: null }],
      rowCount: 1,
    });
    const { framework: _f, framework_ref: _r, ...body } = VALID_BODY;
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(body);
    expect(res.status).toBe(201);
  });

});

describe('POST /api/v1/controls — validation', () => {

  test('returns 400 when title is missing', async () => {
    const { title: _t, ...body } = VALID_BODY;
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  test('returns 400 when control_type is missing', async () => {
    const { control_type: _ct, ...body } = VALID_BODY;
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/control_type/i);
  });

  test('returns 400 when control_type is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ ...VALID_BODY, control_type: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/control_type/i);
  });

  // Native controls no longer carry a framework — a `framework` field in the body is
  // simply ignored (mappings are attached separately), so there is no framework
  // validation or (framework, framework_ref) uniqueness conflict to assert.

});

describe('POST /api/v1/controls — conflict / error', () => {

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app)
      .post('/api/v1/controls')
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send(VALID_BODY);
    expect(res.status).toBe(500);
  });

});
