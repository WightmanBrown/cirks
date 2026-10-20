'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Setting a per-system component status requires the component to be ON the
// system already: PATCH /systems/:id/components/:cid updates an existing row and
// 404s otherwise. That is why the risk-detail coverage panel now LINKS first
// when a component is not yet on the system — previously it rendered a dead
// "missing" chip and the only route was the System page, which can link but
// cannot set a status.
//
// Also pins the wrinkle that makes the link-then-stamp order matter: POST
// /systems/:id/components sets no status, so a component lands at the column
// default `unknown` — and a non-operational component is a MANDATORY
// remediation candidate on every risk for that system. Linking without
// immediately stamping the real state manufactures candidates.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

let systemId, componentId;

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id) VALUES ('LINK-STAMP system', $1) RETURNING id`,
    [IT_DEPT]
  );
  systemId = s.rows[0].id;

  // Healthy in the catalogue, absent from the system — the PR.AA-05 shape.
  const c = await query(
    `INSERT INTO control_components (name, component_type, status, created_by)
     VALUES ('LINK-STAMP component', 'technology', 'operational', $1) RETURNING id`,
    [USERS.analyst.id]
  );
  componentId = c.rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM system_components WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
  await query(`DELETE FROM control_components WHERE id = $1`, [componentId]);
});

test('setting the status of a component not on the system is refused', async () => {
  const res = await request(app)
    .patch(`/api/v1/systems/${systemId}/components/${componentId}`)
    .set('Authorization', `Bearer ${tokenFor('analyst')}`)
    .send({ status: 'operational' });
  expect(res.status).toBe(404);
  expect(res.body.error).toMatch(/not on this system/i);
});

test('linking sets no status — the component lands at `unknown`', async () => {
  const link = await request(app)
    .post(`/api/v1/systems/${systemId}/components`)
    .set('Authorization', `Bearer ${tokenFor('analyst')}`)
    .send({ component_id: componentId });
  expect(link.status).toBe(201);

  const { rows } = await query(
    `SELECT status FROM system_components WHERE system_id = $1 AND component_id = $2`,
    [systemId, componentId]);
  // NOT 'operational', even though the catalogue says the component is healthy.
  expect(rows[0].status).toBe('unknown');
});

test('once linked, the status can be stamped', async () => {
  const res = await request(app)
    .patch(`/api/v1/systems/${systemId}/components/${componentId}`)
    .set('Authorization', `Bearer ${tokenFor('analyst')}`)
    .send({ status: 'operational' });
  expect(res.status).toBe(204);

  const { rows } = await query(
    `SELECT status FROM system_components WHERE system_id = $1 AND component_id = $2`,
    [systemId, componentId]);
  expect(rows[0].status).toBe('operational');
});
