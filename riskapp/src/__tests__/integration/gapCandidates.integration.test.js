'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /risks/:id/action-items/candidates — the coverage gap turned into a list
// of things someone could be asked to fix. It is the ONLY way to author a
// security action (docs/security-actions.md), so a break here stops remediation
// being recorded at all.
//
// Like the roll-up, it had no test of its own: the RBAC matrix calls it with a
// nonexistent risk id, which 404s long before the component query runs. v114
// edited that query — dropping the departments join and the owner column from
// its GROUP BY — so this pins the shape it returns.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT = '33333333-0000-0000-0000-000000000001';   // seed: Unpatched Software Exploit

let sysId, riskId, componentId, controlId;

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id, owner_user_id) VALUES ('GAP Sys', $1, $2) RETURNING id`,
    [IT_DEPT, USERS.owner.id]);
  sysId = s.rows[0].id;

  const ct = await query(
    `INSERT INTO controls (title, description, owner_user_id)
     VALUES ('GAP Control', 'fixture', $1) RETURNING id`, [USERS.ciso.id]);
  controlId = ct.rows[0].id;

  // The control must be linked to the THREAT, or it is not part of this risk's
  // coverage and no candidate is derived from it.
  await query(`INSERT INTO control_threats (control_id, threat_id) VALUES ($1,$2)
               ON CONFLICT DO NOTHING`, [controlId, THREAT]);

  const c = await query(
    `INSERT INTO control_components (component_type, name, created_by)
     VALUES ('technology', 'GAP Component', $1) RETURNING id`, [USERS.admin.id]);
  componentId = c.rows[0].id;
  await query(`INSERT INTO control_component_links (control_id, component_id, created_by)
               VALUES ($1,$2,$3)`, [controlId, componentId, USERS.admin.id]);

  // On the system but DEGRADED — that is what makes it a mandatory candidate.
  await query(
    `INSERT INTO system_components (system_id, component_id, status) VALUES ($1,$2,'degraded')`,
    [sysId, componentId]);

  const r = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1, $2, 3, 3, 3, 1, 'GAP risk', 'validated') RETURNING id`, [sysId, THREAT]);
  riskId = r.rows[0].id;
});

const actionIds = [];

afterAll(async () => {
  if (actionIds.length) await query('DELETE FROM security_actions WHERE id = ANY($1)', [actionIds]);
  if (riskId)      await query('DELETE FROM risks WHERE id = $1', [riskId]);
  if (sysId)       await query('DELETE FROM system_components WHERE system_id = $1', [sysId]);
  if (controlId)   await query('DELETE FROM control_component_links WHERE control_id = $1', [controlId]);
  if (controlId)   await query('DELETE FROM control_threats WHERE control_id = $1', [controlId]);
  if (sysId)       await query('DELETE FROM systems WHERE id = $1', [sysId]);
  if (componentId) await query('DELETE FROM control_components WHERE id = $1', [componentId]);
  if (controlId)   await query('DELETE FROM controls WHERE id = $1', [controlId]);
});

const candidates = () =>
  request(app).get(`/api/v1/risks/${riskId}/action-items/candidates`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`);

describe('GET /risks/:id/action-items/candidates', () => {
  test('a non-operational component on the system is a mandatory candidate', async () => {
    const res = await candidates();
    expect(res.status).toBe(200);
    const cmp = res.body.components.find((x) => x.component_id === componentId);
    expect(cmp).toBeTruthy();
    expect(cmp.mandatory).toBe(true);
    expect(cmp.system_status).toBe('degraded');
    expect(cmp.change_kind).toBe('component_improve');
    expect(cmp.via_controls).toContain('GAP Control');
  });

  test('it carries no library owner — the catalogue has no owning department (v114)', async () => {
    const cmp = (await candidates()).body.components.find((x) => x.component_id === componentId);
    expect(cmp.library_owner).toBeNull();
    // The suggested owner is the SYSTEM owner, which is what actually fills the
    // per-item owner box, and is unaffected by dropping component ownership.
    expect(cmp.default_owner.user_id).toBe(USERS.owner.id);
  });

  test('an operational component is not a candidate', async () => {
    await query(`UPDATE system_components SET status = 'operational'
                  WHERE system_id = $1 AND component_id = $2`, [sysId, componentId]);
    const res = await candidates();
    expect(res.body.components.map((x) => x.component_id)).not.toContain(componentId);
    await query(`UPDATE system_components SET status = 'degraded'
                  WHERE system_id = $1 AND component_id = $2`, [sysId, componentId]);
  });
});

// The same work planned twice for one risk — found on CIRKS-test 2026-09-28,
// where two actions built a day apart both planned PR.IR-03. The builder showed
// a bare "already actioned" tag beside a tickable box, and pre-ticked EVERY
// non-operational component, so a second action always re-planned them.
describe('what a live action on this risk already plans', () => {
  const build = (items) => request(app).post(`/api/v1/risks/${riskId}/actions/from-gap`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`).send({ title: 'GAP first', items });

  test('once planned, a candidate names the action that plans it', async () => {
    // v154: an action is made of component items only.
    expect((await build([{ element_type: 'control', control_id: controlId }])).body.code).toBe('control_items_retired');
    const res = await build([{ element_type: 'component', component_id: componentId }]);
    expect(res.status).toBe(201);
    const first = res.body.action_id || res.body.id;
    actionIds.push(first);

    const body = (await candidates()).body;
    const cmp = body.components.find((x) => x.component_id === componentId);
    expect(cmp.open_action).toMatchObject({ id: first, title: 'GAP first', status: 'proposed' });
    expect(cmp.already_in_open_action).toBe(true);
    expect(body.controls).toEqual([]);
  });

  test('a second action that adds nothing new is refused — there must be an item', async () => {
    const res = await request(app).post(`/api/v1/risks/${riskId}/actions/from-gap`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`)
      .send({ title: 'GAP second', items: [] });
    expect(res.status).toBe(400);
  });

  test('a CANCELLED action plans nothing — the component is mandatory again', async () => {
    await query(`UPDATE security_actions SET status = 'cancelled' WHERE id = ANY($1)`, [actionIds]);
    const body = (await candidates()).body;
    expect(body.components.find((x) => x.component_id === componentId).open_action).toBeNull();
    expect(body.components.find((x) => x.component_id === componentId).mandatory).toBe(true);
  });
});
