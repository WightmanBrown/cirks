'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Excluding a control from a system (0117/0118).
//
// A control linked to a threat may still be inappropriate on a particular
// system. Owner's constraint: an excluded control "must not form part of the
// probability calculation for the target risk" — and it is equally out of the
// current one. It is neither a contributor nor a gap.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT  = '33333333-0000-0000-0000-000000000001'; // inherent 4/4/4
const KEEP    = '55555555-0000-0000-0000-000000000001'; // MFA Enforcement
const EXCLUDE = '55555555-0000-0000-0000-000000000002'; // Patch Management

let systemId, riskId;

const patch = (controlId, body, who = 'ciso') => request(app)
  .patch(`/api/v1/systems/${systemId}/controls/${controlId}`)
  .set('Authorization', `Bearer ${tokenFor(who)}`).send(body);

const gap = () => request(app)
  .get(`/api/v1/risks/gap?system_id=${systemId}&threat_id=${THREAT}&risk_id=${riskId}`)
  .set('Authorization', `Bearer ${tokenFor('ciso')}`);

const candidates = () => request(app)
  .get(`/api/v1/risks/${riskId}/action-items/candidates`)
  .set('Authorization', `Bearer ${tokenFor('ciso')}`);

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id, owner_user_id, impact_c, impact_i, impact_a)
     VALUES ('EXCLUSION system', $1, $2, 3, 3, 3) RETURNING id`, [IT_DEPT, USERS.owner.id]);
  systemId = s.rows[0].id;
  const r = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1,$2,4,4,4,1,'EXCLUSION risk','validated') RETURNING id`, [systemId, THREAT]);
  riskId = r.rows[0].id;
  for (const c of [KEEP, EXCLUDE]) {
    await query(`INSERT INTO control_threats (control_id, threat_id, created_by)
                 VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [c, THREAT, USERS.analyst.id]);
    await query(`INSERT INTO system_controls (system_id, control_id, status, provenance, created_by)
                 VALUES ($1,$2,'missing','recorded',$3)`, [systemId, c, USERS.analyst.id]);
  }
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_id = $1`, [systemId]);
  await query(`DELETE FROM risk_control_probability WHERE risk_id = $1`, [riskId]);
  await query(`DELETE FROM security_action_items WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM system_controls WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM system_components WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM risks WHERE id = $1`, [riskId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
  await query(`DELETE FROM control_threats WHERE threat_id = $1 AND control_id = ANY($2)`,
    [THREAT, [KEEP, EXCLUDE]]);
});

test('excluding without a reason is refused', async () => {
  const res = await patch(EXCLUDE, { status: 'not_applicable' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/exclusion_reason is required/i);
  expect((await patch(EXCLUDE, { status: 'not_applicable', exclusion_reason: '   ' })).status).toBe(400);
});

test('excluding with a reason succeeds and records who decided', async () => {
  const res = await patch(EXCLUDE, {
    status: 'not_applicable',
    exclusion_reason: 'Air-gapped; this system has no external update path.',
  });
  expect(res.status).toBe(204);

  const { rows } = await query(
    `SELECT status, exclusion_reason, excluded_by, excluded_at IS NOT NULL AS dated
       FROM system_controls WHERE system_id = $1 AND control_id = $2`, [systemId, EXCLUDE]);
  expect(rows[0]).toMatchObject({
    status: 'not_applicable', excluded_by: USERS.ciso.id, dated: true,
  });
  expect(rows[0].exclusion_reason).toMatch(/Air-gapped/);
});

// The decision is audited by a TRIGGER, so direct SQL is caught too (v106's rule).
test('the exclusion is written to audit_log with its reason', async () => {
  const { rows } = await query(
    `SELECT user_name, user_role, action, human_narrative FROM audit_log
      WHERE entity_type = 'system_controls' AND entity_id = $1
      ORDER BY created_at DESC LIMIT 1`, [systemId]);
  expect(rows[0].human_narrative).toMatch(/excluded from system .*Air-gapped/);
  expect(rows[0]).toMatchObject({ user_role: 'ciso', action: 'update' });
});

// The owner's constraint, both halves.
test('an excluded control is NOT offered as a remediation candidate', async () => {
  const res = await candidates();
  expect(res.status).toBe(200);
  // v154: no control is offered as an item any more — an action fixes
  // components. A control objective that is not in place and has nothing on the
  // system to fix is listed as `blocked`, with the reason; an excluded one is not.
  expect(res.body.controls).toEqual([]);
  const ids = res.body.blocked.map(c => c.control_id);
  expect(ids).toContain(KEEP);        // still a genuine gap
  expect(ids).not.toContain(EXCLUDE); // a decision, not a gap
});

test('an excluded control stays VISIBLE on the coverage panel, with its reason', async () => {
  const res = await gap();
  expect(res.status).toBe(200);
  const row = res.body.controls.find(c => c.id === EXCLUDE);
  expect(row.system_status).toBe('not_applicable');
  expect(row.exclusion_reason).toMatch(/Air-gapped/);
  expect(row.excluded_by_name).toBeTruthy();
});

test('an excluded control contributes nothing to the CURRENT risk probability', async () => {
  // Judge it far below the inherent, then exclude it: if exclusion leaked into
  // the aggregate the risk would fall to 1.
  await query(`UPDATE system_controls SET status='operational', exclusion_reason=NULL,
                      excluded_by=NULL, excluded_at=NULL
                WHERE system_id=$1 AND control_id=$2`, [systemId, EXCLUDE]);
  await request(app).put(`/api/v1/risks/${riskId}/controls/${EXCLUDE}/probability`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`)
    .send({ probability_c: 1, probability_i: 1, probability_a: 1 });

  let { rows } = await query(`SELECT probability_c FROM risks WHERE id=$1`, [riskId]);
  expect(rows[0].probability_c).toBe(1);            // deployed: it counts

  expect((await patch(EXCLUDE, {
    status: 'not_applicable', exclusion_reason: 'Not appropriate here.' })).status).toBe(204);

  ({ rows } = await query(`SELECT probability_c FROM risks WHERE id=$1`, [riskId]));
  expect(rows[0].probability_c).toBe(4);            // excluded: back to the inherent
});

test('re-including clears the reason — a stale justification reads as current', async () => {
  expect((await patch(EXCLUDE, { status: 'missing' })).status).toBe(204);
  const { rows } = await query(
    `SELECT status, exclusion_reason, excluded_by, excluded_at FROM system_controls
      WHERE system_id=$1 AND control_id=$2`, [systemId, EXCLUDE]);
  expect(rows[0]).toMatchObject({
    status: 'missing', exclusion_reason: null, excluded_by: null, excluded_at: null });
});

test('a component cannot be excluded — the concept is not modelled for them', async () => {
  const cc = await query(
    `INSERT INTO control_components (name, component_type, status, created_by)
     VALUES ('EXCLUSION component', 'technology', 'operational', $1) RETURNING id`,
    [USERS.analyst.id]);
  await query(`INSERT INTO system_components (system_id, component_id, status)
               VALUES ($1,$2,'missing')`, [systemId, cc.rows[0].id]);
  const res = await request(app)
    .patch(`/api/v1/systems/${systemId}/components/${cc.rows[0].id}`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`).send({ status: 'not_applicable' });
  expect(res.status).toBe(400);
  await query(`DELETE FROM system_components WHERE component_id = $1`, [cc.rows[0].id]);
  await query(`DELETE FROM control_components WHERE id = $1`, [cc.rows[0].id]);
});

// The other half of the constraint, and the harder one: an item created BEFORE
// the exclusion must stop counting toward the TARGET. Preventing new candidates
// is not enough on its own.
test('an excluded control leaves the TARGET risk, even via an item that already existed', async () => {
  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type,
                                   primary_owner_user_id, status, accepted_at, accepted_by)
     VALUES ('risk', 'risk_treatment', 'EXCLUSION action','t','mitigate',$1,'in_progress',now(),$2) RETURNING id`,
    [USERS.owner.id, USERS.ciso.id]);
  const actionId = a.rows[0].id;
  await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1,$2)`,
    [actionId, riskId]);
  await query(
    `INSERT INTO security_action_items
       (action_id, system_id, element_type, control_id, change_kind, owner_user_id,
        target_p_c, target_p_i, target_p_a, status)
     VALUES ($1,$2,'control',$3,'control_add',$4,1,1,1,'pending')`,
    [actionId, systemId, EXCLUDE, USERS.owner.id]);

  const heatmap = () => request(app).get('/api/v1/operations/risk-heatmap/current')
    .set('Authorization', `Bearer ${tokenFor('ciso')}`);
  const rowOf = (body) => (body.risks ?? body).find(r => (r.risk_id ?? r.id) === riskId);

  // v154: a control item no longer sets the target at all — Target risk is
  // derived from the components being fixed — so this old item promises nothing
  // even while the control is a live gap.
  await query(`UPDATE system_controls SET status='missing', exclusion_reason=NULL,
                      excluded_by=NULL, excluded_at=NULL
                WHERE system_id=$1 AND control_id=$2`, [systemId, EXCLUDE]);
  expect(rowOf((await heatmap()).body).tgt_p_c).toBeNull();

  // Excluding it withdraws that promise: nobody intends to deliver the work.
  expect((await patch(EXCLUDE, {
    status: 'not_applicable', exclusion_reason: 'Superseded by the platform baseline.',
  })).status).toBe(204);
  expect(rowOf((await heatmap()).body).tgt_p_c).toBeNull();

  await query(`DELETE FROM security_action_items WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
});

// 0119 — the worklist half. Keeping an excluded control out of the arithmetic
// left an item nobody would ever do sitting `pending` in five different counts.
describe('withdrawing the work planned for an excluded control', () => {
  let actionId, itemId;

  beforeAll(async () => {
    await query(`UPDATE system_controls SET status='missing', exclusion_reason=NULL,
                        excluded_by=NULL, excluded_at=NULL
                  WHERE system_id=$1 AND control_id=$2`, [systemId, EXCLUDE]);
    const a = await query(
      `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type,
                                     primary_owner_user_id, status, accepted_at, accepted_by)
       VALUES ('risk', 'risk_treatment', 'WITHDRAW action','t','mitigate',$1,'in_progress',now(),$2) RETURNING id`,
      [USERS.owner.id, USERS.ciso.id]);
    actionId = a.rows[0].id;
    await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1,$2)`,
      [actionId, riskId]);
    const it = await query(
      `INSERT INTO security_action_items
         (action_id, system_id, element_type, control_id, change_kind, owner_user_id,
          target_p_c, target_p_i, target_p_a, status)
       VALUES ($1,$2,'control',$3,'control_add',$4,1,1,1,'pending') RETURNING id`,
      [actionId, systemId, EXCLUDE, USERS.owner.id]);
    itemId = it.rows[0].id;
  });

  afterAll(async () => {
    await query(`DELETE FROM security_action_notes WHERE action_id = $1`, [actionId]);
    await query(`DELETE FROM security_action_items WHERE action_id = $1`, [actionId]);
    await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
    await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  });

  test('excluding the control withdraws its open item', async () => {
    const before = await query(`SELECT status FROM security_action_items WHERE id=$1`, [itemId]);
    expect(before.rows[0].status).toBe('pending');

    expect((await patch(EXCLUDE, {
      status: 'not_applicable', exclusion_reason: 'Handled by the platform baseline.',
    })).status).toBe(204);

    const { rows } = await query(
      `SELECT status, withdrawn_by, withdrawn_at IS NOT NULL AS dated
         FROM security_action_items WHERE id=$1`, [itemId]);
    expect(rows[0]).toMatchObject({
      status: 'withdrawn', withdrawn_by: USERS.ciso.id, dated: true });
  });

  // Deleting the item would erase the fact that the work was ever planned, which
  // is the opposite of what an audit narrative is for.
  test('the item survives, carrying a note that says why', async () => {
    const res = await request(app).get(`/api/v1/actions/${actionId}`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    const item = res.body.items.find(i => i.id === itemId);
    expect(item).toBeDefined();
    expect(item.status).toBe('withdrawn');
    expect(item.notes.map(n => n.note).join(' ')).toMatch(/Withdrawn.*platform baseline/);
  });

  test('a withdrawn item stops counting as outstanding work', async () => {
    const stats = await request(app).get('/api/v1/actions/stats')
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(stats.status).toBe(200);
    // The item is the only one on this action, so the action contributes none.
    const detail = await request(app).get(`/api/v1/actions/${actionId}`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    expect(detail.body.items_done).toBe(0);
    const openOnThisAction = detail.body.items
      .filter(i => !['completed', 'withdrawn'].includes(i.status)).length;
    expect(openOnThisAction).toBe(0);
  });

  test('re-including does NOT resurrect the withdrawn item', async () => {
    expect((await patch(EXCLUDE, { status: 'missing' })).status).toBe(204);
    const { rows } = await query(`SELECT status FROM security_action_items WHERE id=$1`, [itemId]);
    // Stale work with a stale target should not reappear; build a fresh action.
    expect(rows[0].status).toBe('withdrawn');
  });
});
