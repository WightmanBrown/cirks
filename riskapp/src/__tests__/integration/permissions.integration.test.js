'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Phase 1 of the configurable-RBAC plan: the permission core (capabilities +
// role_permissions seeded by v63) and the can() resolver + GET /me/capabilities.
// Nothing is wired into route guards yet, so this only verifies the mechanism and
// that the seed loaded; behaviour-equivalence with the route guards is enforced by
// rbacMatrix once the routes are migrated (Phase 2).

const { app, request, tokenFor, query } = require('./helpers');
const { can, requireCapability, capabilitiesForRole, _setSetupPhase } = require('../../auth/permissions');
const DEFAULTS = require('../../auth/capabilityDefaults');

describe('can() resolver', () => {
  test('grants a held capability', async () => {
    expect((await can('ciso', 'risks.validate')).allowed).toBe(true);
    expect((await can('admin', 'admin.manage')).allowed).toBe(true);
    expect((await can('meeting_secretary', 'meetings.write')).allowed).toBe(true);
  });

  test('denies a capability the role does not hold', async () => {
    expect((await can('risk_analyst', 'risks.validate')).allowed).toBe(false);
    expect((await can('meeting_secretary', 'risks.write')).allowed).toBe(false);
    expect((await can('information_asset_owner', 'assets.delete')).allowed).toBe(false);
  });

  test('returns own_dept scope for IAM/IAO on dept-scopable capabilities', async () => {
    expect((await can('information_asset_manager', 'assets.read')).scope).toBe('own_dept');
    expect((await can('information_asset_owner', 'risks.read')).scope).toBe('own_dept');
  });

  test('returns all_depts scope for non-dept-scoped roles', async () => {
    expect((await can('ciso', 'assets.read')).scope).toBe('all_depts');
    expect((await can('admin', 'risks.read')).scope).toBe('all_depts');
  });
});

describe('requireCapability middleware', () => {
  function run(role, cap) {
    return new Promise((resolve) => {
      const req = { user: role ? { role, id: 'x' } : null };
      const res = { status: (code) => ({ json: () => resolve({ status: code }) }) };
      requireCapability(cap)(req, res, () => resolve({ status: 'next' }));
    });
  }
  test('calls next when the role holds the capability', async () => {
    expect((await run('ciso', 'risks.validate')).status).toBe('next');
  });
  test('403 when the role lacks the capability', async () => {
    expect((await run('risk_analyst', 'risks.validate')).status).toBe(403);
  });
  test('401 when unauthenticated', async () => {
    expect((await run(null, 'risks.read')).status).toBe(401);
  });
});

describe('GET /me/capabilities', () => {
  test('returns the resolved set + context for the active role', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/capabilities')
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ciso');
    expect(res.body.department_isolation).toBe(false);
    const keys = res.body.capabilities.map((c) => c.key);
    expect(keys).toContain('risks.validate');
    expect(keys).toContain('assets.read');
    expect(keys).not.toContain('admin.manage');
  });

  test('reflects a leaner role (secretary)', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/capabilities')
      .set('Authorization', `Bearer ${tokenFor('secretary')}`);
    expect(res.status).toBe(200);
    const keys = res.body.capabilities.map((c) => c.key);
    expect(keys).toContain('meetings.write');
    expect(keys).not.toContain('risks.write');
  });

  test('is open to any authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/capabilities')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
  });

  test('matches capabilitiesForRole directly', async () => {
    const direct = await capabilitiesForRole('information_asset_manager');
    expect(direct.length).toBeGreaterThan(0);
    expect(direct.some((c) => c.key === 'assets.read' && c.scope === 'own_dept')).toBe(true);
  });
});

describe('setup-phase-only capabilities (security_consultant write authority lapses at go-operational)', () => {
  const WRITE = ['assets.write', 'systems.write', 'services.write', 'services.delete', 'threats.write'];
  afterEach(() => _setSetupPhase(true));  // restore default for the rest of the suite
  afterAll(() => _setSetupPhase(true));

  test('during setup the consultant holds the write caps', () => {
    _setSetupPhase(true);
    for (const c of WRITE) expect(can('security_consultant', c).allowed).toBe(true);
  });

  test('once operational the consultant loses the setup-only write caps but keeps read/advisory', () => {
    _setSetupPhase(false);
    for (const c of WRITE) expect(can('security_consultant', c).allowed).toBe(false);
    expect(can('security_consultant', 'assets.read').allowed).toBe(true);
    expect(can('security_consultant', 'systems.read').allowed).toBe(true);
    expect(can('security_consultant', 'knowledge.query').allowed).toBe(true);
    expect(can('security_consultant', 'actions.progress').allowed).toBe(true);
  });

  test('the phase does not affect other roles\' write authority', () => {
    _setSetupPhase(false);
    expect(can('ciso', 'assets.write').allowed).toBe(true);
    expect(can('information_asset_manager', 'systems.write').allowed).toBe(true);
    expect(can('ciso', 'services.delete').allowed).toBe(true);
  });

  test('capabilitiesForRole drops the setup-only caps when operational', async () => {
    _setSetupPhase(false);
    const keys = (await capabilitiesForRole('security_consultant')).map((c) => c.key);
    for (const c of WRITE) expect(keys).not.toContain(c);
    expect(keys).toContain('assets.read');
    expect(keys).toContain('knowledge.query');
  });

  test('operational: consultant is 403 on a write route (POST /assets)', async () => {
    _setSetupPhase(false);
    const res = await request(app)
      .post('/api/v1/assets')
      .set('Authorization', `Bearer ${tokenFor('consultant')}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test('setup: consultant is admitted on the same write route', async () => {
    _setSetupPhase(true);
    const res = await request(app)
      .post('/api/v1/assets')
      .set('Authorization', `Bearer ${tokenFor('consultant')}`)
      .send({});
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe('drift guard: capabilityDefaults vs the v63 DB seed', () => {
  const sortByKey = (caps) => [...caps].sort((a, b) => a.key.localeCompare(b.key));
  const normalize = (obj) =>
    Object.fromEntries(Object.entries(obj).map(([role, caps]) => [role, sortByKey(caps)]));

  test('the in-memory defaults match role_permissions in the database', async () => {
    const { rows } = await query('SELECT role, capability_key AS key, scope FROM role_permissions');
    const fromDb = {};
    for (const r of rows) (fromDb[r.role] ||= []).push({ key: r.key, scope: r.scope });
    expect(normalize(fromDb)).toEqual(normalize(DEFAULTS));
  });
});
