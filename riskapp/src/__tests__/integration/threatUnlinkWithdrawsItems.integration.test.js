'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Unlinking a control from a threat withdraws the work planned for it (0121).
//
// A risk's mitigating controls are `system_controls ∩ control_threats`, so
// removing the link removes the control from every risk for that threat. The
// action items planned against it then outlive their own justification: they
// stay on someone's worklist and — the sharp end — keep feeding the Target Risk
// column with a reduction that cannot happen. Found on risk afff08d2, whose
// entire target rested on two controls the coverage panel no longer listed.
//
// Same treatment as 0119's exclusion: withdrawn, not deleted, with the reason
// recorded against the item.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT_A = '33333333-0000-0000-0000-000000000001';
const THREAT_B = '33333333-0000-0000-0000-000000000002';
const CONTROL  = '55555555-0000-0000-0000-000000000001';

let systemId, riskA, riskB, actionId;

const unlink = (threatId, who = 'ciso') => request(app)
  .delete(`/api/v1/threats/${threatId}/controls/${CONTROL}`)
  .set('Authorization', `Bearer ${tokenFor(who)}`);

const itemState = async (id) => (await query(
  `SELECT sai.status, sai.withdrawn_at, sai.withdrawn_by,
          (SELECT n.note FROM security_action_notes n
            WHERE n.item_id = sai.id ORDER BY n.created_at DESC LIMIT 1) AS note
     FROM security_action_items sai WHERE sai.id = $1`, [id])).rows[0];

const newItem = async (targets = [2, 2, 2]) => (await query(
  `INSERT INTO security_action_items
     (action_id, system_id, element_type, change_kind, control_id, status,
      target_p_c, target_p_i, target_p_a)
   VALUES ($1,$2,'control','control_improve',$3,'pending',$4,$5,$6) RETURNING id`,
  [actionId, systemId, CONTROL, ...targets])).rows[0].id;

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id, owner_user_id, impact_c, impact_i, impact_a)
     VALUES ('UNLINK system', $1, $2, 3, 3, 3) RETURNING id`, [IT_DEPT, USERS.owner.id]);
  systemId = s.rows[0].id;

  for (const t of [THREAT_A, THREAT_B]) {
    await query(`INSERT INTO control_threats (control_id, threat_id, created_by)
                 VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [CONTROL, t, USERS.analyst.id]);
  }
  await query(`INSERT INTO system_controls (system_id, control_id, status, provenance, created_by)
               VALUES ($1,$2,'degraded','recorded',$3)`, [systemId, CONTROL, USERS.analyst.id]);

  const mk = async (threatId) => (await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1,$2,4,4,4,12,'UNLINK risk','validated') RETURNING id`, [systemId, threatId])).rows[0].id;
  riskA = await mk(THREAT_A);
  riskB = await mk(THREAT_B);

  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type, status,
                                   primary_owner_user_id, created_by)
     VALUES ('risk', 'risk_treatment', 'UNLINK action', 'Fixture action for the threat-unlink tests.',
             'mitigate', 'planned', $1, $1)
     RETURNING id`, [USERS.ciso.id]);
  actionId = a.rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM security_action_notes WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_action_items WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  await query(`DELETE FROM audit_log WHERE entity_type = 'control_threats'
                 AND entity_id = ANY($1)`, [[THREAT_A, THREAT_B]]);
  await query(`DELETE FROM system_controls WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM risks WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
  await query(`DELETE FROM control_threats WHERE control_id = $1
                 AND threat_id = ANY($2)`, [CONTROL, [THREAT_A, THREAT_B]]);
});

beforeEach(async () => {
  // Re-link and re-point the action at risk A only; each test re-establishes it.
  for (const t of [THREAT_A, THREAT_B]) {
    await query(`INSERT INTO control_threats (control_id, threat_id, created_by)
                 VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [CONTROL, t, USERS.analyst.id]);
  }
  await query(`DELETE FROM security_action_notes WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_action_items WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
  await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1,$2)`,
    [actionId, riskA]);
});

describe('unlinking a control from a threat', () => {
  it('withdraws the open item planned against it, and says why on the item', async () => {
    const id = await newItem();
    await unlink(THREAT_A).expect(204);

    const it = await itemState(id);
    expect(it.status).toBe('withdrawn');
    expect(it.withdrawn_at).not.toBeNull();
    expect(it.withdrawn_by).toBe(USERS.ciso.id);       // the actor, not "unattributed"
    expect(it.note).toMatch(/no longer one of the controls countering/i);
  });

  it('records the unlink in audit_log with a readable narrative', async () => {
    await newItem();
    await unlink(THREAT_A).expect(204);

    const { rows } = await query(
      `SELECT user_name, action, human_narrative, changes FROM audit_log
        WHERE entity_type = 'control_threats' AND entity_id = $1
        ORDER BY created_at DESC LIMIT 1`, [THREAT_A]);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('link_control_threat');
    expect(rows[0].changes.unlinked).toBe(true);
    expect(rows[0].human_narrative).toMatch(/removed from the controls countering/i);
  });

  // The item is justified by ANY live risk on the action whose threat still
  // links the control. Withdrawing on the first unlink would abandon work that
  // is still treating something.
  it('leaves the item alone while another risk on the action still needs it', async () => {
    await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1,$2)`,
      [actionId, riskB]);
    const id = await newItem();

    await unlink(THREAT_A).expect(204);
    expect((await itemState(id)).status).toBe('pending');

    // …and withdraws once the last justification goes.
    await unlink(THREAT_B).expect(204);
    expect((await itemState(id)).status).toBe('withdrawn');
  });

  it('does not disturb an item that is already completed', async () => {
    const id = await newItem();
    await query(`UPDATE security_action_items SET status='completed' WHERE id=$1`, [id]);
    await unlink(THREAT_A).expect(204);
    expect((await itemState(id)).status).toBe('completed');
  });
});

describe('the Target Risk column', () => {
  const targetFor = async (riskId) => {
    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap/current')
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    const row = (res.body.risks || []).find(r => r.risk_id === riskId);
    if (!row) throw new Error(`risk ${riskId} not in the heatmap (${res.body.count} rows)`);
    return row;
  };

  it('stops counting a control that no longer counters the threat', async () => {
    await newItem([1, 1, 1]);
    // v154: a control item no longer sets the target at all; the unlink still
    // withdraws it (asserted above) and the target stays empty.
    const before = await targetFor(riskA);
    expect(before.tgt_p_c).toBeNull();

    await unlink(THREAT_A).expect(204);

    // Withdrawn by the trigger AND excluded by the query — belt and braces,
    // because the query guard is what covers items orphaned before 0121.
    const after = await targetFor(riskA);
    expect(after.tgt_p_c).toBeNull();
  });

  it('ignores an orphaned item even if it was never withdrawn', async () => {
    const id = await newItem([1, 1, 1]);
    // Simulate the pre-0121 state: the link is gone, the item never withdrawn.
    await query(`DELETE FROM control_threats WHERE control_id=$1 AND threat_id=$2`,
      [CONTROL, THREAT_A]);
    await query(`UPDATE security_action_items SET status='pending', withdrawn_at=NULL WHERE id=$1`,
      [id]);

    expect((await targetFor(riskA)).tgt_p_c).toBeNull();
  });
});
