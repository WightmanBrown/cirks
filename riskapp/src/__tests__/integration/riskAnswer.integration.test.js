'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The risk answer, GET /risks/:id/answer (docs/insights-drilldown.md). Pinned
// here: it reads exactly as the rest of CIRKS does — the register's score, the
// threat's objectives, the CISO report's agreement state — and it is scoped
// exactly as GET /risks/:id.

const { app, request, tokenFor, query } = require('./helpers');

const get = (role, path) => request(app).get(`/api/v1${path}`).set({ Authorization: `Bearer ${tokenFor(role)}` });

let risks;
beforeAll(async () => {
  ({ rows: risks } = await query(
    `SELECT r.id, r.risk_score, r.threat_id, r.probability_c, r.probability_i, r.probability_a
       FROM risks r WHERE r.is_active ORDER BY r.risk_score DESC, r.id`));
});

test('the score, the objectives and the setting dimension match the register', async () => {
  expect(risks.length).toBeGreaterThan(0);
  for (const r of risks) {
    const { status, body: a } = await get('ciso', `/risks/${r.id}/answer`);
    expect(status).toBe(200);
    expect(a.score.now).toBe(r.risk_score);
    const { rows: [n] } = await query('SELECT COUNT(*)::int AS n FROM control_threats WHERE threat_id = $1', [r.threat_id]);
    expect(a.why.counts.total).toBe(n.n);
    const c = a.why.counts;
    expect(c.operational + c.degraded + c.missing + c.unknown + c.not_applicable + c.not_recorded).toBe(c.total);
    const d = a.why.setting.dimension;
    expect(a.why.setting.probability).toBe({ c: r.probability_c, i: r.probability_i, a: r.probability_a }[d]);
    // Something named as setting the likelihood must actually have lowered it.
    if (a.why.setting.by.length) expect(a.why.setting.probability).toBeLessThan(a.why.setting.threat_probability);
    if (a.why.best_fix) expect(a.why.best_fix.score_if_fixed).toBeLessThan(r.risk_score);
    if (a.score.target != null) expect(a.score.target).toBeLessThanOrEqual(r.risk_score);
  }
});

test('the agreement state is the CISO report\'s', async () => {
  const { body: ciso } = await get('ciso', '/reports/ciso');
  for (const x of ciso.agreement.risks) {
    const { body: a } = await get('ciso', `/risks/${x.risk_id}/answer`);
    expect(a.decision.agreement).toBe(x.state);
  }
});

test('scoped exactly as the risk itself', async () => {
  for (const role of ['iam', 'owner', 'analyst', 'soc']) {
    for (const r of risks) {
      const risk = await get(role, `/risks/${r.id}`);
      const answer = await get(role, `/risks/${r.id}/answer`);
      expect([role, r.id, answer.status]).toEqual([role, r.id, risk.status]);
    }
  }
});

test('an unknown or retired risk is not found', async () => {
  expect((await get('ciso', '/risks/00000000-0000-0000-0000-000000000000/answer')).status).toBe(404);
});
