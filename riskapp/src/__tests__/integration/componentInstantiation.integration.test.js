'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A component exists ONCE for the organisation, or once PER SYSTEM (v137,
// docs/security-action-scopes.md §5). The Data handling policy is one document
// implied on 32 systems; an OSSEC agent is installed host by host. Until this,
// both were per-system facts, so the policy became 32 things to record and 32
// remediation items.
//
// Fixture: one control on two systems, delivered by one component that is
// recorded (degraded) on the first system only.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT = '33333333-0000-0000-0000-000000000001';
let sysA, sysB, controlId, componentId, riskA, actionId, itemId;

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const setInstantiation = (value, role = 'ciso') =>
  request(app).patch(`/api/v1/components/${componentId}`).set(as(role)).send({ instantiation: value });
const presence = async () => (await query(
  `SELECT system_id, status, via FROM v_component_presence WHERE component_id = $1 ORDER BY system_id`,
  [componentId])).rows;

beforeAll(async () => {
  const sys = async (name) => (await query(
    `INSERT INTO systems (name, department_id, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
    [name, IT_DEPT, USERS.owner.id])).rows[0].id;
  sysA = await sys('INST Sys A');
  sysB = await sys('INST Sys B');
  controlId = (await query(
    `INSERT INTO controls (title, description, delivery) VALUES ('INST Control', 'fixture', 'system') RETURNING id`)).rows[0].id;
  await query(`INSERT INTO control_threats (control_id, threat_id) VALUES ($1, $2)`, [controlId, THREAT]);
  componentId = (await query(
    `INSERT INTO control_components (component_type, name, status, document_next_review, created_by)
     VALUES ('information', 'INST Data handling policy', 'operational', '2028-01-01', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
  await query(`INSERT INTO control_component_links (control_id, component_id, created_by) VALUES ($1, $2, $3)`,
    [controlId, componentId, USERS.admin.id]);
  for (const s of [sysA, sysB]) {
    await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [s, controlId]);
  }
  await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'degraded')`,
    [sysA, componentId]);
  riskA = (await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a, risk_score, rationale, validation_status)
     VALUES ($1, $2, 3, 3, 3, 1, 'INST risk', 'validated') RETURNING id`, [sysA, THREAT])).rows[0].id;
});

afterAll(async () => {
  if (actionId) await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  await query(`DELETE FROM audit_log WHERE entity_id = $1`, [componentId]);
  await query(`DELETE FROM risks WHERE id = $1`, [riskA]);
  await query(`DELETE FROM system_components WHERE component_id = $1`, [componentId]);
  await query(`DELETE FROM system_controls WHERE control_id = $1`, [controlId]);
  await query(`DELETE FROM control_component_links WHERE control_id = $1`, [controlId]);
  await query(`DELETE FROM control_threats WHERE control_id = $1`, [controlId]);
  await query(`DELETE FROM control_components WHERE id = $1`, [componentId]);
  await query(`DELETE FROM controls WHERE id = $1`, [controlId]);
  await query(`DELETE FROM systems WHERE id = ANY($1)`, [[sysA, sysB]]);
});

describe('not stated — nothing changes', () => {
  test('the component is present only where it is recorded, in the recorded state', async () => {
    expect(await presence()).toEqual([{ system_id: sysA, status: 'degraded', via: 'recorded' }]);
  });

  test('it is a mandatory per-system candidate, and missing from B’s record', async () => {
    const cand = await request(app).get(`/api/v1/risks/${riskA}/action-items/candidates`).set(as('ciso'));
    expect(cand.body.components.map(c => c.component_id)).toContain(componentId);
    const b = await request(app).get(`/api/v1/systems/${sysB}`).set(as('ciso'));
    expect(b.body.expected_components.map(c => c.id)).toContain(componentId);
  });

  test('the capture list asks about it: implied on two systems, recorded on one', async () => {
    const res = await request(app).get('/api/v1/findings/component-instantiation').set(as('siro'));
    expect(res.status).toBe(200);
    expect(res.body.components.find(c => c.component_id === componentId))
      .toMatchObject({ instantiation: null, implied_on: 2, recorded_on: 1, departments: 1 });
  });
});

