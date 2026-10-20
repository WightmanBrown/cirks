'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration tests — v36 CIA analysis, publish, and mandatory endpoints
 *
 * Covers:
 *   (the rows/:rowId/cia route was removed — it wrote to impact_row_cia_analysis,
 *    dropped by v38, so it could only ever 500)
 *   POST /api/v1/bil/impact-tables/:id/publish
 *   PATCH /api/v1/bil/impact-tables/:id/mandatory
 *   (the service impact-table link was retired in v99 — see 0099 migration)
 *   POST /api/v1/services (auto-attach mandatory tables)
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
const { _setDepartmentIsolation } = require('../auth/permissions');
const createApp = require('../app');
const app = createApp();
const { makeToken } = require('./setup');

// These tests exercise bil role-gating + CIA/publish/mandatory route logic, not
// department isolation. Run in spreadsheet mode so the seat-scope middleware
// (assertWriteScope) is a no-op and the fabricated query sequences line up; the
// seat-scoping itself is covered by scoping.integration.test.js. denyIAMOnOrgScope
// and the inline role checks are isolation-independent and still apply.
beforeAll(() => { _setDepartmentIsolation(false); });
afterAll(() => { _setDepartmentIsolation(true); });

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── helper tokens ─────────────────────────────────────────────────────────────
const cisoToken   = makeToken({ role: 'ciso' });
const siroToken   = makeToken({ role: 'siro' });
const iamToken    = makeToken({ role: 'information_asset_manager' });
const analystToken= makeToken({ role: 'risk_analyst' });

// ── POST /bil/impact-tables/:id/publish ───────────────────────────────────────

describe('POST /api/v1/bil/impact-tables/:id/publish', () => {
  const url = '/api/v1/bil/impact-tables/1/publish';

  // Query order inside the handler: role check → table lookup → partial-dimension
  // check → described-dimension count → UPDATE.
  const roleAndTable = () => mockQuery
    .mockResolvedValueOnce({ rows: [{ scope: 'organisation' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 1, published_at: null }], rowCount: 1 });

  test('422 when a dimension is described at only some levels', async () => {
    // The error the old rule could not see: with 1–3 written and 4–5 blank, an
    // asset's score for that dimension depends on which level it is rated at.
    roleAndTable().mockResolvedValueOnce({ rows: [{ dimension: 'c', filled: '3' }], rowCount: 1 });

    const res = await request(app).post(url).set('Authorization', `Bearer ${siroToken}`);
    expect(res.status).toBe(422);
    expect(res.body.partial).toHaveLength(1);
    expect(res.body.error).toMatch(/C has 3 of 5/);
    // The guidance matters as much as the rejection — "n/a" is the trap.
    expect(res.body.error).toMatch(/do not write "n\/a"/i);
  });

  test('422 when no dimension is described at all', async () => {
    roleAndTable()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // none partial
      .mockResolvedValueOnce({ rows: [{ n: '0' }], rowCount: 1 });   // none described

    const res = await request(app).post(url).set('Authorization', `Bearer ${siroToken}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/at least one CIA dimension/i);
  });

  test('200 for an availability-only table — a blank dimension is a valid statement', async () => {
    // The case that drove this change: a supply/continuity table with no
    // meaningful confidentiality or integrity consequence. Two dimensions blank,
    // one complete, and that is publishable.
    roleAndTable()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // C and I at 0/5, A at 5/5
      .mockResolvedValueOnce({ rows: [{ n: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 1, published_at: new Date(), mandatory: false }], rowCount: 1 });

    const res = await request(app).post(url).set('Authorization', `Bearer ${siroToken}`);
    expect(res.status).toBe(200);
    expect(res.body.published_at).toBeTruthy();
  });

  test('200 when all three dimensions are fully described', async () => {
    roleAndTable()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ n: '3' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 1, published_at: new Date(), mandatory: false }], rowCount: 1 });

    const res = await request(app).post(url).set('Authorization', `Bearer ${siroToken}`);
    expect(res.status).toBe(200);
  });
});

// ── PATCH /bil/impact-tables/:id/mandatory ────────────────────────────────────

describe('PATCH /api/v1/bil/impact-tables/:id/mandatory', () => {
  const url = '/api/v1/bil/impact-tables/1/mandatory';

  // v103 granted bil.mandatory to the CISO. Making an impact scale mandatory
  // declares that every department must rate against it — the CISO's own
  // instrument, and they already publish the organisation-scope tables. This
  // assertion previously demanded 403 and encoded the mismatch that had the
  // frontend offering the button to a role the backend refused.
  test('ciso is allowed through the capability guard', async () => {
    const res = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${cisoToken}`)
      .send({ mandatory: true });
    expect(res.status).not.toBe(403);
  });

  test('403 for a role that does not hold bil.mandatory', async () => {
    // Guards against the grant being widened by accident: risk_analyst has
    // bil.read but no business flagging a scale mandatory.
    const res = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ mandatory: true });
    expect(res.status).toBe(403);
  });

  test('400 when mandatory is not boolean', async () => {
    const res = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${siroToken}`)
      .send({ mandatory: 'yes' });
    expect(res.status).toBe(400);
  });

  test('400 when table is dept-scope', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, scope: 'department', published_at: new Date(), mandatory: false }], rowCount: 1 });
    const res = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${siroToken}`)
      .send({ mandatory: true });
    expect(res.status).toBe(400);
  });

  test('422 when table not yet published', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, scope: 'organisation', published_at: null, mandatory: false }], rowCount: 1 });
    const res = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${siroToken}`)
      .send({ mandatory: true });
    expect(res.status).toBe(422);
  });

  test('200 mandatory=true triggers auto-attach sweep', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, scope: 'organisation', published_at: new Date(), mandatory: false }], rowCount: 1 }) // table check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1, scope: 'organisation', published_at: new Date(), mandatory: true }], rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 5 })  // sweep INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

    const res = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${siroToken}`)
      .send({ mandatory: true });
    expect(res.status).toBe(200);
    expect(res.body.mandatory).toBe(true);
  });
});

// The service <-> impact-table link was retired in v99: a service's impact
// tables are derived from the tables its information assets are rated against.
// DELETE /services/:id/impact-tables/:tableId and the mandatory auto-attach on
// service creation no longer exist, so their tests went with them.
