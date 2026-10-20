'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A DEGRADED control must not contribute as though it were working (0115).
//
// The current-risk probability is MIN over the deployed controls, where
// "deployed" is status IN ('operational','degraded') — and until 0115 the two
// contributed identically. Because the combiner is MIN, the single best control
// sets the floor, so a DEGRADED control could hold the risk down at a value that
// was judged on the assumption the control works. Wrong under either combiner,
// and not rare: 163 of 651 deployed rows on CIRKS-test are degraded.
//
// 0115 worsens a degraded control by one rung, capped at the threat inherent.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT = '33333333-0000-0000-0000-000000000001'; // seed: inherent 4/4/4
const GOOD   = '55555555-0000-0000-0000-000000000001'; // MFA Enforcement
const WEAK   = '55555555-0000-0000-0000-000000000002'; // Patch Management

let systemId, riskId;

const probOf = async () => (await query(
  `SELECT probability_c, probability_i, probability_a FROM risks WHERE id = $1`,
  [riskId])).rows[0];

const setStatus = (controlId, status) => query(
  `UPDATE system_controls SET status = $3::system_element_status
    WHERE system_id = $1 AND control_id = $2`, [systemId, controlId, status]);

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id, impact_c, impact_i, impact_a)
     VALUES ('DEGRADED-PENALTY system', $1, 3, 3, 3) RETURNING id`, [IT_DEPT]);
  systemId = s.rows[0].id;

  const r = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1, $2, 4, 4, 4, 1, 'DEGRADED-PENALTY risk', 'validated') RETURNING id`,
    [systemId, THREAT]);
  riskId = r.rows[0].id;

  for (const c of [GOOD, WEAK]) {
    await query(`INSERT INTO control_threats (control_id, threat_id, created_by)
                 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [c, THREAT, USERS.analyst.id]);
    await query(`INSERT INTO system_controls (system_id, control_id, status, provenance, created_by)
                 VALUES ($1, $2, 'operational', 'recorded', $3)`, [systemId, c, USERS.analyst.id]);
  }
});

afterAll(async () => {
  await query(`DELETE FROM risk_control_probability WHERE risk_id = $1`, [riskId]);
  await query(`DELETE FROM system_controls WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM system_components WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM risks WHERE id = $1`, [riskId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
  await query(`DELETE FROM control_threats WHERE threat_id = $1 AND control_id = ANY($2)`,
    [THREAT, [GOOD, WEAK]]);
});

test('the threat inherent is 4 — the ceiling every contribution is capped at', async () => {
  const { rows } = await query(
    `SELECT probability_c, probability_i, probability_a FROM threats WHERE id = $1`, [THREAT]);
  expect(rows[0]).toMatchObject({ probability_c: 4, probability_i: 4, probability_a: 4 });
});

test('the best OPERATIONAL control sets the floor (MIN is unchanged)', async () => {
  // CISO, not the analyst: the route locks a risk_analyst out of a validated risk.
  const ciso = tokenFor('ciso');
  for (const [controlId, p] of [[GOOD, 1], [WEAK, 3]]) {
    const res = await request(app).put(`/api/v1/risks/${riskId}/controls/${controlId}/probability`)
      .set('Authorization', `Bearer ${ciso}`)
      .send({ probability_c: p, probability_i: p, probability_a: p });
    expect([200, 204]).toContain(res.status);
  }
  expect(await probOf()).toMatchObject({ probability_c: 1, probability_i: 1, probability_a: 1 });
});

// The regression. Before 0115 this stayed at 1: the degraded control kept the
// floor at the value it was judged at while working.
test('degrading the floor-setting control raises the risk by one rung', async () => {
  await setStatus(GOOD, 'degraded');
  expect(await probOf()).toMatchObject({ probability_c: 2, probability_i: 2, probability_a: 2 });
});

test('repairing it lowers the risk again', async () => {
  await setStatus(GOOD, 'operational');
  expect(await probOf()).toMatchObject({ probability_c: 1, probability_i: 1, probability_a: 1 });
});

test('the penalty is capped at the threat inherent, never above it', async () => {
  // WEAK judged at the inherent (4) and degraded would be 5 uncapped — but a
  // control can never make an attack more likely than doing nothing.
  await query(`UPDATE risk_control_probability
                  SET probability_c = 4, probability_i = 4, probability_a = 4
                WHERE risk_id = $1 AND control_id = $2`, [riskId, WEAK]);
  await setStatus(GOOD, 'missing');      // leave only WEAK deployed
  await setStatus(WEAK, 'degraded');
  expect(await probOf()).toMatchObject({ probability_c: 4, probability_i: 4, probability_a: 4 });
});

test('a not-deployed control contributes nothing, so the risk falls back to the inherent', async () => {
  await setStatus(WEAK, 'missing');
  expect(await probOf()).toMatchObject({ probability_c: 4, probability_i: 4, probability_a: 4 });
});
