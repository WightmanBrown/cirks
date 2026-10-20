'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Phase 7d: admin grant/revoke of additional (secondary) roles on an account.
// afterAll removes any row added so it doesn't leak to other suites.

const { app, request, tokenFor, query } = require('./helpers');

const ANALYST  = '11111111-0000-0000-0000-000000000003'; // primary role: risk_analyst
const ADMIN_ID = '11111111-0000-0000-0000-000000000001';
const adminTok = () => `Bearer ${tokenFor('admin')}`;

afterAll(async () => {
  await query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2', [ANALYST, 'siro']);
});

describe('admin user-roles API', () => {
  test('a non-admin is forbidden', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/users/${ANALYST}/roles`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`)
      .send({ role: 'siro' });
    expect(res.status).toBe(403);
  });

  test('grants then revokes an additional role', async () => {
    const grant = await request(app)
      .post(`/api/v1/admin/users/${ANALYST}/roles`)
      .set('Authorization', adminTok())
      .send({ role: 'siro' });
    expect(grant.status).toBe(201);
    expect(grant.body.additional_roles).toContain('siro');

    const revoke = await request(app)
      .delete(`/api/v1/admin/users/${ANALYST}/roles/siro`)
      .set('Authorization', adminTok());
    expect(revoke.status).toBe(200);
    expect(revoke.body.additional_roles).not.toContain('siro');
  });

  test('validation: invalid role, the primary role, self, and missing user', async () => {
    const bad = await request(app).post(`/api/v1/admin/users/${ANALYST}/roles`).set('Authorization', adminTok()).send({ role: 'nope' });
    expect(bad.status).toBe(400);

    const primary = await request(app).post(`/api/v1/admin/users/${ANALYST}/roles`).set('Authorization', adminTok()).send({ role: 'risk_analyst' });
    expect(primary.status).toBe(400);

    const self = await request(app).post(`/api/v1/admin/users/${ADMIN_ID}/roles`).set('Authorization', adminTok()).send({ role: 'siro' });
    expect(self.status).toBe(400);

    const missing = await request(app).post('/api/v1/admin/users/00000000-0000-0000-0000-000000000000/roles').set('Authorization', adminTok()).send({ role: 'siro' });
    expect(missing.status).toBe(404);
  });
});
