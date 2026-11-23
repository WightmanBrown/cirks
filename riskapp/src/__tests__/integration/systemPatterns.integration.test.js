'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// System patterns (v177, v178): a system says which of the eight patterns it
// follows; a component's roles say which slots it can answer; a system must
// answer only its pattern's required slots, and one with no pattern is asked
// nothing. No status or score follows unless a security pattern trigger names
// the pattern (tested in securityArchitecture).

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const { PATTERNS } = require('../../lib/systemPatterns');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const ids = {};

beforeAll(async () => {
  ids.otherDept = (await query(`INSERT INTO departments (name) VALUES ('SYSPAT Other') RETURNING id`)).rows[0].id;
  ids.sys = (await query(`INSERT INTO systems (name, department_id) VALUES ('SYSPAT Sys', $1) RETURNING id`, [IT_DEPT])).rows[0].id;
  ids.otherSys = (await query(`INSERT INTO systems (name, department_id) VALUES ('SYSPAT Elsewhere', $1) RETURNING id`, [ids.otherDept])).rows[0].id;
  const comp = async (type, name, extra = {}) => (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, created_by, document_kind, document_next_review)
     VALUES ($1, $2, 'operational', 'organisational', $3, $4, $5) RETURNING id`,
    [type, name, USERS.admin.id, extra.kind || null, extra.kind ? '2030-01-01' : null])).rows[0].id;
  ids.os = await comp('technology', 'SYSPAT OS');
  await query(`UPDATE control_components SET roles = '{operating_system}' WHERE id = $1`, [ids.os]);
  ids.app = await comp('technology', 'SYSPAT app');
  ids.team = await comp('people', 'SYSPAT team');
  await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'operational'), ($1, $3, 'operational')`,
    [ids.sys, ids.app, ids.team]);
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_type = 'system' AND entity_label LIKE 'SYSPAT%'`);
  await query(`DELETE FROM system_components WHERE system_id IN ($1, $2)`, [ids.sys, ids.otherSys]);
  await query(`DELETE FROM control_components WHERE name LIKE 'SYSPAT%'`);
  await query(`DELETE FROM systems WHERE id IN ($1, $2)`, [ids.sys, ids.otherSys]);
  await query(`DELETE FROM departments WHERE id = $1`, [ids.otherDept]);
});

const patch = (role, path, body) => request(app).patch(`/api/v1/systems${path}`).set(as(role)).send(body);
const osGap = async () => (await query(
  `SELECT 1 FROM v_system_slot_gaps WHERE system_id = $1 AND slot_key = 'operating_system'`, [ids.sys])).rowCount === 1;

test('the SQL copy of each pattern\'s slots matches the code', async () => {
  for (const p of PATTERNS) {
    const { rows } = await query('SELECT slot_key, label, required, fill FROM system_pattern_slots($1) ORDER BY sort_index', [p.code]);
    const sql = Object.fromEntries(rows.map((r) => [r.slot_key, { label: r.label, required: r.required, fill: r.fill }]));
    const code = Object.fromEntries(p.slots.map((s) => [s.key, { label: s.label, required: s.required, fill: s.fill }]));
    expect(sql).toEqual(code);
  }
  // The roles a component may hold are the slots filled by role.
  const { rows: [{ def }] } = await query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'chk_component_roles'`);
  for (const k of require('../../lib/systemPatterns').ROLES.map((r) => r.key)) expect(def).toContain(`'${k}'`);
});

test('the eight patterns and every system against them, for readers of the library', async () => {
  const res = await request(app).get('/api/v1/architecture/system-patterns').set(as('consultant'));
  expect(res.status).toBe(200);
  expect(res.body.patterns.map((p) => p.code)).toEqual(['S1', 'S7', 'S8', 'S2', 'S3', 'S4', 'S5', 'S6']);
  const mine = res.body.systems.find((s) => s.id === ids.sys);
  expect(mine.system_pattern).toBeNull();
  expect(mine.pattern_fit.state).toBe('no_pattern');
  // With no pattern it carries what it records, with roles, to judge which pattern is closest.
  expect(mine.recorded).toEqual([
    { id: ids.app, name: 'SYSPAT app', component_type: 'technology', roles: [] },
    { id: ids.team, name: 'SYSPAT team', component_type: 'people', roles: [] },
  ]);
});

