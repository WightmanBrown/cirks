'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// v156/v157 (owner, 2026-10-12): the Security Architect. A role a named person
// holds in addition to their own — "IAM in some cases but definitely not all of
// them" — which edits the systems architecture template, the system architecture
// patterns and the component library, reads everything, and writes nothing else.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const DEFAULTS = require('../../auth/capabilityDefaults');

const ARCHITECT = '11111111-0000-0000-0000-0000000000a7';
USERS.architect = { id: ARCHITECT, role: 'security_architect' };

const ids = {};
const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));

beforeAll(async () => {
  await query(
    `INSERT INTO users (id, email, full_name, password_hash, role, department_id)
     VALUES ($1, 'sar.architect@org.local', 'SAR Architect', 'x', 'security_architect', $2)`, [ARCHITECT, IT_DEPT]);
  ids.std = (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, document_kind, document_next_review, created_by)
     VALUES ('information', 'SAR Architecture Standard', 'operational', 'organisational', 'standard', CURRENT_DATE + 365, $1)
     RETURNING id`, [USERS.admin.id])).rows[0].id;
  ids.system = (await query(
    `INSERT INTO systems (name, department_id, owner_user_id) VALUES ('SAR system', $1, $2) RETURNING id`,
    [IT_DEPT, USERS.owner.id])).rows[0].id;
  ids.pattern = (await query(`INSERT INTO delivery_patterns (name, kind) VALUES ('SAR solution', 'parts') RETURNING id`)).rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM user_roles WHERE role = 'security_architect'`);
  await query(`DELETE FROM membership_groups WHERE name LIKE 'SAR%'`);
  await query(`DELETE FROM system_builds WHERE name LIKE 'SAR%'`);
  await query(`DELETE FROM delivery_patterns WHERE id = $1`, [ids.pattern]);
  await query(`DELETE FROM systems WHERE name LIKE 'SAR%'`);
  await query(`DELETE FROM audit_log WHERE user_id = $1`, [ARCHITECT]);
  await query(`DELETE FROM control_components WHERE name LIKE 'SAR%'`);
  await query(`DELETE FROM users WHERE id = $1`, [ARCHITECT]);
});

describe('what the Security Architect holds', () => {
  test('the database grants and the shipped defaults agree', async () => {
    const { rows } = await query(
      `SELECT capability_key, scope FROM role_permissions WHERE role = 'security_architect' ORDER BY 1`);
    const shipped = [...DEFAULTS.security_architect].sort((a, b) => a.key.localeCompare(b.key));
    expect(rows.map((r) => r.capability_key)).toEqual(shipped.map((c) => c.key));
    expect(rows.every((r) => r.scope === 'all_depts')).toBe(true);
  });

  test('exactly two writes, and neither is of a system, an objective or a risk', () => {
    const writes = DEFAULTS.security_architect.map((c) => c.key).filter((k) => !/\.(read|query)$/.test(k));
    expect(writes.sort()).toEqual(['architecture.write', 'components.write']);
  });
});

describe('the architect reads the whole picture', () => {
  test.each([
    '/systems', '/components', '/controls', '/architecture', '/controls/solutions',
    '/services', '/assets', '/threats', '/suppliers', '/users',
    '/operations/risk-heatmap/current', '/exceptions/active', '/actions/roll-up',
    '/findings/component-record', '/knowledge/search?q=SAR',
    // called by the dashboard on every load: a 403 there is noise in the log, not a boundary
    '/actions/my-inprogress', '/meetings/swg-summary', '/users/me/capabilities',
  ])('GET %s', async (path) => {
    expect((await api('architect', 'get', path)).status).toBe(200);
  });

  test('a system in any department, with its security view', async () => {
    expect((await api('architect', 'get', `/systems/${ids.system}`)).status).toBe(200);
    expect((await api('architect', 'get', `/systems/${ids.system}/security`)).status).toBe(200);
    const listed = (await api('architect', 'get', '/systems')).body;
    expect(listed.some((s) => s.id === ids.system)).toBe(true);
  });
});

describe('the architect does the architecture', () => {
  test('creates a component, a template group and a pattern', async () => {
    const c = await api('architect', 'post', '/components')
      .send({ name: 'SAR hypervisor', component_type: 'technology', instantiation: 'per_system' });
    expect(c.status).toBe(201);
    ids.comp = c.body.id || c.body.component?.id;

    const g = await api('architect', 'post', '/architecture/groups').send({ name: 'SAR Virtualisation', standard_id: ids.std });
    expect(g.status).toBe(201);
    const groupId = g.body.group?.id || g.body.id;
    expect((await api('architect', 'post', `/architecture/groups/${groupId}/members`).send({ component_id: ids.comp })).status).toBe(201);

    const b = await api('architect', 'post', '/architecture/builds').send({ name: 'SAR virtual server' });
    expect(b.status).toBe(201);
    const buildId = b.body.build?.id || b.body.id;
    expect((await api('architect', 'post', `/architecture/builds/${buildId}/components`).send({ component_id: ids.comp })).status).toBe(201);
  });

  test('and it is audited to them', async () => {
    const { rows } = await query(`SELECT count(*)::int AS n FROM audit_log WHERE user_id = $1`, [ARCHITECT]);
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe('and nothing else', () => {
  test('a rule requiring a security solution is the security team\'s', async () => {
    const res = await api('architect', 'post', '/architecture/rules').send({ pattern_id: ids.pattern, standard_id: ids.std });
    expect(res.status).toBe(403);
  });

  test.each([
    ['post', '/systems', { name: 'SAR not allowed', department_id: IT_DEPT }],
    ['put', '/systems/SYSTEM', { name: 'SAR renamed' }],
    ['post', '/systems/SYSTEM/components', { component_id: 'x' }],
    ['post', '/controls', { title: 'SAR objective' }],
    ['post', '/controls/solutions', { name: 'SAR other solution', kind: 'parts' }],
    ['post', '/assets', { name: 'SAR asset' }],
    ['post', '/services', { name: 'SAR service' }],
    ['post', '/suppliers', { name: 'SAR supplier' }],
    ['get', '/meetings', null],
    ['get', '/governance/risks/pending', null],
    ['get', '/admin/users', null],
  ])('%s %s is refused', async (method, path, body) => {
    const req = api('architect', method, path.replace('SYSTEM', ids.system));
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(403);
  });
});

describe('it is granted to a named person, not to a role', () => {
  test('the admin gives it to one department manager as an additional role', async () => {
    const res = await api('admin', 'post', `/admin/users/${USERS.iam.id}/roles`).send({ role: 'security_architect' });
    expect(res.status).toBe(201);
    const { rows } = await query(`SELECT role::text FROM v_user_roles WHERE user_id = $1 ORDER BY 1`, [USERS.iam.id]);
    expect(rows.map((r) => r.role)).toEqual(['information_asset_manager', 'security_architect']);
  });

  test('acting as IAM they still cannot edit the template: the role has to be switched into', async () => {
    const res = await api('iam', 'post', '/architecture/groups').send({ name: 'SAR as IAM', standard_id: ids.std });
    expect(res.status).toBe(403);
  });

  test('the department manager role itself gains nothing', () => {
    expect(DEFAULTS.information_asset_manager.some((c) => c.key === 'architecture.write')).toBe(false);
  });
});
