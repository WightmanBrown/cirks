'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The impact an action reports for its linked risk must be the SYSTEM's derived
// C/I/A (1–5), not `risks.risk_*`, which is already probability × impact (1–25).
//
// Regression: all three action endpoints read `COALESCE(r.residual_impact_*,
// r.risk_*)`. v90 made impact strictly asset-derived and cleared every
// `residual_impact_*`, so the COALESCE always fell through to the SCORE — and the
// UI, which multiplies `current_p_* × current_imp_*`, rendered up to 5 × 25 = 125
// on the actions list and the acceptance queue. A mocked-pool test cannot see
// this: the mock returns whatever the test says the SQL returned.

const { app, request, tokenFor, query, IT_DEPT, USERS } = require('./helpers');

const THREAT = '33333333-0000-0000-0000-000000000001'; // seed: Unpatched Software Exploit

// probability 3/5/5 against impact 4/5/5 → risk_c/i/a = 12/25/25, risk_score 25.
const PROB   = { c: 3, i: 5, a: 5 };
const IMPACT = { c: 4, i: 5, a: 5 };

let systemId, riskId, actionId;
let ciso;

const maxScore = (r) => Math.max(
  r.current_p_c * r.current_imp_c,
  r.current_p_i * r.current_imp_i,
  r.current_p_a * r.current_imp_a,
);

beforeAll(async () => {
  ciso = tokenFor('ciso');

  const s = await query(
    `INSERT INTO systems (name, department_id, impact_c, impact_i, impact_a)
     VALUES ('SCORE-IMP system', $1, $2, $3, $4) RETURNING id`,
    [IT_DEPT, IMPACT.c, IMPACT.i, IMPACT.a]
  );
  systemId = s.rows[0].id;

  const r = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1, $2, $3, $4, $5, 1, 'SCORE-IMP risk', 'validated') RETURNING id`,
    [systemId, THREAT, PROB.c, PROB.i, PROB.a]
  );
  riskId = r.rows[0].id;

  // 'proposed' so the same action is visible on the acceptance queue too.
  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type,
                                   primary_owner_user_id, status)
     VALUES ('risk', 'risk_treatment', 'SCORE-IMP action', 'impact provenance', 'mitigate', $1, 'proposed')
     RETURNING id`,
    [USERS.analyst.id]
  );
  actionId = a.rows[0].id;
  await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1, $2)`,
    [actionId, riskId]);
});

afterAll(async () => {
  await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  await query(`DELETE FROM risks WHERE id = $1`, [riskId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
});

// The trigger must have turned probability × system impact into the per-dimension
// scores; the test is meaningless if risk_* and impact_* happen to coincide.
test('the fixture really does separate impact (1–5) from score (1–25)', async () => {
  const { rows } = await query(
    `SELECT risk_c, risk_i, risk_a, risk_score FROM risks WHERE id = $1`, [riskId]);
  expect(rows[0]).toMatchObject({ risk_c: 12, risk_i: 25, risk_a: 25, risk_score: 25 });
});

test('GET /actions reports the system impact, not the risk score', async () => {
  const res = await request(app).get('/api/v1/actions').set('Authorization', `Bearer ${ciso}`);
  expect(res.status).toBe(200);
  const row = res.body.actions.find(a => a.id === actionId);
  expect(row).toBeDefined();
  expect(row.current_imp_c).toBe(IMPACT.c);
  expect(row.current_imp_i).toBe(IMPACT.i);
  expect(row.current_imp_a).toBe(IMPACT.a);
  expect(maxScore(row)).toBe(25);          // not 125
});

test('GET /actions/:id reports the system impact on each linked risk', async () => {
  const res = await request(app).get(`/api/v1/actions/${actionId}`)
    .set('Authorization', `Bearer ${ciso}`);
  expect(res.status).toBe(200);
  const risk = res.body.risks.find(r => r.risk_id === riskId);
  expect(risk).toBeDefined();
  expect(risk.current_imp_c).toBe(IMPACT.c);
  expect(risk.current_imp_i).toBe(IMPACT.i);
  expect(risk.current_imp_a).toBe(IMPACT.a);
  // The score the UI derives must agree with the one the DB stored.
  expect(maxScore(risk)).toBe(risk.risk_score);
});

test('GET /actions/acceptance-queue reports the system impact', async () => {
  const res = await request(app).get('/api/v1/actions/acceptance-queue')
    .set('Authorization', `Bearer ${ciso}`);
  expect(res.status).toBe(200);
  const row = res.body.actions.find(a => a.action_id === actionId);
  expect(row).toBeDefined();
  expect(row.current_imp_c).toBe(IMPACT.c);
  expect(row.current_imp_i).toBe(IMPACT.i);
  expect(row.current_imp_a).toBe(IMPACT.a);
  expect(maxScore(row)).toBe(25);          // not 125
});