describe('recording that it exists once for the organisation', () => {
  test('only the stated values are accepted, and only by components.write', async () => {
    expect((await setInstantiation('sometimes')).status).toBe(400);
    expect((await setInstantiation('organisational', 'siro')).status).toBe(403);
  });

  test('work planned for it per system is withdrawn, with the reason on the item', async () => {
    const res = await request(app).post(`/api/v1/risks/${riskA}/actions/from-gap`).set(as('ciso'))
      .send({ items: [{ element_type: 'component', component_id: componentId }] });
    expect(res.status).toBe(201);
    actionId = res.body.id;
    itemId = (await query(`SELECT id FROM security_action_items WHERE action_id = $1`, [actionId])).rows[0].id;

    expect((await setInstantiation('organisational')).status).toBe(200);
    const { rows: [item] } = await query(`SELECT status, withdrawn_by FROM security_action_items WHERE id = $1`, [itemId]);
    expect(item).toEqual({ status: 'withdrawn', withdrawn_by: USERS.ciso.id });
    const { rows: [note] } = await query(`SELECT note FROM security_action_notes WHERE item_id = $1`, [itemId]);
    expect(note.note).toMatch(/exists once for the organisation/);
  });

  test('the answer is audited, naming who gave it', async () => {
    const { rows } = await query(
      `SELECT user_id, human_narrative FROM audit_log WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1`, [componentId]);
    expect(rows[0].user_id).toBe(USERS.ciso.id);
    expect(rows[0].human_narrative).toMatch(/once for the organisation \(was not stated\)/);
  });

  test('it is present on EVERY system that implies it, in the catalogue state', async () => {
    // Catalogue says operational; A's recorded row says degraded and is not read.
    expect(await presence()).toEqual(
      [sysA, sysB].sort().map(s => ({ system_id: s, status: 'operational', via: 'organisation' })));
  });

  test('its catalogue state is the one state: degrade it and every system follows', async () => {
    await query(`UPDATE control_components SET status = 'planned' WHERE id = $1`, [componentId]);
    expect((await presence()).map(p => p.status)).toEqual(['missing', 'missing']);
    await query(`UPDATE control_components SET status = 'operational' WHERE id = $1`, [componentId]);
  });

  test('it is never a per-system candidate, and never missing from a system’s record', async () => {
    const cand = await request(app).get(`/api/v1/risks/${riskA}/action-items/candidates`).set(as('ciso'));
    expect(cand.body.components.map(c => c.component_id)).not.toContain(componentId);
    const b = await request(app).get(`/api/v1/systems/${sysB}`).set(as('ciso'));
    expect(b.body.expected_components.map(c => c.id)).not.toContain(componentId);
    expect(b.body.components.find(c => c.id === componentId))
      .toMatchObject({ delivered_via: 'organisation', system_status: 'operational', recorded: false });
    // On A it is recorded — the system's own answer, which can be removed.
    const a = await request(app).get(`/api/v1/systems/${sysA}`).set(as('ciso'));
    expect(a.body.components.find(c => c.id === componentId)).toMatchObject({ recorded: true });
  });

  test('its page lists every system that relies on it, not just where it was recorded', async () => {
    const res = await request(app).get(`/api/v1/components/${componentId}`).set(as('ciso'));
    expect(res.body.component.systems.map(s => s.id).sort()).toEqual([sysA, sysB].sort());
  });

  test('the coverage panel labels it rather than calling it absent', async () => {
    const res = await request(app).get(`/api/v1/risks/gap?system_id=${sysB}&threat_id=${THREAT}`).set(as('ciso'));
    const comp = res.body.controls.find(c => c.id === controlId).components.find(c => c.id === componentId);
    expect(comp).toMatchObject({ on_system: true, delivered_via: 'organisation', instantiation: 'organisational' });
  });

  test('its state cannot be set per system — there is one, on the component', async () => {
    const res = await request(app).patch(`/api/v1/systems/${sysA}/components/${componentId}`)
      .set(as('ciso')).send({ status: 'operational' });
    expect(res.status).toBe(409);
  });
});
