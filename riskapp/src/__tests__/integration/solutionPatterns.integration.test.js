'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Security solution patterns (v176): a solution says which of the eight patterns
// it implements, and its fit against it is derived on read. Report only: the
// objective's status on a system is the same with or without a pattern.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1/controls${path}`).set(as(role));
const ids = {};

beforeAll(async () => {
  ids.sys = (await query(`INSERT INTO systems (name, department_id) VALUES ('SPAT Sys', $1) RETURNING id`, [IT_DEPT])).rows[0].id;
  ids.obj = (await query(`INSERT INTO controls (title, description, delivery) VALUES ('SPAT objective', 'fixture', 'system') RETURNING id`)).rows[0].id;
  const comp = async (type, name, inst, extra = {}) => (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, created_by, document_kind, document_next_review)
     VALUES ($1, $2, 'operational', $3, $4, $5, $6) RETURNING id`,
    [type, name, inst, USERS.admin.id, extra.kind || null, type === 'information' ? '2030-01-01' : null])).rows[0].id;
  ids.agent = await comp('technology', 'SPAT agent', 'per_system');
  ids.console = await comp('technology', 'SPAT console', 'organisational');
  ids.team = await comp('people', 'SPAT team', 'organisational');
  ids.records = await comp('information', 'SPAT records', 'organisational');
  await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [ids.sys, ids.obj]);
  await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'degraded')`, [ids.sys, ids.agent]);
  ids.sol = (await api('analyst', 'post', '/solutions').send({ name: 'SPAT EDR' })).body.solution.id;
  await api('analyst', 'post', `/solutions/${ids.sol}/objectives`).send({ control_id: ids.obj });
  await api('analyst', 'post', `/solutions/${ids.sol}/parts`).send({ component_id: ids.agent, location: 'on_system' });
  await api('analyst', 'post', `/solutions/${ids.sol}/parts`).send({ component_id: ids.console, location: 'organisation' });
  await api('analyst', 'post', `/solutions/${ids.sol}/parts`).send({ component_id: ids.team, location: 'organisation' });
});

afterAll(async () => {
  await query(`DELETE FROM delivery_patterns WHERE name LIKE 'SPAT%'`);
  await query(`DELETE FROM system_components WHERE system_id = $1`, [ids.sys]);
  await query(`DELETE FROM system_controls WHERE system_id = $1`, [ids.sys]);
  await query(`DELETE FROM audit_log WHERE entity_type = 'delivery_pattern' AND entity_label LIKE 'SPAT%'`);
  await query(`DELETE FROM control_components WHERE name LIKE 'SPAT%'`);
  await query(`DELETE FROM controls WHERE title = 'SPAT objective'`);
  await query(`DELETE FROM systems WHERE id = $1`, [ids.sys]);
});

const solution = async () => (await api('consultant', 'get', `/solutions/${ids.sol}`)).body.solution;
const statusOnSystem = async () => (await query(
  `SELECT status::text FROM system_controls WHERE system_id = $1 AND control_id = $2`, [ids.sys, ids.obj])).rows[0].status;

test('the eight patterns, readable by anyone who reads the library', async () => {
  const res = await api('consultant', 'get', '/solution-patterns');
  expect(res.status).toBe(200);
  expect(res.body.patterns.map((p) => p.code)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
  expect(res.body.patterns.find((p) => p.code === 'P5').slots.map((s) => s.key))
    .toEqual(['security_system', 'team', 'on_system', 'policy']);
});

test('a solution with no pattern stated says so; nothing is defaulted', async () => {
  const s = await solution();
  expect(s.solution_pattern).toBeNull();
  expect(s.pattern_fit.state).toBe('no_pattern');
});

test('choosing the pattern shows the gap, and changes no state on any system', async () => {
  const before = await statusOnSystem();
  expect((await api('iam', 'patch', `/solutions/${ids.sol}`).send({ solution_pattern: 'P5' })).status).toBe(403);
  expect((await api('ciso', 'patch', `/solutions/${ids.sol}`).send({ solution_pattern: 'P9' })).status).toBe(400);
  const res = await api('ciso', 'patch', `/solutions/${ids.sol}`).send({ solution_pattern: 'P5' });
  expect(res.status).toBe(200);
  const fit = res.body.solution.pattern_fit;
  expect(fit.state).toBe('incomplete');
  expect(fit.missing).toEqual(['Policy']);
  const by = Object.fromEntries(fit.slots.map((x) => [x.key, x]));
  expect(by.security_system.parts.map((p) => p.name)).toEqual(['SPAT console']);
  expect(by.on_system.state).toBe('degraded');           // degraded on the one system it is in play on
  expect(await statusOnSystem()).toBe(before);            // report only
  const { rows } = await query(
    `SELECT human_narrative FROM audit_log WHERE entity_id = $1 AND human_narrative LIKE '%pattern%' ORDER BY created_at DESC LIMIT 1`, [ids.sol]);
  expect(rows[0].human_narrative).toMatch(/pattern not stated → P5 Central security service/);
});

test('a slot can be marked not needed, but only a slot of its pattern', async () => {
  expect((await api('ciso', 'patch', `/solutions/${ids.sol}`).send({ slots_not_needed: ['document'] })).status).toBe(400);
  const res = await api('ciso', 'patch', `/solutions/${ids.sol}`).send({ slots_not_needed: ['policy'] });
  expect(res.status).toBe(200);
  expect(res.body.solution.pattern_fit.slots.find((x) => x.key === 'policy').state).toBe('not_needed');
  expect(res.body.solution.pattern_fit.state).toBe('degraded');
});

test('changing the pattern starts with every slot needed again', async () => {
  const res = await api('ciso', 'patch', `/solutions/${ids.sol}`).send({ solution_pattern: 'P1' });
  expect(res.body.solution.slots_not_needed).toEqual([]);
  await api('ciso', 'patch', `/solutions/${ids.sol}`).send({ solution_pattern: 'P5' });
});

test('a person can say which slot a part fills; a record only fills one that way', async () => {
  await api('ciso', 'patch', `/solutions/${ids.sol}`).send({ solution_pattern: 'P1' });
  const added = await api('ciso', 'post', `/solutions/${ids.sol}/parts`).send({ component_id: ids.records, location: 'organisation' });
  const partId = added.body.solution.parts.find((p) => p.component_name === 'SPAT records').id;
  let s = await solution();
  expect(s.pattern_fit.also.map((p) => p.name)).toContain('SPAT records');      // never guessed into the record slot
  expect((await api('iam', 'patch', `/solutions/${ids.sol}/parts/${partId}`).send({ slot_key: 'training_record' })).status).toBe(403);
  expect((await api('ciso', 'patch', `/solutions/${ids.sol}/parts/${partId}`).send({ slot_key: 'policy' })).status).toBe(400);
  const res = await api('ciso', 'patch', `/solutions/${ids.sol}/parts/${partId}`).send({ slot_key: 'training_record' });
  expect(res.status).toBe(200);
  s = res.body.solution;
  expect(s.pattern_fit.slots.find((x) => x.key === 'training_record').parts[0]).toMatchObject({ name: 'SPAT records', stated: true });
  expect((await api('ciso', 'patch', `/solutions/${ids.sol}/parts/${partId}`).send({ slot_key: null })).status).toBe(200);
});

test('the list carries every solution\'s fit', async () => {
  const res = await api('consultant', 'get', '/solutions');
  const mine = res.body.solutions.find((x) => x.id === ids.sol);
  expect(mine.pattern_fit.pattern).toBe('P1');
  expect(res.body.solutions.every((x) => x.pattern_fit && x.pattern_fit.state)).toBe(true);
});
