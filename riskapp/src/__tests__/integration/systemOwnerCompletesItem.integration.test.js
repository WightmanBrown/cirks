'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The system owner may complete an action item, and the API must expose enough
// for a UI to offer them the affordance.
//
// `POST /risks/:id/action-items/:iid/complete` is gated OUTSIDE the capability
// model — "ciso / risk_analyst / admin OR the system owner (custom, not a
// capability — the system owner may not hold risks.write)". That carve-out had
// never been reachable: `RiskDetailPage` gated on `canEdit` (ciso/admin/analyst)
// and `ActionDetailPage` offered nothing at all, so the person named Responsible
// on every item had no button anywhere. These tests pin both halves — the rule
// itself, and the fields a client needs to apply it.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT  = '33333333-0000-0000-0000-000000000001';
const CONTROL = '55555555-0000-0000-0000-000000000001'; // seed: MFA Enforcement

let systemId, riskId, actionId, itemId, componentId;

beforeAll(async () => {
  // A system owned by the IAO — who holds risks.read but NOT risks.write.
  const s = await query(
    `INSERT INTO systems (name, department_id, owner_user_id, impact_c, impact_i, impact_a)
     VALUES ('OWNER-COMPLETE system', $1, $2, 3, 3, 3) RETURNING id`,
    [IT_DEPT, USERS.owner.id]
  );
  systemId = s.rows[0].id;

  const r = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1, $2, 4, 4, 4, 1, 'OWNER-COMPLETE risk', 'validated') RETURNING id`,
    [systemId, THREAT]
  );
  riskId = r.rows[0].id;

  // Already accepted — items are only completable on an accepted action.
  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type,
                                   primary_owner_user_id, status, accepted_at, accepted_by)
     VALUES ('risk', 'risk_treatment', 'OWNER-COMPLETE action', 'carve-out', 'mitigate', $1, 'planned', now(), $2)
     RETURNING id`,
    [USERS.owner.id, USERS.ciso.id]
  );
  actionId = a.rows[0].id;
  await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1, $2)`,
    [actionId, riskId]);

  // v154: an action fixes components, so the item is for a part.
  componentId = (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, created_by)
     VALUES ('technology', 'OWNER-COMPLETE agent', 'operational', 'per_system', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
  const it = await query(
    `INSERT INTO security_action_items
       (action_id, system_id, element_type, component_id, change_kind, owner_user_id, status)
     VALUES ($1, $2, 'component', $3, 'component_add', $4, 'pending')
     RETURNING id`,
    [actionId, systemId, componentId, USERS.owner.id]
  );
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
  await query(`DELETE FROM control_components WHERE id = $1`, [componentId]);
});

// The fixture is only meaningful if the owner genuinely lacks risks.write —
// otherwise the carve-out is never exercised and the test proves nothing.
test('the IAO holds risks.read but not risks.write', async () => {
  const { rows } = await query(
    `SELECT capability_key FROM role_permissions
      WHERE role = 'information_asset_owner' AND capability_key LIKE 'risks.%'`);
  const caps = rows.map(r => r.capability_key);
  expect(caps).toContain('risks.read');
  expect(caps).not.toContain('risks.write');
});

test('GET /risks/:id exposes the system owner', async () => {
  const res = await request(app).get(`/api/v1/risks/${riskId}`)
    .set('Authorization', `Bearer ${tokenFor('owner')}`);
  expect(res.status).toBe(200);
  expect(res.body.system_owner_user_id).toBe(USERS.owner.id);
});

test('GET /actions/:id exposes the item’s system owner and each risk’s system', async () => {
  const res = await request(app).get(`/api/v1/actions/${actionId}`)
    .set('Authorization', `Bearer ${tokenFor('owner')}`);
  expect(res.status).toBe(200);

  const item = res.body.items.find(i => i.id === itemId);
  expect(item.system.owner_user_id).toBe(USERS.owner.id);

  // Needed to record completion against the risk sharing the item's system,
  // so a control's confirmed residual lands on the right risk.
  const risk = res.body.risks.find(r => r.risk_id === riskId);
  expect(risk.system_id).toBe(systemId);
});

test('a dept-scoped user who is NOT the system owner is refused', async () => {
  const res = await request(app)
    .post(`/api/v1/risks/${riskId}/action-items/${itemId}/complete`)
    .set('Authorization', `Bearer ${tokenFor('iam')}`)
    .send({ probability_c: 2, probability_i: 2, probability_a: 2 });
  expect(res.status).toBe(403);
});

test('the system owner completes the item, and it lands on the right risk', async () => {
  const res = await request(app)
    .post(`/api/v1/risks/${riskId}/action-items/${itemId}/complete`)
    .set('Authorization', `Bearer ${tokenFor('owner')}`)
    .send({ probability_c: 2, probability_i: 2, probability_a: 2 });
  expect(res.status).toBe(200);

  const { rows: item } = await query(
    `SELECT status, completed_by FROM security_action_items WHERE id = $1`, [itemId]);
  expect(item[0].status).toBe('completed');
  expect(item[0].completed_by).toBe(USERS.owner.id);

  // The component is recorded on the system as working — the write the
  // affordance exists to make. (Before v154 the item was for a control, and
  // completing it marked the objective operational and wrote its residual.)
  const { rows: syc } = await query(
    `SELECT status FROM system_components WHERE system_id = $1 AND component_id = $2`,
    [systemId, componentId]);
  expect(syc[0].status).toBe('operational');
});
