'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A security solution seen from its own page (/security-solutions): one
// solution, every objective it delivers, its parts and where it is in place.
// The part rules are the same ones the objective's page enforces (v137/v145).

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1/controls/solutions${path}`).set(as(role));
const ids = {};

beforeAll(async () => {
  ids.sys = (await query(`INSERT INTO systems (name, department_id) VALUES ('SOL Sys', $1) RETURNING id`, [IT_DEPT])).rows[0].id;
  const ctl = async (t) => (await query(
    `INSERT INTO controls (title, description, delivery) VALUES ($1, 'fixture', 'system') RETURNING id`, [t])).rows[0].id;
  ids.O1 = await ctl('SOL objective one');
  ids.O2 = await ctl('SOL objective two');
  const comp = async (name, inst) => (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, created_by)
     VALUES ('technology', $1, 'operational', $2, $3) RETURNING id`, [name, inst, USERS.admin.id])).rows[0].id;
  ids.agent = await comp('SOL agent', 'per_system');
  ids.console = await comp('SOL console', 'organisational');
  ids.unstated = await comp('SOL unstated', null);
  await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [ids.sys, ids.O1]);
  await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'degraded')`, [ids.sys, ids.agent]);
});

afterAll(async () => {
  await query(`DELETE FROM delivery_patterns WHERE name LIKE 'SOL%'`);
  await query(`DELETE FROM system_components WHERE system_id = $1`, [ids.sys]);
  await query(`DELETE FROM system_controls WHERE system_id = $1`, [ids.sys]);
  await query(`DELETE FROM audit_log WHERE entity_type = 'delivery_pattern' AND entity_label LIKE 'SOL%'`);
  await query(`DELETE FROM control_components WHERE name LIKE 'SOL%'`);
  await query(`DELETE FROM controls WHERE title LIKE 'SOL objective%'`);
  await query(`DELETE FROM systems WHERE id = $1`, [ids.sys]);
});

test('only the security team creates one; it starts delivering nothing', async () => {
  expect((await api('iam', 'post', '').send({ name: 'SOL EDR' })).status).toBe(403);
  const res = await api('analyst', 'post', '').send({ name: 'SOL EDR', notes: 'Agent plus console' });
  expect(res.status).toBe(201);
  ids.sol = res.body.solution.id;
  expect(res.body.solution).toMatchObject({ name: 'SOL EDR', kind: 'parts', objectives: [], parts: [], systems: [] });
});

test('objectives are added from the solution\'s side, once each', async () => {
  for (const o of [ids.O1, ids.O2]) expect((await api('ciso', 'post', `/${ids.sol}/objectives`).send({ control_id: o })).status).toBe(201);
  const again = await api('ciso', 'post', `/${ids.sol}/objectives`).send({ control_id: ids.O1 });
  expect(again.status).toBe(409);
  const { rows } = await query(`SELECT count(*)::int AS n FROM delivery_pattern_objectives WHERE pattern_id = $1`, [ids.sol]);
  expect(rows[0].n).toBe(2);
});

test('parts follow the component\'s scope, as on the objective page', async () => {
  expect((await api('ciso', 'post', `/${ids.sol}/parts`).send({ component_id: ids.unstated, location: 'organisation' })).body.error)
    .toMatch(/Say first whether/);
  expect((await api('ciso', 'post', `/${ids.sol}/parts`).send({ component_id: ids.agent, location: 'organisation' })).body.error)
    .toMatch(/exists once per system/);
  expect((await api('ciso', 'post', `/${ids.sol}/parts`).send({ component_id: ids.agent, location: 'on_system' })).status).toBe(201);
  const res = await api('ciso', 'post', `/${ids.sol}/parts`).send({ component_id: ids.console, location: 'organisation' });
  expect(res.status).toBe(201);
  expect(res.body.solution.parts.map((p) => [p.component_name, p.location])).toEqual([['SOL agent', 'on_system'], ['SOL console', 'organisation']]);
});

test('the detail says where it is in place, and what is wrong there', async () => {
  const res = await api('owner', 'get', `/${ids.sol}`);
  expect(res.status).toBe(200);
  expect(res.body.solution.systems).toEqual([expect.objectContaining({
    system_id: ids.sys, system_name: 'SOL Sys', in_play: true, state: 'degraded', objectives: 1, degraded_parts: ['SOL agent'] })]);
  const list = (await api('owner', 'get', '')).body.solutions.find((s) => s.id === ids.sol);
  expect(list).toMatchObject({ systems_in_place: 1 });
  expect(list.objectives).toHaveLength(2);
});

test('renaming and removing an objective keep the solution; both are audited', async () => {
  expect((await api('ciso', 'patch', `/${ids.sol}`).send({ name: 'SOL EDR renamed' })).body.solution.name).toBe('SOL EDR renamed');
  const res = await api('ciso', 'delete', `/${ids.sol}/objectives/${ids.O2}`);
  expect(res.body.solution.objectives.map((o) => o.title)).toEqual(['SOL objective one']);
  const { rows } = await query(`SELECT human_narrative FROM audit_log WHERE entity_id = $1 ORDER BY created_at`, [ids.sol]);
  expect(rows.map((r) => r.human_narrative)).toEqual(expect.arrayContaining([
    'Security solution "SOL EDR" changed — now "SOL EDR renamed"',
    'Security solution "SOL EDR renamed" no longer delivers "SOL objective two"',
  ]));
});

test('deleting it takes it off every objective', async () => {
  expect((await api('ciso', 'delete', `/${ids.sol}`)).status).toBe(204);
  expect((await api('ciso', 'get', `/${ids.sol}`)).status).toBe(404);
  const { rows } = await query(`SELECT count(*)::int AS n FROM delivery_pattern_objectives WHERE pattern_id = $1`, [ids.sol]);
  expect(rows[0].n).toBe(0);
});
