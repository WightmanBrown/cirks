'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * v102 — every impact table has an owning department.
 *
 * Before v102 a CHECK constraint forced `department_id` to be NULL on
 * organisation-scope tables, so `assertWriteScope` could never match a
 * dept-scoped caller against one: the row simply had no department to compare.
 * Giving org tables an owner removes that accident, and the guards must hold on
 * their own merits instead.
 *
 * They do — but only because of ORDERING. `denyIAMOnOrgScope` runs before
 * `seatScopeTable` on every write route, and the rows/:rowId/cia route does its
 * own in-controller role check. This suite pins that, because reordering the
 * middleware would now silently hand an IAM in the owning department write
 * access to the organisation's impact scale.
 */

const request = require('supertest');

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery };
});
jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

const { query: mockQuery } = require('../db/pool');
const createApp = require('../app');
const app = createApp();
const { makeToken } = require('./setup');

const OWNER_DEPT = '11111111-1111-4111-8111-111111111111';
const iamToken   = makeToken({ role: 'information_asset_manager', sub: 'iam-uuid' });
const iaoToken   = makeToken({ role: 'information_asset_owner',   sub: 'iao-uuid' });
const cisoToken  = makeToken({ role: 'ciso',                      sub: 'ciso-uuid' });

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('an owned organisation-scope table is still closed to dept-scoped roles', () => {
  test('IAM is refused even when the table is owned by their own department', () => {
    // denyIAMOnOrgScope reads the scope first and must reject on scope alone.
    mockQuery.mockResolvedValue({
      rows: [{ scope: 'organisation', department_id: OWNER_DEPT }], rowCount: 1,
    });

    return request(app)
      .put('/api/v1/bil/impact-tables/1')
      .set('Authorization', `Bearer ${iamToken}`)
      .send({ name: 'renamed by an IAM' })
      .expect(403)
      .expect(res => {
        expect(res.body.error).toMatch(/organisation-scope/i);
      });
  });

  // The CIA-analysis route (rows/:rowId/cia) used to be tested here as the one
  // write path without denyIAMOnOrgScope in front of it. The route has since
  // been removed — it wrote to impact_row_cia_analysis, dropped by v38 — so the
  // guard it needed no longer has anything to guard.

  test('IAO cannot write at all — it holds bil.read only', () => {
    return request(app)
      .put('/api/v1/bil/impact-tables/1')
      .set('Authorization', `Bearer ${iaoToken}`)
      .send({ name: 'renamed by an IAO' })
      .expect(403);
  });
});

describe('create resolves an owner at BOTH scopes', () => {
  test('an organisation-scope table falls back to the creator department', async () => {
    mockQuery.mockImplementation((sql) => {
      if (/SELECT department_id FROM users/i.test(sql)) {
        return Promise.resolve({ rows: [{ department_id: OWNER_DEPT }], rowCount: 1 });
      }
      if (/INSERT INTO impact_tables/i.test(sql)) {
        return Promise.resolve({
          rows: [{ id: 7, scope: 'organisation', department_id: OWNER_DEPT }], rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .post('/api/v1/bil/impact-tables')
      .set('Authorization', `Bearer ${cisoToken}`)
      .send({ name: 'Org-wide scale', scope: 'organisation' })
      .expect(201);

    expect(res.body.department_id).toBe(OWNER_DEPT);

    // The owner must actually reach the INSERT — the pre-v102 code passed NULL
    // here for organisation scope, which is the whole bug.
    const insert = mockQuery.mock.calls.find(c => /INSERT INTO impact_tables/i.test(c[0]));
    expect(insert[1]).toContain(OWNER_DEPT);
  });

  test('an organisation-scope table is refused when no owner can be resolved', async () => {
    mockQuery.mockResolvedValue({ rows: [{ department_id: null }], rowCount: 1 });

    const res = await request(app)
      .post('/api/v1/bil/impact-tables')
      .set('Authorization', `Bearer ${cisoToken}`)
      .send({ name: 'Ownerless', scope: 'organisation' })
      .expect(400);

    expect(res.body.error).toMatch(/owning department/i);
  });
});
