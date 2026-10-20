'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration test — POST /api/v1/auth/logout
 *
 * Proves:
 *   1. Returns 204 when no refresh_token is provided (idempotent).
 *   2. Returns 204 when token is provided but not found in DB (idempotent).
 *   3. Returns 204 and revokes the token family on success.
 *   4. Family revocation query is called with correct family_id.
 *   5. Returns 500 on unexpected database error.
 */

const request = require('supertest');

// ── Mock pg pool ──────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return {
    pool:  { query: mockQuery, on: jest.fn() },
    query: mockQuery,
  };
});

const { query: mockQuery } = require('../db/pool');

// ── Mock requestLogger ────────────────────────────────────────────────────────

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => {
    res.on('finish', () => {});
    next();
  };
});

// ── App under test ────────────────────────────────────────────────────────────

const createApp = require('../app');
const app       = createApp();

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {

  test('returns 204 when no refresh_token is provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({});

    expect(res.status).toBe(204);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('returns 204 when token is not found in DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT → not found

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refresh_token: 'some-token' });

    expect(res.status).toBe(204);
    // Only one query — the SELECT. No UPDATE called.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('returns 204 and revokes token family when token is found', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ family_id: 'family-uuid' }], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });                             // UPDATE

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refresh_token: 'some-token' });

    expect(res.status).toBe(204);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test('family revocation query uses correct family_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ family_id: 'family-uuid' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });

    await request(app)
      .post('/api/v1/auth/logout')
      .send({ refresh_token: 'some-token' });

    const revokeCall = mockQuery.mock.calls[1];
    expect(revokeCall[1]).toContain('family-uuid');
  });

  test('returns 500 on unexpected database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refresh_token: 'some-token' });

    expect(res.status).toBe(500);
  });

});
