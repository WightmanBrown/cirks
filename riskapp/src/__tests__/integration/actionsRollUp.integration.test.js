'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /actions/roll-up — the org-wide view of open remediation work, grouped by
// element (docs/security-actions.md decision #2).
//
// This endpoint had NO test until v114 changed its SQL, which is the failure
// mode recorded in the `feedback_test_the_endpoint_not_the_trigger` memory: a
// fully green suite says nothing about a route nothing calls. The `?mine=1`
// clause in particular is a string built at request time, so a broken one is a
// 500 that only a real request finds.
//
// What v114 changed: a component used to reach `?mine=1` through
// `control_components.owner_department_id` — "my department's components". That
// column is gone (the catalogue has no owning department, see
// docs/component-ownership.md), so a component now reaches it through the
// ITEM's own Responsible owner, the person actually doing the work. Controls
// still match on `controls.owner_user_id` as well.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT = '33333333-0000-0000-0000-000000000001';   // seed: Unpatched Software Exploit

let sysId, riskId, actionId, componentId, controlId;

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id) VALUES ('ROLLUP Sys', $1) RETURNING id`, [IT_DEPT]);
  sysId = s.rows[0].id;

  const r = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1, $2, 3, 3, 3, 1, 'ROLLUP risk', 'validated') RETURNING id`, [sysId, THREAT]);
  riskId = r.rows[0].id;

  const c = await query(
    `INSERT INTO control_components (component_type, name, created_by)
     VALUES ('technology', 'ROLLUP Component', $1) RETURNING id`, [USERS.admin.id]);
  componentId = c.rows[0].id;

  // The control carries a LIBRARY owner (controls.owner_user_id survives v114);
  // the component deliberately has no equivalent. The two halves of `?mine=1`.
  const ct = await query(
    `INSERT INTO controls (title, description, owner_user_id)
     VALUES ('ROLLUP Control', 'fixture', $1) RETURNING id`, [USERS.ciso.id]);
  controlId = ct.rows[0].id;

  // Only items on an ACCEPTED action (planned/in_progress) are in scope.
  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type, primary_owner_user_id, status)
     VALUES ('risk', 'risk_treatment', 'ROLLUP Action', 'fixture', 'mitigate', $1, 'planned') RETURNING id`,
    [USERS.analyst.id]);
  actionId = a.rows[0].id;
  await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1,$2)`,
              [actionId, riskId]);

  // The component item's Responsible is the ANALYST — nobody's department, just
  // a named person. That is the only route a component now has into `?mine=1`.
  await query(
    `INSERT INTO security_action_items
       (action_id, system_id, element_type, component_id, change_kind, owner_user_id, status)
     VALUES ($1, $2, 'component', $3, 'component_improve', $4, 'pending')`,
    [actionId, sysId, componentId, USERS.analyst.id]);
  await query(
    `INSERT INTO security_action_items
       (action_id, system_id, element_type, control_id, change_kind, owner_user_id, status)
     VALUES ($1, $2, 'control', $3, 'control_improve', $4, 'pending')`,
    [actionId, sysId, controlId, USERS.owner.id]);
});

afterAll(async () => {
  if (actionId) {
    await query('DELETE FROM security_action_items WHERE action_id = $1', [actionId]);
    await query('DELETE FROM security_action_risks WHERE action_id = $1', [actionId]);
    await query('DELETE FROM security_actions WHERE id = $1', [actionId]);
  }
  if (riskId)      await query('DELETE FROM risks WHERE id = $1', [riskId]);
  if (sysId)       await query('DELETE FROM systems WHERE id = $1', [sysId]);
  if (componentId) await query('DELETE FROM control_components WHERE id = $1', [componentId]);
  if (controlId)   await query('DELETE FROM controls WHERE id = $1', [controlId]);
});

const rollUp = (who, qs = '') =>
  request(app).get(`/api/v1/actions/roll-up${qs}`).set('Authorization', `Bearer ${tokenFor(who)}`);

describe('GET /actions/roll-up', () => {
  test('returns the open items grouped into controls and components', async () => {
    const res = await rollUp('ciso');
    expect(res.status).toBe(200);
    const cmp = res.body.components.find((x) => x.component_id === componentId);
    const ctl = res.body.controls.find((x) => x.control_id === controlId);
    expect(cmp).toBeTruthy();
    expect(ctl).toBeTruthy();
    expect(cmp.systems_count).toBe(1);
    expect(cmp.systems[0].system_name).toBe('ROLLUP Sys');
    // Each line opens its action — it used to be a dead end.
    expect(cmp.systems[0]).toMatchObject({ action_id: actionId, action_title: 'ROLLUP Action' });
    expect(cmp.systems[0]).toHaveProperty('is_overdue');
  });

  test('a component has NO library owner — the catalogue has no owning department', async () => {
    const res = await rollUp('ciso');
    const cmp = res.body.components.find((x) => x.component_id === componentId);
    expect(cmp.library_owner).toBeNull();
    // …while the per-item Responsible is still named, which is what the page
    // actually needs to show. Losing the department did not lose the person.
    expect(cmp.systems[0].item_owner.user_id).toBe(USERS.analyst.id);
  });

  test('a control keeps its library owner (controls.owner_user_id)', async () => {
    const res = await rollUp('ciso');
    const ctl = res.body.controls.find((x) => x.control_id === controlId);
    expect(ctl.library_owner.user_id).toBe(USERS.ciso.id);
  });

  test('?mine=1 reaches a component through the item owner', async () => {
    // The analyst owns no control in the library and — post-v114 — no component
    // either. The component reaches their list purely as the named Responsible.
    const res = await rollUp('analyst', '?mine=1');
    expect(res.status).toBe(200);
    expect(res.body.components.map((x) => x.component_id)).toContain(componentId);
    expect(res.body.controls.map((x) => x.control_id)).not.toContain(controlId);
  });

  test('?mine=1 reaches a control through the library owner', async () => {
    // The CISO owns the control in the library but is Responsible for no item
    // here, so the control comes back and the component does not.
    const res = await rollUp('ciso', '?mine=1');
    expect(res.status).toBe(200);
    expect(res.body.controls.map((x) => x.control_id)).toContain(controlId);
    expect(res.body.components.map((x) => x.component_id)).not.toContain(componentId);
  });

  test('?mine=1 excludes work that is neither owned nor assigned', async () => {
    // The IAO is Responsible for the CONTROL item but owns nothing in the
    // library, so they get that control and not the component — proving the
    // clause is a real filter and not "everything" with extra steps.
    const res = await rollUp('owner', '?mine=1');
    expect(res.status).toBe(200);
    expect(res.body.controls.map((x) => x.control_id)).toContain(controlId);
    expect(res.body.components.map((x) => x.component_id)).not.toContain(componentId);
  });

  test('a COMPLETED item drops out', async () => {
    await query(
      `UPDATE security_action_items SET status = 'completed'
        WHERE action_id = $1 AND component_id = $2`, [actionId, componentId]);
    const res = await rollUp('ciso');
    expect(res.body.components.map((x) => x.component_id)).not.toContain(componentId);
    await query(
      `UPDATE security_action_items SET status = 'pending'
        WHERE action_id = $1 AND component_id = $2`, [actionId, componentId]);
  });
});
