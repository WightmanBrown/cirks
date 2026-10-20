'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Mocked unit test — PATCH /api/v1/risks/:id/exceptions/:eid/revoke
 *
 * Locks in the v75 follow-up behaviour: revoking an exception must
 *   (a) flip the exception row to 'revoked',
 *   (b) clear the risk's treatment_decision (returns to needing a decision),
 *   (c) write an audit_log entry,
 * all inside one transaction. This matches the revoke modal's own copy
 * ("...returns to needing a treatment decision. This action is logged.").
 */

const request = require('supertest');
const { makeToken } = require('./setup');

// Mock the pool: a top-level query() for the pre-flight SELECT, plus a
// connect()-returned client with its own query() for the transaction body.
jest.mock('../db/pool', () => {
  const mockQuery       = jest.fn();
  const mockClientQuery = jest.fn();
  const client = { query: mockClientQuery, release: jest.fn() };
  return {
    pool: { query: mockQuery, on: jest.fn(), connect: jest.fn(() => Promise.resolve(client)) },
    query: mockQuery,
    __clientQuery: mockClientQuery,
  };
});
const { query: mockQuery, __clientQuery: mockClientQuery } = require('../db/pool');

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

const createApp = require('../app');
const app = createApp();

const RISK_ID = '11111111-1111-1111-1111-111111111111';
const EXC_ID  = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

function primeHappyPath() {
  // Pre-flight SELECT: exception + risk context (ciso may accept any score).
  mockQuery.mockResolvedValueOnce({
    rows: [{
      id: EXC_ID, risk_score: 20, threat_name: 'Ransomware', system_name: 'Finance System',
      exception_accept_analyst_max: 11, exception_accept_owner_max: 19, setup_phase_active: false,
    }],
    rowCount: 1,
  });
  // Transaction body, in order: BEGIN, UPDATE exception, UPDATE risks, SELECT actor, INSERT audit, COMMIT.
  mockClientQuery
    .mockResolvedValueOnce({})                                                       // BEGIN
    .mockResolvedValueOnce({ rows: [{ id: EXC_ID, status: 'revoked' }], rowCount: 1 }) // UPDATE exceptions
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })                                 // UPDATE risks
    .mockResolvedValueOnce({ rows: [{ full_name: 'Jane CISO' }], rowCount: 1 })       // SELECT actor
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })                                 // INSERT audit_log
    .mockResolvedValueOnce({});                                                       // COMMIT
}

describe('PATCH /risks/:id/exceptions/:eid/revoke', () => {
  test('200 and revokes the exception', async () => {
    primeHappyPath();
    const res = await request(app)
      .patch(`/api/v1/risks/${RISK_ID}/exceptions/${EXC_ID}/revoke`)
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({ notes: 'controls now in place' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'revoked' });
  });

  test('clears the risk treatment_decision', async () => {
    primeHappyPath();
    await request(app)
      .patch(`/api/v1/risks/${RISK_ID}/exceptions/${EXC_ID}/revoke`)
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({});
    const sqls = mockClientQuery.mock.calls.map(c => c[0]);
    const risksUpdate = sqls.find(s => /UPDATE risks/i.test(s));
    expect(risksUpdate).toBeDefined();
    expect(risksUpdate).toMatch(/treatment_decision\s*=\s*NULL/i);
  });

  test('writes an audit_log entry', async () => {
    primeHappyPath();
    await request(app)
      .patch(`/api/v1/risks/${RISK_ID}/exceptions/${EXC_ID}/revoke`)
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({ notes: 'controls now in place' });
    const auditCall = mockClientQuery.mock.calls.find(c => /INSERT INTO audit_log/i.test(c[0]));
    expect(auditCall).toBeDefined();
    // The narrative (last param) names the action and carries the reason.
    const narrative = auditCall[1][auditCall[1].length - 1];
    expect(narrative).toMatch(/revoked/i);
    expect(narrative).toMatch(/controls now in place/);
  });

  test('commits the transaction (no rollback on the happy path)', async () => {
    primeHappyPath();
    await request(app)
      .patch(`/api/v1/risks/${RISK_ID}/exceptions/${EXC_ID}/revoke`)
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({});
    const sqls = mockClientQuery.mock.calls.map(c => c[0]);
    expect(sqls).toContain('BEGIN');
    expect(sqls).toContain('COMMIT');
    expect(sqls).not.toContain('ROLLBACK');
  });

  test('404 when no active or expired exception matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .patch(`/api/v1/risks/${RISK_ID}/exceptions/${EXC_ID}/revoke`)
      .set('Authorization', `Bearer ${makeToken({ role: 'ciso' })}`)
      .send({});
    expect(res.status).toBe(404);
  });
});
