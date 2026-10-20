'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A per-system control's implementation status is DERIVED (v129).
//
// Only a control delivered ON EACH SYSTEM derives; the denominator is the systems
// carrying an identified threat it treats, and partial carries its reason.
// Organisation-wide, group and not-stated controls keep the stated value.
//
// Fixture: two active systems (Active Directory, HR System). The threat is
// identified on both for this test only.

const { app, request, tokenFor, query } = require('./helpers');

const AD      = '44444444-0000-0000-0000-000000000001';
const HR      = '44444444-0000-0000-0000-000000000002';
const THREAT  = '33333333-0000-0000-0000-000000000001';
const RISK    = '66666666-0000-0000-0000-000000000003';
const CISO    = '11111111-0000-0000-0000-000000000002';

const auth = (r) => r.set('Authorization', `Bearer ${tokenFor('ciso')}`);
const impl = async () => (await query(`SELECT * FROM v_control_implementation WHERE control_id = $1`, [ctl])).rows[0];
const deploy = (system, status) => query(
  `INSERT INTO system_controls (system_id, control_id, status, created_by) VALUES ($1, $2, $3, $4)
   ON CONFLICT (system_id, control_id) DO UPDATE SET status = EXCLUDED.status`, [system, ctl, status, CISO]);

let ctl, actionId;

beforeAll(async () => {
  const c = await query(`INSERT INTO controls (title, control_type, created_by) VALUES ('IMPL endpoint protection', 'preventive', $1) RETURNING id`, [CISO]);
  ctl = c.rows[0].id;
  await query(`INSERT INTO soa_entries (control_id, applicable, implementation_status) VALUES ($1, TRUE, 'implemented')`, [ctl]);
  await query(`INSERT INTO control_threats (control_id, threat_id, created_by) VALUES ($1, $2, $3)`, [ctl, THREAT, CISO]);
  await query(`INSERT INTO system_threats (system_id, threat_id) VALUES ($1, $3), ($2, $3) ON CONFLICT DO NOTHING`, [AD, HR, THREAT]);
});

afterAll(async () => {
  if (actionId) {
    await query(`DELETE FROM security_action_items WHERE action_id = $1`, [actionId]);
    await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
    await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  }
  await query(`DELETE FROM system_threats WHERE threat_id = $1 AND system_id IN ($2, $3)`, [THREAT, AD, HR]);
  await query(`DELETE FROM controls WHERE id = $1`, [ctl]);
});

describe('which controls derive', () => {
  it('mode not stated: the stated value stands, flagged', async () => {
    expect(await impl()).toMatchObject({
      status_source: 'stated', implementation_status: 'implemented', delivery_not_stated: true });
  });

  it('organisation-wide: the stated value stands — it is the observation', async () => {
    await query(`UPDATE controls SET delivery = 'organisation' WHERE id = $1`, [ctl]);
    expect(await impl()).toMatchObject({ status_source: 'stated', implementation_status: 'implemented' });
  });
});

describe('on each system: derived over the systems at risk', () => {
  beforeAll(async () => { await query(`UPDATE controls SET delivery = 'system' WHERE id = $1`, [ctl]); });

  it('deployed nowhere, nothing planned: not implemented, whatever was typed', async () => {
    expect(await impl()).toMatchObject({
      status_source: 'derived', implementation_status: 'not_implemented', threat_systems: 2, present_systems: 0 });
  });

  it('deployed nowhere, but an open action item targets it: planned', async () => {
    const a = await query(
      `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type, primary_owner_user_id, status)
       VALUES ('risk', 'risk_treatment', 'IMPL action', 't', 'mitigate', $1, 'proposed') RETURNING id`, [CISO]);
    actionId = a.rows[0].id;
    await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1, $2)`, [actionId, RISK]);
    await query(
      `INSERT INTO security_action_items (action_id, system_id, element_type, control_id, change_kind, owner_user_id, status)
       VALUES ($1, $2, 'control', $3, 'control_add', $4, 'pending')`, [actionId, HR, ctl, CISO]);
    expect((await impl()).implementation_status).toBe('planned');
  });

  it('on one of the two systems at risk: partial · coverage', async () => {
    await deploy(HR, 'operational');
    expect(await impl()).toMatchObject({
      implementation_status: 'partial', partial_reasons: ['coverage'], threat_systems_present: 1 });
  });

  it('a row that is not operational or degraded is not "in place"', async () => {
    await deploy(AD, 'unknown');
    expect(await impl()).toMatchObject({ partial_reasons: ['coverage'], threat_systems_unknown: 1 });
  });

  it('on both, operational: implemented', async () => {
    await deploy(AD, 'operational');
    expect(await impl()).toMatchObject({ implementation_status: 'implemented', partial_reasons: [] });
  });

  it('degraded on one: partial · health', async () => {
    await deploy(AD, 'degraded');
    expect(await impl()).toMatchObject({
      implementation_status: 'partial', partial_reasons: ['health'], degraded_systems: 1 });
  });

  it('excluded on a system with a reason: that system leaves the denominator', async () => {
    await query(`UPDATE system_controls SET status = 'not_applicable', exclusion_reason = 'Handled by the directory'
                  WHERE system_id = $1 AND control_id = $2`, [AD, ctl]);
    expect(await impl()).toMatchObject({ implementation_status: 'implemented', threat_systems: 1 });
  });
});

describe('the API reports the derived value, and refuses to have it typed', () => {
  it('GET /soa carries the derived status and where it came from', async () => {
    const res = await auth(request(app).get('/api/v1/soa'));
    const row = res.body.groups.flatMap(g => g.controls ?? g.rows ?? []).find(c => c.control_id === ctl);
    expect(row).toMatchObject({ implementation_status: 'implemented', implementation_source: 'derived' });
  });

  it('GET /controls/:id keeps the stated value beside the derived one', async () => {
    await query(`UPDATE soa_entries SET implementation_status = 'not_implemented' WHERE control_id = $1`, [ctl]);
    const res = await auth(request(app).get(`/api/v1/controls/${ctl}`));
    expect(res.body.soa).toMatchObject({
      implementation_status: 'implemented', stated_status: 'not_implemented', implementation_source: 'derived' });
  });

  it('PATCH /soa/:id refuses a typed status but still takes the description', async () => {
    const refused = await auth(request(app).patch(`/api/v1/soa/${ctl}`)).send({ implementation_status: 'partial' });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/derived from those systems/);
    const ok = await auth(request(app).patch(`/api/v1/soa/${ctl}`)).send({ implementation_description: 'EDR on every host' });
    expect(ok.status).toBe(200);
  });
});
