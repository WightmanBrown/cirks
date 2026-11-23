'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A component created by mistake can be deleted, but only once nothing uses it
// (owner, 2026-11-17: a duplicate typed into the wrong console could not be
// removed). While it is recorded on a system the refusal names the system, so
// it is taken out there first.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
let sysId, dupId;

beforeAll(async () => {
  sysId = (await query(
    `INSERT INTO systems (name, department_id, owner_user_id) VALUES ('CDEL Kiosks', $1, $2) RETURNING id`,
    [IT_DEPT, USERS.owner.id])).rows[0].id;
  dupId = (await query(
    `INSERT INTO control_components (component_type, name, status, created_by)
     VALUES ('technology', 'CDEL Kiosk network (duplicate)', 'unknown', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
  await query(`INSERT INTO component_ip_addresses (component_id, ip_address) VALUES ($1, '10.9.9.9')`, [dupId]);
  await query(`INSERT INTO system_components (system_id, component_id) VALUES ($1, $2)`, [sysId, dupId]);
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_id = $1`, [dupId]);
  await query(`DELETE FROM system_components WHERE component_id = $1`, [dupId]);
  await query(`DELETE FROM control_components WHERE id = $1`, [dupId]);
  await query(`DELETE FROM systems WHERE id = $1`, [sysId]);
});

test('needs components.write', async () => {
  const res = await request(app).delete(`/api/v1/components/${dupId}`).set(as('siro'));
  expect(res.status).toBe(403);
});

test('refused while it is recorded on a system, naming the system', async () => {
  const res = await request(app).delete(`/api/v1/components/${dupId}`).set(as('ciso'));
  expect(res.status).toBe(409);
  expect(res.body.error).toMatch(/still in use: 1 system \(CDEL Kiosks\)/);
  expect(res.body.uses).toEqual([{ what: 'system', count: 1, names: ['CDEL Kiosks'] }]);
  expect((await query('SELECT 1 FROM control_components WHERE id = $1', [dupId])).rowCount).toBe(1);
});

test('once nothing uses it, it is deleted with its IP addresses, and audited', async () => {
  await query(`DELETE FROM system_components WHERE component_id = $1`, [dupId]);
  const res = await request(app).delete(`/api/v1/components/${dupId}`).set(as('ciso'));
  expect(res.status).toBe(204);
  expect((await query('SELECT 1 FROM control_components WHERE id = $1', [dupId])).rowCount).toBe(0);
  expect((await query('SELECT 1 FROM component_ip_addresses WHERE component_id = $1', [dupId])).rowCount).toBe(0);
  const { rows } = await query(`SELECT action, entity_type, user_id FROM audit_log WHERE entity_id = $1`, [dupId]);
  expect(rows).toEqual([{ action: 'delete', entity_type: 'control_components', user_id: USERS.ciso.id }]);
});

test('an unknown component is 404', async () => {
  const res = await request(app).delete(`/api/v1/components/${dupId}`).set(as('ciso'));
  expect(res.status).toBe(404);
});
