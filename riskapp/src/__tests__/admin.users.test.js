'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Integration tests — GET /api/v1/admin/users  &  PATCH /api/v1/admin/users/:id
 *
 * Proves:
 *   GET /admin/users
 *     1. Returns 401 when unauthenticated.
 *     2. Returns 403 for non-admin roles.
 *     3. Returns 200 with user array for admin (includes dept + additional_roles).
 *
 *   PATCH /admin/users/:id
 *     4. Returns 401 when unauthenticated.
 *     5. Returns 403 for non-admin roles.
 *     6. Returns 400 when body targets the actor's own account.
 *     7. Returns 400 when no valid fields are provided.
 *     8. Returns 400 when role is not a valid enum value.
 *     9. Returns 400 when is_active is not a boolean.
 *    10. Returns 404 when user does not exist.
 *    11. Returns 200 and updated record on valid role change.
 *    12. Returns 200 and updated record on valid is_active change.
 *    13. Returns 200 when both role and is_active are updated together.
 */

const request = require('supertest');
const { makeToken } = require('./setup');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery };
});
const { query: mockQuery } = require('../db/pool');

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

// ── App ───────────────────────────────────────────────────────────────────────

const createApp = require('../app');
let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_TOKEN = makeToken({ role: 'admin', sub: 'admin-uuid' });
const CISO_TOKEN  = makeToken({ role: 'ciso',  sub: 'ciso-uuid'  });
const TARGET_ID   = 'target-user-uuid';

const SAMPLE_USERS = [
  {
    id: TARGET_ID,
    email: 'analyst@org.local',
    full_name: 'Jane Analyst',
    role: 'risk_analyst',
    is_active: true,
    last_login_at: null,
    department_name: 'Finance',
    additional_roles: [],
  },
  {
    id: 'other-uuid',
    email: 'ciso@org.local',
    full_name: 'Tom CISO',
    role: 'ciso',
    is_active: true,
    last_login_at: null,
    department_name: null,
    additional_roles: ['siro'],
  },
];

// ── GET /admin/users ──────────────────────────────────────────────────────────

describe('GET /api/v1/admin/users', () => {
  test('1 — returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  test('2 — returns 403 for non-admin role', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('3 — returns 200 with user array for admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: SAMPLE_USERS });

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      id: TARGET_ID,
      email: 'analyst@org.local',
      role: 'risk_analyst',
      is_active: true,
      department_name: 'Finance',
      additional_roles: [],
    });
    expect(res.body[1].additional_roles).toEqual(['siro']);
  });
});

// ── PATCH /admin/users/:id ────────────────────────────────────────────────────

describe('PATCH /api/v1/admin/users/:id', () => {
  test('4 — returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .send({ role: 'ciso' });
    expect(res.status).toBe(401);
  });

  test('5 — returns 403 for non-admin role', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${CISO_TOKEN}`)
      .send({ role: 'ciso' });
    expect(res.status).toBe(403);
  });

  test('6 — returns 400 when body targets own account', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/users/admin-uuid')   // same as ADMIN_TOKEN sub
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'ciso' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own role, department or active status/i);
  });

  // A name grants nothing, so an admin may correct their own (2026-09-29);
  // role, department and active status stay refused (test 6).
  test('6b — an admin may change their OWN name', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'admin-uuid', email: 'a@x', full_name: 'New Name', role: 'admin', is_active: true, department_id: null }],
      rowCount: 1,
    });
    const res = await request(app)
      .patch('/api/v1/admin/users/admin-uuid')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ full_name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe('New Name');
  });

  test('7 — returns 400 when no valid fields provided', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ unknown_field: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no valid fields/i);
  });

  test('8 — returns 400 for invalid role value', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'superuser' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid role/i);
  });

  test('9 — returns 400 when is_active is not boolean', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ is_active: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boolean/i);
  });

  test('10 — returns 404 when user does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'ciso' });
    expect(res.status).toBe(404);
  });

  test('11 — returns 200 with updated record on role change', async () => {
    const updated = {
      id: TARGET_ID,
      email: 'analyst@org.local',
      full_name: 'Jane Analyst',
      role: 'ciso',
      is_active: true,
    };
    mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'ciso' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ciso');
    expect(res.body.id).toBe(TARGET_ID);
  });

  test('12 — returns 200 on is_active deactivation', async () => {
    const updated = {
      id: TARGET_ID,
      email: 'analyst@org.local',
      full_name: 'Jane Analyst',
      role: 'risk_analyst',
      is_active: false,
    };
    mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });

  test('13 — returns 200 when both role and is_active updated together', async () => {
    const updated = {
      id: TARGET_ID,
      email: 'analyst@org.local',
      full_name: 'Jane Analyst',
      role: 'siro',
      is_active: true,
    };
    mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'siro', is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('siro');
    expect(res.body.is_active).toBe(true);
  });
});
