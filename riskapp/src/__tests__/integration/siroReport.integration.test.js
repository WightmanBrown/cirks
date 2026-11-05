'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The SIRO's report (docs/reporting-siro.md, reports 1 and 2). Pinned here: it
// counts exactly what the register holds against the thresholds in org_config;
// every risk at or above the action threshold with no open action and no
// acceptance is in exactly one of the three "needs an answer" lists, by its
// treatment decision; target exposure never exceeds current; and a risk decided
// as "mitigate" with nothing carrying it out appears as decided-not-delivered
// and leaves it once an acceptance is recorded.

const { app, request, tokenFor, query } = require('./helpers');

const api = (role) => request(app).get('/api/v1/reports/siro').set({ Authorization: `Bearer ${tokenFor(role)}` });
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

let report, cfg;

beforeAll(async () => {
  const res = await api('siro');
  expect(res.status).toBe(200);
  report = res.body;
  cfg = (await query('SELECT mandatory_action_score, exception_accept_owner_max FROM org_config')).rows[0];
});

describe('exposure against the thresholds', () => {
  test('the thresholds are the organisation\'s', () => {
    expect(report.thresholds.action).toBe(cfg.mandatory_action_score);
    expect(report.thresholds.owner_max).toBe(cfg.exception_accept_owner_max);
  });

  test('counts what the register holds', async () => {
    const { rows: [n] } = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE risk_score >= $1)::int AS at_or_above,
              COUNT(*) FILTER (WHERE risk_score > $2)::int  AS above_owner
         FROM risks WHERE is_active`, [cfg.mandatory_action_score, cfg.exception_accept_owner_max]);
    expect(report.exposure.total).toBe(n.total);
    expect(report.exposure.current).toEqual({ at_or_above_action: n.at_or_above, above_owner_max: n.above_owner });
    const byDept = report.exposure.by_department.reduce((a, d) => a + d.at_or_above_action, 0);
    expect(byDept).toBe(n.at_or_above);
  });

  test('committed work can only lower exposure', () => {
    expect(report.exposure.target.at_or_above_action).toBeLessThanOrEqual(report.exposure.current.at_or_above_action);
    expect(report.exposure.target.above_owner_max).toBeLessThanOrEqual(report.exposure.current.above_owner_max);
  });

  test('a department\'s owner is named in words', () => {
    for (const d of report.exposure.by_department) {
      expect(d.owner_names === null || typeof d.owner_names === 'string').toBe(true);
    }
  });

  test('top risks are the highest, highest first', () => {
    const scores = report.exposure.top_risks.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores.length).toBeLessThanOrEqual(10);
  });

  test('a concentrated system carries more than one risk at or above the threshold', () => {
    for (const s of report.exposure.concentration) expect(s.count).toBeGreaterThan(1);
  });
});

describe('decisions for the SIRO', () => {
  test('every risk needing an answer is in exactly one list', async () => {
    const { rows: [n] } = await query(
      `SELECT COUNT(*)::int AS n FROM risks r
        WHERE r.is_active AND r.risk_score >= $1
          AND NOT EXISTS (SELECT 1 FROM security_action_risks sar JOIN security_actions a ON a.id = sar.action_id
                           WHERE sar.risk_id = r.id AND a.status NOT IN ('completed','cancelled','verified','rejected'))
          AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.risk_id = r.id AND e.status = 'active')`,
      [cfg.mandatory_action_score]);
    const d = report.decisions;
    const ids = [...d.decided_not_delivered, ...d.accept_not_recorded, ...d.no_decision].map((r) => r.risk_id);
    expect(ids.length).toBe(n.n);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('above owner authority lists every risk only the CISO, SIRO or admin may accept', () => {
    for (const r of report.decisions.above_owner_max) expect(r.score).toBeGreaterThan(cfg.exception_accept_owner_max);
    expect(report.decisions.above_owner_max.length).toBe(report.exposure.current.above_owner_max);
  });

  test('each acceptance says whether it is within its accepter\'s authority at today\'s score', () => {
    for (const e of report.decisions.acceptances) expect(typeof e.within_authority_now).toBe('boolean');
  });
});

describe('a risk decided as mitigate with nothing carrying it out', () => {
  let riskId, oldDecision, oldProb, exceptionId;

  beforeAll(async () => {
    // A risk at or above the threshold with no open action and no acceptance.
    const { rows } = await query(
      `SELECT r.id, r.treatment_decision, r.probability_c, r.probability_i, r.probability_a FROM risks r
        WHERE r.is_active
          AND NOT EXISTS (SELECT 1 FROM security_action_risks sar JOIN security_actions a ON a.id = sar.action_id
                           WHERE sar.risk_id = r.id AND a.status NOT IN ('completed','cancelled','verified','rejected'))
          AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.risk_id = r.id AND e.status = 'active')
        ORDER BY r.risk_score DESC, r.id LIMIT 1`);
    riskId = rows[0].id;
    oldDecision = rows[0].treatment_decision;
    oldProb = [rows[0].probability_c, rows[0].probability_i, rows[0].probability_a];
    // Raise it to the top of the scale, so it is at or above any threshold.
    await query(`UPDATE risks SET probability_c = 5, probability_i = 5, probability_a = 5,
                        treatment_decision = 'mitigate' WHERE id = $1`, [riskId]);
  });

  afterAll(async () => {
    await query('DELETE FROM exceptions WHERE risk_id = $1 AND justification = $2', [riskId, 'Report test']);
    await query(`UPDATE risks SET probability_c = $2, probability_i = $3, probability_a = $4,
                        treatment_decision = $5 WHERE id = $1`, [riskId, ...oldProb, oldDecision]);
  });

  test('is decided-not-delivered', async () => {
    const r = (await api('ciso')).body;
    expect(r.decisions.decided_not_delivered.map((x) => x.risk_id)).toContain(riskId);
  });

  test('and leaves the list once an acceptance is recorded', async () => {
    const acc = await request(app).post(`/api/v1/risks/${riskId}/exceptions`)
      .set({ Authorization: `Bearer ${tokenFor('siro')}` })
      .send({ justification: 'Report test', expires_at: future(30), review_cadence: 'quarterly' });
    expect(acc.status).toBe(201);
    exceptionId = acc.body.id || acc.body.exception?.id;
    const r = (await api('admin')).body;
    expect(r.decisions.decided_not_delivered.map((x) => x.risk_id)).not.toContain(riskId);
    const row = r.decisions.acceptances.find((e) => e.risk_id === riskId);
    expect(row).toMatchObject({ accepted_role: 'siro', within_authority_now: true, expiring_soon: true });
  });
});
