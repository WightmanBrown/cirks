'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// v155 (owner, 2026-10-09): a system says whether it exists to protect other
// systems, and the systems architecture template and patterns are edited with
// their own capability — an architect's work, not the security team's.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const DEFAULTS = require('../../auth/capabilityDefaults');

const ids = {};
const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));
const flag = async (id) => (await query(`SELECT is_security_system FROM systems WHERE id = $1`, [id])).rows[0].is_security_system;
const save = (id, body) => api('ciso', 'put', `/systems/${id}`).send({ name: 'SSF console', ...body });

beforeAll(async () => {
  ids.comp = (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, created_by)
     VALUES ('technology', 'SSF console software', 'operational', 'organisational', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
  ids.pattern = (await query(`INSERT INTO delivery_patterns (name, kind) VALUES ('SSF solution', 'parts') RETURNING id`)).rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM delivery_patterns WHERE id = $1`, [ids.pattern]);
  await query(`DELETE FROM system_builds WHERE name LIKE 'SSF%'`);
  const systems = [ids.plain, ids.security].filter(Boolean);
  await query(`DELETE FROM system_components WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [systems]);
  await query(`DELETE FROM systems WHERE id = ANY($1)`, [systems]);
  await query(`DELETE FROM control_components WHERE id = $1`, [ids.comp]);
});

describe('a system says whether it is a security system', () => {
  test('stated when it is created; false unless said', async () => {
    const plain = await api('ciso', 'post', '/systems').send({ name: 'SSF booking server', department_id: IT_DEPT });
    const sec = await api('ciso', 'post', '/systems').send({ name: 'SSF console', department_id: IT_DEPT, is_security_system: true });
    expect([plain.status, sec.status]).toEqual([201, 201]);
    ids.plain = plain.body.id; ids.security = sec.body.id;
    expect(await flag(ids.plain)).toBe(false);
    expect(await flag(ids.security)).toBe(true);
    const detail = (await api('ciso', 'get', `/systems/${ids.security}`)).body;
    expect((detail.system || detail).is_security_system).toBe(true);
    const listed = (await api('ciso', 'get', '/systems')).body.find((s) => s.id === ids.security);
    expect(listed.is_security_system).toBe(true);
  });

  test('saving other details leaves it as it was', async () => {
    expect((await save(ids.security, { description: 'edited' })).status).toBe(204);
    expect(await flag(ids.security)).toBe(true);
  });

  test('the picker says which systems recording a component are security systems', async () => {
    for (const s of [ids.plain, ids.security]) {
      await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'operational')`, [s, ids.comp]);
    }
    const res = await api('ciso', 'get', `/controls/solutions/recorded-on?component_id=${ids.comp}`);
    expect(res.status).toBe(200);
    const by = Object.fromEntries(res.body.systems.map((s) => [s.id, s.is_security_system]));
    expect(by[ids.security]).toBe(true);
    expect(by[ids.plain]).toBe(false);
  });

  test('a solution that names a system as where a part lives makes it a security system', async () => {
    await query(`INSERT INTO delivery_pattern_parts (pattern_id, component_id, location, service_system_id) VALUES ($1, $2, 'service', $3)`,
      [ids.pattern, ids.comp, ids.plain]);
    expect(await flag(ids.plain)).toBe(true);
  });

  test('it cannot stop being one while a solution relies on it — and the refusal names the solution', async () => {
    const res = await api('ciso', 'put', `/systems/${ids.plain}`).send({ name: 'SSF booking server', is_security_system: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('security_system_relied_on');
    expect(res.body.error).toMatch(/relied on as a security system by: SSF solution/);
    expect(await flag(ids.plain)).toBe(true);
  });

  test('once nothing relies on it, it can', async () => {
    await query(`DELETE FROM delivery_pattern_parts WHERE pattern_id = $1`, [ids.pattern]);
    const res = await api('ciso', 'put', `/systems/${ids.plain}`).send({ name: 'SSF booking server', is_security_system: false });
    expect(res.status).toBe(204);
    expect(await flag(ids.plain)).toBe(false);
  });
});

describe('the template and the patterns are an architect\'s work', () => {
  test('architecture.write is held by the risk analyst, the CISO, the admin and the Security Architect (v157) — and by no one else by default', () => {
    const holders = Object.entries(DEFAULTS).filter(([, caps]) => caps.some((c) => c.key === 'architecture.write')).map(([r]) => r).sort();
    expect(holders).toEqual(['admin', 'ciso', 'risk_analyst', 'security_architect']);
  });

  test('the analyst sees it among their capabilities, and can create a pattern', async () => {
    const me = await api('analyst', 'get', '/users/me/capabilities');
    expect(JSON.stringify(me.body)).toMatch(/architecture\.write/);
    const res = await api('analyst', 'post', '/architecture/builds').send({ name: 'SSF pattern' });
    expect(res.status).toBe(201);
  });

  test('a department manager cannot, until given the capability', async () => {
    expect((await api('iam', 'post', '/architecture/builds').send({ name: 'SSF pattern two' })).status).toBe(403);
    expect((await api('iam', 'post', '/architecture/groups').send({ name: 'SSF group' })).status).toBe(403);
  });
});