test('the pattern decides which slots a system must answer; not stated asks nothing', async () => {
  expect(await osGap()).toBe(false);                                  // no pattern: asked nothing…
  expect((await query(`SELECT pattern_not_stated FROM v_system_component_findings WHERE system_id = $1`, [ids.sys])).rows[0].pattern_not_stated).toBe(true);
  expect((await patch('ciso', `/${ids.sys}/pattern`, { system_pattern: 'S2' })).status).toBe(200);
  expect(await osGap()).toBe(false);                                  // a supplier-run service has no operating system
  await patch('ciso', `/${ids.sys}/pattern`, { system_pattern: 'S3' });
  expect(await osGap()).toBe(false);                                  // optional on dedicated equipment
  await patch('ciso', `/${ids.sys}/pattern`, { system_pattern: 'S1' });
  expect(await osGap()).toBe(true);
  // Recording a component that can play the role answers it.
  await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'operational')`, [ids.sys, ids.os]);
  expect(await osGap()).toBe(false);
  await query(`DELETE FROM system_components WHERE system_id = $1 AND component_id = $2`, [ids.sys, ids.os]);
  await patch('ciso', `/${ids.sys}/pattern`, { system_pattern: null });
});

test('setting a pattern is audited, validated, and takes the department seat', async () => {
  expect((await patch('ciso', `/${ids.sys}/pattern`, { system_pattern: 'S9' })).status).toBe(400);
  const ok = await patch('iam', `/${ids.sys}/pattern`, { system_pattern: 'S1' });
  expect(ok.status).toBe(200);
  expect(ok.body.pattern_fit.pattern).toBe('S1');
  expect((await patch('iam', `/${ids.otherSys}/pattern`, { system_pattern: 'S1' })).status).toBe(403);
  const { rows } = await query(
    `SELECT human_narrative FROM audit_log WHERE entity_type = 'system' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.sys]);
  expect(rows[0].human_narrative).toMatch(/pattern not stated → S1 Application on premises/);
});

test('which slot a component fills: a slot of the pattern, of the right kind, never the supplier', async () => {
  await patch('ciso', `/${ids.sys}/pattern`, { system_pattern: null });
  expect((await patch('ciso', `/${ids.sys}/components/${ids.app}/slot`, { slot_key: 'application' })).status).toBe(400);   // no pattern yet
  await patch('ciso', `/${ids.sys}/pattern`, { system_pattern: 'S2' });
  expect((await patch('ciso', `/${ids.sys}/components/${ids.app}/slot`, { slot_key: 'control_system' })).status).toBe(400);
  expect((await patch('ciso', `/${ids.sys}/components/${ids.app}/slot`, { slot_key: 'supplier' })).status).toBe(400);
  expect((await patch('ciso', `/${ids.sys}/components/${ids.team}/slot`, { slot_key: 'service' })).status).toBe(400);   // people, not technology
  const ok = await patch('ciso', `/${ids.sys}/components/${ids.app}/slot`, { slot_key: 'service' });
  expect(ok.status).toBe(200);
  const service = ok.body.pattern_fit.slots.find((s) => s.key === 'service');
  expect(service).toMatchObject({ state: 'recorded', parts: [expect.objectContaining({ name: 'SYSPAT app', stated: true })] });
  expect(ok.body.pattern_fit.missing).toEqual(expect.arrayContaining(['Supplier']));
  // The system page carries both.
  const detail = (await request(app).get(`/api/v1/systems/${ids.sys}`).set(as('ciso'))).body;
  expect(detail.system_pattern).toBe('S2');
  expect(detail.components.find((c) => c.id === ids.app).slot_key).toBe('service');
  expect((await patch('ciso', `/${ids.sys}/components/${ids.app}/slot`, { slot_key: null })).body.slot_key).toBeNull();
});

test('with no security pattern trigger naming it, the pattern moves no score', async () => {
  const score = async () => (await query(
    `SELECT probability_c, probability_i, probability_a, impact_c, impact_i, impact_a FROM systems WHERE id = $1`, [ids.sys])).rows[0];
  const before = await score();
  for (const code of ['S1', 'S4', 'S6', null]) await patch('ciso', `/${ids.sys}/pattern`, { system_pattern: code });
  expect(await score()).toEqual(before);
});
