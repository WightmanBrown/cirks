'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /actions/:id must carry everything the audit narrative asserts, because the
// narrative is derived entirely on the client and cannot invent what the payload
// omits. Specifically: the ROLE each person acts in (the record names people and
// their role, not just a name), the accept-time risk baseline, and the residual
// actually CONFIRMED at completion — which is not the same number as the target
// that was planned, and the difference is the part an auditor reads.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT  = '33333333-0000-0000-0000-000000000001';
const CONTROL = '55555555-0000-0000-0000-000000000001';

let systemId, riskId, actionId, itemId;

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id, owner_user_id, impact_c, impact_i, impact_a)
     VALUES ('NARRATIVE system', $1, $2, 3, 3, 3) RETURNING id`, [IT_DEPT, USERS.owner.id]);
  systemId = s.rows[0].id;

  const r = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1, $2, 4, 4, 4, 1, 'NARRATIVE risk', 'validated') RETURNING id`,
    [systemId, THREAT]);
  riskId = r.rows[0].id;

  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type,
                                   primary_owner_user_id, status, accepted_at, accepted_by)
     VALUES ('risk', 'risk_treatment', 'NARRATIVE action', 'for the record', 'mitigate', $1, 'planned', now(), $2)
     RETURNING id`, [USERS.owner.id, USERS.ciso.id]);
  actionId = a.rows[0].id;

  // A baseline snapshot, as POST .../accept would have written.
  await query(
    `INSERT INTO security_action_risks (action_id, risk_id, baseline_risk_c,
                                        baseline_risk_i, baseline_risk_a, baseline_risk_score)
     VALUES ($1, $2, 12, 12, 12, 12)`, [actionId, riskId]);

  const it = await query(
    `INSERT INTO security_action_items
       (action_id, system_id, element_type, control_id, change_kind,
        owner_user_id, target_p_c, target_p_i, target_p_a, status, comment)
     VALUES ($1, $2, 'control', $3, 'control_add', $4, 2, 2, 2, 'pending',
             'Not present on this system; agreed at the August SWG.')
     RETURNING id`, [actionId, systemId, CONTROL, USERS.owner.id]);
  itemId = it.rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM risk_control_probability WHERE risk_id = $1`, [riskId]);
  await query(`DELETE FROM security_action_items WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  await query(`DELETE FROM system_controls WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM system_components WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM risks WHERE id = $1`, [riskId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
});

const detail = () => request(app).get(`/api/v1/actions/${actionId}`)
  .set('Authorization', `Bearer ${tokenFor('ciso')}`);

test('the payload names each person’s ROLE, not only their name', async () => {
  const res = await detail();
  expect(res.status).toBe(200);
  expect(res.body.owner_role).toBe('information_asset_owner');
  const item = res.body.items.find(i => i.id === itemId);
  expect(item.owner).toMatchObject({ name: expect.any(String), role: 'information_asset_owner' });
});

test('the accept-time baseline travels with the linked risk', async () => {
  const risk = (await detail()).body.risks.find(r => r.risk_id === riskId);
  expect(risk).toMatchObject({
    baseline_risk_c: 12, baseline_risk_i: 12, baseline_risk_a: 12, baseline_risk_score: 12,
  });
});

test('the rationale recorded when the item was built is returned', async () => {
  const item = (await detail()).body.items.find(i => i.id === itemId);
  expect(item.comment).toBe('Not present on this system; agreed at the August SWG.');
});

test('an open item has a target but no confirmed residual', async () => {
  const item = (await detail()).body.items.find(i => i.id === itemId);
  expect(item.target).toMatchObject({ c: 2, i: 2, a: 2 });
  expect(item.confirmed).toBeNull();
});

// v154: a control item can no longer be completed — a control objective cannot
// be fixed directly, only its components. The item and the target it carried
// stay readable as history.
test('a control item is no longer completed, and its record stays readable', async () => {
  const done = await request(app)
    .post(`/api/v1/risks/${riskId}/action-items/${itemId}/complete`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`)
    .send({ probability_c: 3, probability_i: 3, probability_a: 3 });
  expect(done.status).toBe(409);
  expect(done.body.code).toBe('control_items_retired');

  const item = (await detail()).body.items.find(i => i.id === itemId);
  expect(item.target).toMatchObject({ c: 2, i: 2, a: 2 });
  expect(item.confirmed).toBeNull();
});
