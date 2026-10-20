'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The risk calculation counts a control wherever it REACHES (v128).
//
// Fixture: seed risk ...0003 (HR System, threat ...0001) sits at its inherent 4/4/4
// because nothing countering the threat is deployed there. A new control linked to
// that threat is given a JUDGED residual of 2/2/2 for the risk — reach makes a
// control present; only a judged residual makes it lower a risk.

const { app, request, tokenFor, query } = require('./helpers');

const RISK    = '66666666-0000-0000-0000-000000000003';
const SYSTEM  = '44444444-0000-0000-0000-000000000002';
const THREAT  = '33333333-0000-0000-0000-000000000001';
const CISO    = '11111111-0000-0000-0000-000000000002';

const get = (path) => request(app).get(path).set('Authorization', `Bearer ${tokenFor('ciso')}`);
const prob = async () => {
  const { rows } = await query(`SELECT probability_c||'/'||probability_i||'/'||probability_a AS p FROM risks WHERE id = $1`, [RISK]);
  return rows[0].p;
};

let ctl, group, scope;

beforeAll(async () => {
  const c = await query(`INSERT INTO controls (title, control_type, created_by) VALUES ('REACH awareness training', 'preventive', $1) RETURNING id`, [CISO]);
  ctl = c.rows[0].id;
  await query(`INSERT INTO soa_entries (control_id, applicable, implementation_status) VALUES ($1, TRUE, 'implemented')`, [ctl]);
  await query(`INSERT INTO control_threats (control_id, threat_id, created_by) VALUES ($1, $2, $3)`, [ctl, THREAT, CISO]);
  await query(`INSERT INTO risk_control_probability (risk_id, control_id, probability_c, probability_i, probability_a, set_by)
               VALUES ($1, $2, 2, 2, 2, $3)`, [RISK, ctl, CISO]);
  const g = await query(`INSERT INTO control_components (name, component_type, created_by) VALUES ('REACH HR staff', 'people', $1) RETURNING id`, [CISO]);
  group = g.rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM soa_entry_scopes WHERE control_id = $1`, [ctl]);
  if (scope) await query(`DELETE FROM scopes WHERE id = $1`, [scope]);
  await query(`DELETE FROM controls WHERE id = $1`, [ctl]);            // cascades links; triggers restore scores
  await query(`DELETE FROM control_components WHERE id = $1`, [group]);
});

describe('a control counts where it reaches', () => {
  it('not stated and not deployed: the risk stays at its inherent', async () => {
    expect(await prob()).toBe('4/4/4');
  });

  it('organisation-wide: it counts on this system without being attached — the mode change recomputes', async () => {
    await query(`UPDATE controls SET delivery = 'organisation' WHERE id = $1`, [ctl]);
    expect(await prob()).toBe('2/2/2');
  });

  it('its implementation status is its status: partial counts as degraded (one rung worse)', async () => {
    await query(`UPDATE soa_entries SET implementation_status = 'partial' WHERE control_id = $1`, [ctl]);
    expect(await prob()).toBe('3/3/3');
    await query(`UPDATE soa_entries SET implementation_status = 'planned' WHERE control_id = $1`, [ctl]);
    expect(await prob()).toBe('4/4/4');                                   // not counted
    await query(`UPDATE soa_entries SET implementation_status = 'implemented' WHERE control_id = $1`, [ctl]);
    expect(await prob()).toBe('2/2/2');
  });

  it('not applicable: it reaches nothing', async () => {
    await query(`UPDATE soa_entries SET applicable = FALSE WHERE control_id = $1`, [ctl]);
    expect(await prob()).toBe('4/4/4');
    await query(`UPDATE soa_entries SET applicable = TRUE WHERE control_id = $1`, [ctl]);
    expect(await prob()).toBe('2/2/2');
  });

  it('narrowed to a scope without this system: it no longer reaches it', async () => {
    const s = await query(`INSERT INTO scopes (name) VALUES ('REACH elsewhere') RETURNING id`);
    scope = s.rows[0].id;
    await query(`INSERT INTO soa_entry_scopes (control_id, scope_id) VALUES ($1, $2)`, [ctl, scope]);
    expect(await prob()).toBe('4/4/4');
    await query(`INSERT INTO scope_systems (scope_id, system_id) VALUES ($1, $2)`, [scope, SYSTEM]);   // scope gains the system
    expect(await prob()).toBe('2/2/2');
    await query(`DELETE FROM soa_entry_scopes WHERE control_id = $1`, [ctl]);
  });

  it('for a group: counts only where the group is present, and follows the group', async () => {
    await query(`UPDATE controls SET delivery = 'group' WHERE id = $1`, [ctl]);
    expect(await prob()).toBe('4/4/4');                                   // no group linked
    await query(`INSERT INTO control_component_links (control_id, component_id, created_by) VALUES ($1, $2, $3)`, [ctl, group, CISO]);
    expect(await prob()).toBe('4/4/4');                                   // group not on this system
    await query(`INSERT INTO system_components (system_id, component_id) VALUES ($1, $2)`, [SYSTEM, group]);
    expect(await prob()).toBe('2/2/2');
    await query(`DELETE FROM system_components WHERE system_id = $1 AND component_id = $2`, [SYSTEM, group]);
    expect(await prob()).toBe('4/4/4');
  });

  it('on each system: back to deployments — not deployed here, so not counted', async () => {
    await query(`UPDATE controls SET delivery = 'system' WHERE id = $1`, [ctl]);
    expect(await prob()).toBe('4/4/4');
  });
});

describe('every view agrees with the score', () => {
  beforeAll(async () => { await query(`UPDATE controls SET delivery = 'organisation' WHERE id = $1`, [ctl]); });

  it('the coverage panel shows it present, and how', async () => {
    const res = await get(`/api/v1/risks/gap?system_id=${SYSTEM}&threat_id=${THREAT}&risk_id=${RISK}`);
    const row = res.body.controls.find(c => c.id === ctl);
    expect(row).toMatchObject({ on_system: true, system_status: 'operational', delivered_via: 'organisation' });
  });

  it('it is never offered as a per-system remediation candidate — but on each system it is', async () => {
    // v154: a control is never an item. Per system, it shows up either as a
    // component of its own to fix here, or as `blocked` with the reason.
    const { rows: [{ title }] } = await query(`SELECT title FROM controls WHERE id = $1`, [ctl]);
    const reachesTheGap = async () => {
      const res = await get(`/api/v1/risks/${RISK}/action-items/candidates`);
      expect(res.body.controls).toEqual([]);
      return res.body.blocked.some(b => b.control_id === ctl)
        || res.body.components.some(c => (c.via_controls || []).includes(title));
    };
    await query(`UPDATE soa_entries SET implementation_status = 'partial' WHERE control_id = $1`, [ctl]);
    expect(await reachesTheGap()).toBe(false);               // organisation-wide: remediated once, on the control
    await query(`UPDATE controls SET delivery = 'system' WHERE id = $1`, [ctl]);
    expect(await reachesTheGap()).toBe(true);                // per system, not deployed here: a real gap
    await query(`UPDATE controls SET delivery = 'organisation' WHERE id = $1`, [ctl]);
    await query(`UPDATE soa_entries SET implementation_status = 'implemented' WHERE control_id = $1`, [ctl]);
  });

  it('the objective read-out counts the risks it treats by reach', async () => {
    const res = await get(`/api/v1/controls/${ctl}`);
    const { rows } = await query(`SELECT count(*)::int AS n FROM risks WHERE threat_id = $1 AND is_active`, [THREAT]);
    expect(res.body.readout.risks_treated).toBe(rows[0].n);
  });
});

const target = async () => {
  const res = await get('/api/v1/operations/risk-heatmap/current');
  const row = (res.body.risks ?? res.body).find(r => (r.risk_id ?? r.id) === RISK);
  return row.tgt_p_c;
};

// Work planned SYSTEM BY SYSTEM for a control that is then delivered once can no
// longer lower the risk: completing it would write a per-system record the
// calculation does not read. Withdrawn by trigger, like exclusion (v119) and
// threat unlink (v121), and never allowed to prop up the Target Risk column.
describe('changing the delivery mode withdraws per-system work', () => {
  let actionId, itemId, seededTarget;

  beforeAll(async () => {
    await query(`UPDATE controls SET delivery = 'system' WHERE id = $1`, [ctl]);
    seededTarget = await target();          // the seed's own open items on this risk
    const a = await query(
      `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type,
                                     primary_owner_user_id, status, accepted_at, accepted_by)
       VALUES ('risk', 'risk_treatment', 'REACH action','t','mitigate',$1,'in_progress',now(),$1) RETURNING id`, [CISO]);
    actionId = a.rows[0].id;
    await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1,$2)`, [actionId, RISK]);
    const it = await query(
      `INSERT INTO security_action_items
         (action_id, system_id, element_type, control_id, change_kind, owner_user_id,
          target_p_c, target_p_i, target_p_a, status)
       VALUES ($1,$2,'control',$3,'control_add',$4,1,1,1,'pending') RETURNING id`,
      [actionId, SYSTEM, ctl, CISO]);
    itemId = it.rows[0].id;
  });

  afterAll(async () => {
    await query(`DELETE FROM security_action_notes WHERE action_id = $1`, [actionId]);
    await query(`DELETE FROM security_action_items WHERE action_id = $1`, [actionId]);
    await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
    await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  });

  // v154: a control item no longer sets the target (it is derived from the
  // components being fixed), so the open item promises nothing.
  it('while it is planned per system, the open control item sets no target', async () => {
    expect(seededTarget).not.toBe(1);
    expect(await target()).not.toBe(1);
  });

  it('delivered organisation-wide: the item is withdrawn, attributed, with a note giving the reason', async () => {
    const res = await request(app).patch(`/api/v1/controls/${ctl}`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`).send({ delivery: 'organisation' });
    expect(res.status).toBe(200);
    const { rows } = await query(`SELECT status, withdrawn_by FROM security_action_items WHERE id = $1`, [itemId]);
    expect(rows[0]).toEqual({ status: 'withdrawn', withdrawn_by: CISO });
    const notes = await query(`SELECT note FROM security_action_notes WHERE item_id = $1`, [itemId]);
    expect(notes.rows.map(n => n.note).join(' ')).toMatch(/now delivered organisation-wide/);
  });

  it('the target no longer rests on it', async () => {
    expect(await target()).toBe(seededTarget);
  });

  it('an item that escaped the trigger still cannot prop up the target', async () => {
    await query(`UPDATE security_action_items SET status = 'pending', withdrawn_at = NULL, withdrawn_by = NULL WHERE id = $1`, [itemId]);
    expect(await target()).toBe(seededTarget);
  });
});
