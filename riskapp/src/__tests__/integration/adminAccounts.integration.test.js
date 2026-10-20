'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Account management: create / edit / reset-password / reset-totp. Operates on
// throwaway accounts (email prefix itg-acct-) and cleans them up afterAll.

const { app, request, tokenFor, query, IT_DEPT } = require('./helpers');

const adminTok = () => `Bearer ${tokenFor('admin')}`;

afterAll(async () => {
  await query("DELETE FROM users WHERE email LIKE 'itg-acct-%'");
});

describe('admin account management', () => {
  test('non-admin cannot create accounts', async () => {
    const res = await request(app).post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${tokenFor('ciso')}`)
      .send({ email: 'itg-acct-x@org.local', full_name: 'X', role: 'risk_analyst', password: 'password123' });
    expect(res.status).toBe(403);
  });

  test('user list returns department_id, not just department_name (regression)', async () => {
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', adminTok());
    expect(res.status).toBe(200);
    const withDept = res.body.find((u) => u.department_name);
    expect(withDept).toBeTruthy();
    expect(withDept.department_id).toBeTruthy(); // was missing → UI showed "— none —"
  });

  test('creates an account that can then log in', async () => {
    const create = await request(app).post('/api/v1/admin/users').set('Authorization', adminTok())
      .send({ email: 'itg-acct-1@org.local', full_name: 'Test One', role: 'risk_analyst', department_id: IT_DEPT, password: 'password123' });
    expect(create.status).toBe(201);
    expect(create.body.email).toBe('itg-acct-1@org.local');
    expect(create.body.is_active).toBe(true);

    const login = await request(app).post('/api/v1/auth/login')
      .send({ email: 'itg-acct-1@org.local', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.access_token).toBeTruthy();
  });

  test('rejects duplicate email, bad email, short password, invalid role', async () => {
    const dup = await request(app).post('/api/v1/admin/users').set('Authorization', adminTok())
      .send({ email: 'itg-acct-1@org.local', full_name: 'Dup', role: 'risk_analyst', password: 'password123' });
    expect(dup.status).toBe(409);

    const bads = [
      { email: 'nope', full_name: 'A', role: 'risk_analyst', password: 'password123' },
      { email: 'itg-acct-2@org.local', full_name: 'A', role: 'risk_analyst', password: 'short' },
      { email: 'itg-acct-2@org.local', full_name: 'A', role: 'not_a_role', password: 'password123' },
    ];
    for (const body of bads) {
      const r = await request(app).post('/api/v1/admin/users').set('Authorization', adminTok()).send(body);
      expect(r.status).toBe(400);
    }
  });

  test('edits full_name and department, and reset-password lets them log in with the new password', async () => {
    const create = await request(app).post('/api/v1/admin/users').set('Authorization', adminTok())
      .send({ email: 'itg-acct-3@org.local', full_name: 'Three', role: 'risk_analyst', password: 'password123' });
    const id = create.body.id;

    const patch = await request(app).patch(`/api/v1/admin/users/${id}`).set('Authorization', adminTok())
      .send({ full_name: 'Renamed Three', department_id: IT_DEPT });
    expect(patch.status).toBe(200);
    expect(patch.body.full_name).toBe('Renamed Three');
    expect(patch.body.department_id).toBe(IT_DEPT);

    const reset = await request(app).post(`/api/v1/admin/users/${id}/reset-password`).set('Authorization', adminTok())
      .send({ password: 'newpassword456' });
    expect(reset.status).toBe(200);

    const login = await request(app).post('/api/v1/auth/login')
      .send({ email: 'itg-acct-3@org.local', password: 'newpassword456' });
    expect(login.status).toBe(200);
  });

  test('reset-totp clears enrolment', async () => {
    const create = await request(app).post('/api/v1/admin/users').set('Authorization', adminTok())
      .send({ email: 'itg-acct-4@org.local', full_name: 'Four', role: 'risk_analyst', password: 'password123' });
    const id = create.body.id;
    await query('UPDATE users SET totp_enabled = TRUE, totp_secret = $1 WHERE id = $2', ['SECRET', id]);

    const res = await request(app).post(`/api/v1/admin/users/${id}/reset-totp`).set('Authorization', adminTok());
    expect(res.status).toBe(200);
    expect(res.body.totp_enabled).toBe(false);
    const { rows } = await query('SELECT totp_enabled, totp_secret FROM users WHERE id = $1', [id]);
    expect(rows[0].totp_enabled).toBe(false);
    expect(rows[0].totp_secret).toBeNull();
  });
});
