'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// WHY a control is on a system (v131).
//
// `system_controls.provenance` says 'recorded' on all 823 rows and nothing ever
// writes anything else, so the stored answer is no answer. The real one is
// derivable: a control reaches a risk through system_controls ∩ control_threats,
// so the threats it counters that are ALSO identified on that system are exactly
// why it belongs there. None of those = a baseline deployment.

const { app, request, tokenFor, query } = require('./helpers');

const HR     = '44444444-0000-0000-0000-000000000002';
const AD     = '44444444-0000-0000-0000-000000000001';
const THREAT = '33333333-0000-0000-0000-000000000001';
const RISK   = '66666666-0000-0000-0000-000000000003';   // HR System × that threat
const CISO   = '11111111-0000-0000-0000-000000000002';

const get = () => request(app).get(`/api/v1/controls/${ctl}`).set('Authorization', `Bearer ${tokenFor('ciso')}`);
const on = (body, name) => body.deployments.find(d => d.system_name === name);

let ctl, baselineCtl;

beforeAll(async () => {
  const c = await query(
    `INSERT INTO controls (title, control_type, created_by, delivery)
     VALUES ('WHY patch management', 'preventive', $1, 'system') RETURNING id`, [CISO]);
  ctl = c.rows[0].id;
  await query(`INSERT INTO soa_entries (control_id, applicable) VALUES ($1, TRUE)`, [ctl]);
  await query(`INSERT INTO control_threats (control_id, threat_id, created_by) VALUES ($1, $2, $3)`, [ctl, THREAT, CISO]);
  // On HR the threat is identified and a risk exists; on AD it is not.
  await query(`INSERT INTO system_threats (system_id, threat_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [HR, THREAT]);
  for (const sys of [HR, AD]) {
    await query(`INSERT INTO system_controls (system_id, control_id, status, created_by)
                 VALUES ($1, $2, 'operational', $3)`, [sys, ctl, CISO]);
  }
  await query(`INSERT INTO risk_control_probability (risk_id, control_id, probability_c, probability_i, probability_a, set_by)
               VALUES ($1, $2, 2, 2, 2, $3)`, [RISK, ctl, CISO]);

  // A control countering nothing, deployed anyway: the baseline case.
  const b = await query(
    `INSERT INTO controls (title, control_type, created_by, delivery)
     VALUES ('WHY baseline hardening', 'preventive', $1, 'system') RETURNING id`, [CISO]);
  baselineCtl = b.rows[0].id;
  await query(`INSERT INTO soa_entries (control_id, applicable) VALUES ($1, TRUE)`, [baselineCtl]);
  await query(`INSERT INTO system_controls (system_id, control_id, status, created_by)
               VALUES ($1, $2, 'operational', $3)`, [AD, baselineCtl, CISO]);
});

afterAll(async () => {
  await query(`DELETE FROM system_threats WHERE system_id = $1 AND threat_id = $2`, [HR, THREAT]);
  await query(`DELETE FROM audit_log WHERE entity_id = $1`, [ctl]);
  await query(`DELETE FROM controls WHERE id = ANY($1::uuid[])`, [[ctl, baselineCtl]]);
});

describe('GET /controls/:id — where it is, and why', () => {
  it('names the threat that justifies it, and the risk that follows', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const hr = on(res.body, 'HR System');
    expect(hr).toMatchObject({ reason: 'risk', status: 'operational', via: 'deployed' });
    expect(hr.threats.map(t => t.name)).toEqual(['Unpatched Software Exploit']);
    expect(hr.risks[0]).toMatchObject({ risk_id: RISK, threat: 'Unpatched Software Exploit', judged: '2/2/2' });
  });

  // A risk is the stronger evidence: the seed's Active Directory risk has no
  // `system_threats` row, and treating that as "no reason to be here" would
  // have been wrong.
  it('counts an active risk as justification even with no identification row', async () => {
    const ad = on(await get().then(r => r.body), 'Active Directory');
    expect(ad.reason).toBe('risk');
    expect(ad.threats.map(t => t.name)).toEqual(['Unpatched Software Exploit']);
  });

  it('calls it a baseline where it counters nothing identified there', async () => {
    const res = await request(app).get(`/api/v1/controls/${baselineCtl}`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`);
    const ad = res.body.deployments.find(d => d.system_name === 'Active Directory');
    expect(ad).toMatchObject({ reason: 'baseline', status: 'operational' });
    expect(ad.threats).toEqual([]);
    expect(ad.risks).toEqual([]);
  });

  it('says so when the judgement is missing — present, but nothing says what it achieves', async () => {
    await query(`DELETE FROM risk_control_probability WHERE control_id = $1`, [ctl]);
    const hr = on(await get().then(r => r.body), 'HR System');
    expect(hr.risks[0].judged).toBeNull();
    await query(`INSERT INTO risk_control_probability (risk_id, control_id, probability_c, probability_i, probability_a, set_by)
                 VALUES ($1, $2, 2, 2, 2, $3)`, [RISK, ctl, CISO]);
  });

  it('shows the systems an organisation-wide control REACHES, not where it is typed', async () => {
    await query(`UPDATE controls SET delivery = 'organisation' WHERE id = $1`, [ctl]);
    await query(`UPDATE soa_entries SET implementation_status = 'implemented' WHERE control_id = $1`, [ctl]);
    const body = await get().then(r => r.body);
    expect(body.deployments.every(d => d.via === 'organisation')).toBe(true);
    expect(on(body, 'HR System').reason).toBe('risk');
    await query(`UPDATE controls SET delivery = 'system' WHERE id = $1`, [ctl]);
  });

  it('carries the exclusion reason where it has been excluded', async () => {
    await query(`UPDATE system_controls SET status = 'not_applicable', exclusion_reason = 'Handled by the platform'
                  WHERE system_id = $1 AND control_id = $2`, [AD, ctl]);
    const ad = on(await get().then(r => r.body), 'Active Directory');
    expect(ad).toMatchObject({ status: 'not_applicable', exclusion_reason: 'Handled by the platform' });
    await query(`UPDATE system_controls SET status = 'operational', exclusion_reason = NULL
                  WHERE system_id = $1 AND control_id = $2`, [AD, ctl]);
  });
});
