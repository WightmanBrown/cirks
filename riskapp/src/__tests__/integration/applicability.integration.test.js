'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// An objective's applicability is the Statement of Applicability's (v185, owner
// 2026-11-23): derived on read from its SoA entry and scopes, never typed. The
// Baseline/Specific flag it replaced is gone, and setting it is refused in words.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));

let obj; let scope;
const read = async () => (await api('analyst', 'get', `/controls/${obj}`)).body.control;
const listed = async () => (await api('analyst', 'get', '/controls')).body.controls.find((c) => c.id === obj);

beforeAll(async () => {
  obj = (await query(`INSERT INTO controls (title, description) VALUES ('APP Objective', 'fixture') RETURNING id`)).rows[0].id;
  scope = (await query(`INSERT INTO scopes (name, created_by) VALUES ('APP Cardholder data', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
});
afterAll(async () => {
  await query(`DELETE FROM soa_entry_scopes WHERE control_id = $1`, [obj]);
  await query(`DELETE FROM soa_entries WHERE control_id = $1`, [obj]);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [[obj, scope]]);
  await query(`DELETE FROM controls WHERE id = $1`, [obj]);
  await query(`DELETE FROM scopes WHERE id = $1`, [scope]);
});

test('no SoA decision yet reads not decided', async () => {
  expect(await read()).toMatchObject({ applicability: 'not_decided', applies_in: [] });
  expect(await listed()).toMatchObject({ applicability: 'not_decided' });
});

test('adopted with no scopes applies to the whole organisation', async () => {
  await query(`INSERT INTO soa_entries (control_id, applicable) VALUES ($1, true)`, [obj]);
  expect(await read()).toMatchObject({ applicability: 'organisation', applies_in: [] });
  expect(await listed()).toMatchObject({ applicability: 'organisation' });
});

test('narrowed to scopes names them', async () => {
  await query(`INSERT INTO soa_entry_scopes (control_id, scope_id) VALUES ($1, $2)`, [obj, scope]);
  expect(await read()).toMatchObject({ applicability: 'scopes', applies_in: ['APP Cardholder data'] });
  await query(`DELETE FROM soa_entry_scopes WHERE control_id = $1`, [obj]);
});

test('ruled out reads not applicable', async () => {
  await query(`UPDATE soa_entries SET applicable = false, justification = 'fixture' WHERE control_id = $1`, [obj]);
  expect(await read()).toMatchObject({ applicability: 'not_applicable' });
});

test('the retired flag cannot be set, and says why', async () => {
  const res = await api('ciso', 'patch', `/controls/${obj}`).send({ is_baseline: true });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/Statement of Applicability/);
});

test('a new objective made through the API carries no flag and reads not decided', async () => {
  const res = await api('ciso', 'post', '/controls').send({ title: 'APP Created', control_type: 'preventive', is_baseline: true });
  expect(res.status).toBe(201);
  expect(res.body.control).toMatchObject({ applicability: 'not_decided' });
  expect(res.body.control).not.toHaveProperty('is_baseline');
  await query(`DELETE FROM controls WHERE id = $1`, [res.body.control.id]);
});
