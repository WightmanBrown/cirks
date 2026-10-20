'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration tests — meetings RBAC for pack-eligible roles
 *
 * Proves that information_asset_owner, information_asset_manager, and
 * security_consultant can now access the pack-related endpoints, while
 * being correctly blocked from write/management endpoints.
 *
 *   GET /:id/pack          — canReadPack (was canRead — IAO/IAM/SC now allowed)
 *   GET /:id/agenda        — canReadPack
 *   GET /:id/attachments   — canReadPack
 *   GET /:id               — canReadPack
 *   GET /                  — canRead only (IAO/IAM/SC still blocked)
 *   POST /                 — canWrite only (meeting_secretary)
 *   DELETE /:id/attachments/:aid — canRead only (IAO/IAM/SC blocked)
 */

const request     = require('supertest');
const { makeToken } = require('./setup');

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery };
});
const { query: mockQuery } = require('../db/pool');

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

// Stub multer so attachment upload routes don't break in test
jest.mock('multer', () => {
  const m = () => ({ single: () => (req, res, next) => next() });
  m.diskStorage    = () => ({});
  m.memoryStorage  = () => ({});
  return m;
});

// ── App ────────────────────────────────────────────────────────────────────────

const createApp = require('../app');
let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Tokens ─────────────────────────────────────────────────────────────────────

// Must be a real UUID: the meetings router rejects non-UUID id parameters with a
// 400 before any capability guard runs (hardening H-09). A placeholder here would
// still satisfy the `not.toBe(403)` assertions below while quietly testing nothing.
const MID = '11111111-1111-4111-8111-111111111111';
const AID = '22222222-2222-4222-8222-222222222222';

const tok = role => makeToken({ role, sub: `${role}-uuid` });

const PACK_ELIGIBLE = [
  'information_asset_owner',
  'information_asset_manager',
  'security_consultant',
];

const FULL_READ = [
  'meeting_secretary',
  'ciso',
  'siro',
  'risk_analyst',
  'admin',
];

const BLOCKED_FROM_LIST = [
  'information_asset_owner',
  'information_asset_manager',
  'security_consultant',
];

// ── GET /:id/pack — canReadPack ────────────────────────────────────────────────
// We assert "not 403" (RBAC passed) rather than "200" (meeting found): the mock
// DB returns empty rows so the handler emits 404, but that proves RBAC allowed
// the request through. A 403 would mean the guard still blocked the role.

describe('GET /api/v1/meetings/:id/pack — canReadPack', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get(`/api/v1/meetings/${MID}/pack`);
    expect(res.status).toBe(401);
  });

  for (const role of PACK_ELIGIBLE) {
    test(`returns non-403 for ${role} (previously blocked)`, async () => {
      const res = await request(app)
        .get(`/api/v1/meetings/${MID}/pack`)
        .set('Authorization', `Bearer ${tok(role)}`);
      expect(res.status).not.toBe(403);
    });
  }

  for (const role of FULL_READ) {
    test(`returns non-403 for existing role ${role}`, async () => {
      const res = await request(app)
        .get(`/api/v1/meetings/${MID}/pack`)
        .set('Authorization', `Bearer ${tok(role)}`);
      expect(res.status).not.toBe(403);
    });
  }
});

// ── GET /:id/agenda — canReadPack ─────────────────────────────────────────────

describe('GET /api/v1/meetings/:id/agenda — canReadPack', () => {
  for (const role of PACK_ELIGIBLE) {
    test(`returns non-403 for ${role}`, async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const res = await request(app)
        .get(`/api/v1/meetings/${MID}/agenda`)
        .set('Authorization', `Bearer ${tok(role)}`);
      // 404 is fine (meeting not in mock DB); 403 would mean RBAC still blocking
      expect(res.status).not.toBe(403);
    });
  }
});

// ── GET /:id/attachments — canReadPack ────────────────────────────────────────

describe('GET /api/v1/meetings/:id/attachments — canReadPack', () => {
  for (const role of PACK_ELIGIBLE) {
    test(`returns non-403 for ${role}`, async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const res = await request(app)
        .get(`/api/v1/meetings/${MID}/attachments`)
        .set('Authorization', `Bearer ${tok(role)}`);
      expect(res.status).not.toBe(403);
    });
  }
});

// ── GET / — canRead (IAO/IAM/SC still blocked) ────────────────────────────────

describe('GET /api/v1/meetings — canRead (pack-eligible roles remain blocked)', () => {
  for (const role of BLOCKED_FROM_LIST) {
    test(`returns 403 for ${role}`, async () => {
      const res = await request(app)
        .get('/api/v1/meetings')
        .set('Authorization', `Bearer ${tok(role)}`);
      expect(res.status).toBe(403);
    });
  }

  for (const role of FULL_READ) {
    test(`returns 200 for ${role}`, async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const res = await request(app)
        .get('/api/v1/meetings')
        .set('Authorization', `Bearer ${tok(role)}`);
      expect(res.status).toBe(200);
    });
  }
});

// ── DELETE /:id/attachments/:aid — canRead (IAO/IAM/SC blocked) ───────────────

describe('DELETE /api/v1/meetings/:id/attachments/:aid — canRead (write-gated)', () => {
  for (const role of BLOCKED_FROM_LIST) {
    test(`returns 403 for ${role}`, async () => {
      const res = await request(app)
        .delete(`/api/v1/meetings/${MID}/attachments/${AID}`)
        .set('Authorization', `Bearer ${tok(role)}`);
      expect(res.status).toBe(403);
    });
  }
});
