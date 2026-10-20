'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Phase 7a: admin RBAC configuration API. Edits write to the DB and call
// refreshFromDb() so the in-memory resolver reflects them live. These tests mutate
// real config tables, so afterAll restores role_permissions/sod_rules/org_config to
// the shipped defaults (jest gives each file a fresh module registry, so the
// in-memory resolver itself resets between files — only the DB needs restoring).

const { app, request, tokenFor, query, pool } = require('./helpers');
const { can } = require('../../auth/permissions');
const DEFAULTS = require('../../auth/capabilityDefaults');

afterAll(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM role_permissions');
    for (const [role, caps] of Object.entries(DEFAULTS)) {
      for (const cap of caps) {
        await c.query('INSERT INTO role_permissions (role, capability_key, scope) VALUES ($1,$2,$3)', [role, cap.key, cap.scope]);
      }
    }
    await c.query('UPDATE sod_rules SET enabled = FALSE');
    await c.query('UPDATE org_config SET department_isolation = FALSE');
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
});

const adminGet = () => request(app).get('/api/v1/admin/rbac').set('Authorization', `Bearer ${tokenFor('admin')}`);

describe('admin RBAC API — access', () => {
  test('admin can read the full RBAC picture', async () => {
    const res = await adminGet();
    expect(res.status).toBe(200);
    expect(res.body.capabilities.length).toBeGreaterThan(40);
    expect(res.body.roles).toContain('ciso');
    // 5 since v97 dropped the action.verify rule (its trigger went with the verify step).
    expect(res.body.sod_rules.length).toBe(5);
    expect(typeof res.body.department_isolation).toBe('boolean');
    expect(res.body.matrix.ciso.some((g) => g.capability_key === 'risks.validate')).toBe(true);
  });

  test('a non-admin is forbidden', async () => {
    const res = await request(app).get('/api/v1/admin/rbac').set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(res.status).toBe(403);
  });
});

describe('admin RBAC API — editing grants applies live', () => {
  test('granting a capability to a role takes effect via the resolver', async () => {
    expect(can('risk_analyst', 'risks.validate').allowed).toBe(false);
    const res = await request(app)
      .put('/api/v1/admin/rbac/role-permissions/risk_analyst')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ grants: [
        { capability_key: 'risks.read', scope: 'all_depts' },
        { capability_key: 'risks.validate', scope: 'all_depts' },
      ] });
    expect(res.status).toBe(200);
    expect(can('risk_analyst', 'risks.validate').allowed).toBe(true); // refreshed live
  });

  test('rejects an unknown capability / role / scope', async () => {
    const tok = `Bearer ${tokenFor('admin')}`;
    const bad = await request(app).put('/api/v1/admin/rbac/role-permissions/ciso').set('Authorization', tok)
      .send({ grants: [{ capability_key: 'does.not.exist', scope: 'all_depts' }] });
    expect(bad.status).toBe(400);
    const badRole = await request(app).put('/api/v1/admin/rbac/role-permissions/wizard').set('Authorization', tok)
      .send({ grants: [] });
    expect(badRole.status).toBe(404);
    const badScope = await request(app).put('/api/v1/admin/rbac/role-permissions/ciso').set('Authorization', tok)
      .send({ grants: [{ capability_key: 'risks.read', scope: 'galaxy' }] });
    expect(badScope.status).toBe(400);
  });

  test('admin-floor: admin keeps admin.manage even if edited away', async () => {
    const res = await request(app)
      .put('/api/v1/admin/rbac/role-permissions/admin')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ grants: [{ capability_key: 'risks.read', scope: 'all_depts' }] }); // omits admin.manage
    expect(res.status).toBe(200);
    expect(res.body.grants.some((g) => g.capability_key === 'admin.manage')).toBe(true);
    expect(can('admin', 'admin.manage').allowed).toBe(true);
  });
});

describe('admin RBAC API — SoD + isolation toggles', () => {
  test('toggles a SoD rule', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/rbac/sod-rules/exception.accept')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    const { rows } = await query("SELECT enabled FROM sod_rules WHERE key='exception.accept'");
    expect(rows[0].enabled).toBe(true);
  });

  test('404 for an unknown SoD rule', async () => {
    const res = await request(app).patch('/api/v1/admin/rbac/sod-rules/nope.nope')
      .set('Authorization', `Bearer ${tokenFor('admin')}`).send({ enabled: true });
    expect(res.status).toBe(404);
  });

  test('flips department isolation', async () => {
    const res = await request(app).patch('/api/v1/admin/rbac/department-isolation')
      .set('Authorization', `Bearer ${tokenFor('admin')}`).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.department_isolation).toBe(true);
  });
});
