'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Mocked unit test — GET /api/v1/threats/:id/controls
 *
 * Proves:
 *   1. 401 without an Authorization header.
 *   2. 403 for a role lacking threats.read (meeting_secretary).
 *   3. 200 for risk_analyst returning { controls: [...] } with expected fields.
 *   4. 404 when the threat does not exist.
 *   5. 500 on an unexpected database error.
 */

const request = require('supertest');
const jwt     = require('jsonwebtoken');

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return {
    pool: { query: mockQuery, on: jest.fn() },
    query: mockQuery,
    // The unlink route runs through withActor so the 0121 trigger can attribute
    // the withdrawal it performs. Mocked-pool tests must provide it or the route
    // 500s on an undefined function — the real behaviour it guards is only
    // observable against a database (threatUnlinkWithdrawsItems.integration).
    withActor: (_userId, fn) => fn({ query: mockQuery }),
  };
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

const ANALYST_TOKEN   = makeToken('risk_analyst');
const SECRETARY_TOKEN = makeToken('meeting_secretary'); // lacks threats.read
const THREAT_ID       = '11111111-1111-1111-1111-111111111111';

const SAMPLE_LINK = {
  id:            'ctrl-uuid-1',
  title:         'Access Control',
  framework:     'iso27001',
  framework_ref: 'A.5.15',
  control_type:  'preventive',
  effectiveness: 4,
  status:        'active',
  is_baseline:   true,
  link_id:       'ct-uuid-1',
  notes:         'Restrict who can export bulk data.',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/v1/threats/:id/controls', () => {

  test('401 without Authorization header', async () => {
    const res = await request(app).get(`/api/v1/threats/${THREAT_ID}/controls`);
    expect(res.status).toBe(401);
  });

  test('403 for a role lacking threats.read', async () => {
    const res = await request(app)
      .get(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${SECRETARY_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('200 with the threat control catalogue', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: THREAT_ID }], rowCount: 1 }); // existence check
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_LINK], rowCount: 1 });        // catalogue

    const res = await request(app)
      .get(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('controls');
    expect(res.body.controls).toHaveLength(1);
    const c = res.body.controls[0];
    expect(c).toHaveProperty('id');
    expect(c).toHaveProperty('title');
    expect(c).toHaveProperty('framework_ref');
    expect(c).toHaveProperty('control_type');
    expect(c).toHaveProperty('link_id');
  });

  test('404 when the threat does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // existence check fails

    const res = await request(app)
      .get(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .get(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);

    expect(res.status).toBe(500);
  });

});

describe('POST /api/v1/threats/:id/controls', () => {
  const CONTROL_ID = '22222222-2222-2222-2222-222222222222';

  test('400 when control_id is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('201 returns the created catalogue row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });            // INSERT
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_LINK], rowCount: 1 }); // re-select

    const res = await request(app)
      .post(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ control_id: CONTROL_ID });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('link_id');
    expect(res.body.framework_ref).toBe('A.5.15');
  });

  test('409 when the control is already linked', async () => {
    mockQuery.mockRejectedValueOnce({ code: '23505' });

    const res = await request(app)
      .post(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ control_id: CONTROL_ID });
    expect(res.status).toBe(409);
  });

  test('404 when the control/threat FK is invalid', async () => {
    mockQuery.mockRejectedValueOnce({ code: '23503' });

    const res = await request(app)
      .post(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`)
      .send({ control_id: CONTROL_ID });
    expect(res.status).toBe(404);
  });

  test('403 for a role lacking controls.write', async () => {
    const res = await request(app)
      .post(`/api/v1/threats/${THREAT_ID}/controls`)
      .set('Authorization', `Bearer ${SECRETARY_TOKEN}`)
      .send({ control_id: CONTROL_ID });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/threats/:id/controls/:controlId', () => {
  const CONTROL_ID = '22222222-2222-2222-2222-222222222222';

  test('204 on a successful removal', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .delete(`/api/v1/threats/${THREAT_ID}/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(204);
  });

  test('404 when the link does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .delete(`/api/v1/threats/${THREAT_ID}/controls/${CONTROL_ID}`)
      .set('Authorization', `Bearer ${ANALYST_TOKEN}`);
    expect(res.status).toBe(404);
  });
});
