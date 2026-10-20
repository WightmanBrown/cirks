'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Mocked unit tests — v75 exception expiry/escalation + org operational phase.
 *
 *   GET  /api/v1/exceptions/escalated   (breach queue; sweeps then reads)
 *   GET  /api/v1/org/phase              (setup vs operational)
 *   POST /api/v1/org/go-operational     (consultant-only, one-way)
 *
 * The DB pool is mocked — these exercise route/controller logic only: the
 * lazy-sweep ordering on /escalated, the consultant-only gate on go-operational,
 * and the 409 mapping for an already-operational org.
 */

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

const SWEEP = { rows: [{ count: 0 }], rowCount: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/v1/exceptions/escalated', () => {
  it('401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/exceptions/escalated');
    expect(res.status).toBe(401);
  });

  it('sweeps then returns the breach queue array for ciso', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce(SWEEP)                                   // expire_overdue_exceptions()
      .mockResolvedValueOnce({ rows: [{ exception_id: 'e1', days_overdue: 4 }], rowCount: 1 }); // SELECT
    const res = await request(app)
      .get('/api/v1/exceptions/escalated')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ exception_id: 'e1' });
    // First call is the sweep function.
    expect(mockQuery.mock.calls[0][0]).toMatch(/expire_overdue_exceptions/);
  });

  it('visible to everyone — 200 for meeting_secretary', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce(SWEEP).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/api/v1/exceptions/escalated')
      .set('Authorization', `Bearer ${makeToken({ role: 'meeting_secretary' })}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/org/phase', () => {
  it('401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/org/phase');
    expect(res.status).toBe(401);
  });

  it('returns the phase for any authenticated role', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({
      rows: [{ org_name: 'Acme', setup_phase_active: true, setup_completed_at: null }],
      rowCount: 1,
    });
    const res = await request(app)
      .get('/api/v1/org/phase')
      .set('Authorization', `Bearer ${makeToken({ role: 'risk_analyst' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ setup_phase_active: true });
  });
});

describe('POST /api/v1/org/go-operational', () => {
  it('403 for a non-consultant (ciso)', async () => {
    const res = await request(app)
      .post('/api/v1/org/go-operational')
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`);
    expect(res.status).toBe(403);
  });

  it('200 for the security_consultant and returns the new phase', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // SELECT go_operational(...)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // refreshFromDb: role_permissions (empty → keep defaults)
      .mockResolvedValueOnce({ rows: [{ department_isolation: false, setup_phase_active: false }], rowCount: 1 }) // refreshFromDb: org_config
      .mockResolvedValueOnce({
        rows: [{ org_name: 'Acme', setup_phase_active: false, setup_completed_at: '2026-06-11T00:00:00Z' }],
        rowCount: 1,
      });
    const res = await request(app)
      .post('/api/v1/org/go-operational')
      .set('Authorization', `Bearer ${makeToken({ role: 'security_consultant' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ setup_phase_active: false });
  });

  it('409 when the org is already operational', async () => {
    mockQuery.mockReset();
    mockQuery.mockRejectedValueOnce(new Error('go_operational: organisation is already operational'));
    const res = await request(app)
      .post('/api/v1/org/go-operational')
      .set('Authorization', `Bearer ${makeToken({ role: 'security_consultant' })}`);
    expect(res.status).toBe(409);
  });
});
