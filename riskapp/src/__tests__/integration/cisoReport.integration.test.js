'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The CISO's reports (docs/reporting-ciso.md) and the estimated cost on a
// security solution (v170). Pinned here: every risk at or above the threshold
// is agreed, decided-not-agreed or not decided, exactly once; a minuted SWG
// decision makes a risk agreed and CISO validation alone does not; the
// investment list never claims a gain nobody judged; and a cost is optional,
// says what it is for, and is audited.

const { app, request, tokenFor, query } = require('./helpers');
const { costFor } = require('../../reports/ciso');

const get = (role) => request(app).get('/api/v1/reports/ciso').set({ Authorization: `Bearer ${tokenFor(role)}` });
const patch = (id, body) => request(app).patch(`/api/v1/controls/solutions/${id}`)
  .set({ Authorization: `Bearer ${tokenFor('ciso')}` }).send(body);

test('admin, CISO, SIRO and the risk analyst can read it; an IAO cannot', async () => {
  for (const role of ['admin', 'ciso', 'siro', 'analyst']) expect((await get(role)).status).toBe(200);
  expect((await get('owner')).status).toBe(403);
});

test('each risk at or above the threshold is in exactly one agreement state', async () => {
  const { body: r } = await get('ciso');
  const { rows: [n] } = await query(
    'SELECT COUNT(*)::int AS n FROM risks WHERE is_active AND risk_score >= (SELECT mandatory_action_score FROM org_config LIMIT 1)');
  const a = r.agreement;
  expect(a.total).toBe(n.n);
  expect(a.agreed + a.decided_not_agreed + a.not_decided).toBe(a.total);
  expect(new Set(a.risks.map((x) => x.risk_id)).size).toBe(a.total);
  for (const x of a.risks) {
    expect(x.score).toBeGreaterThanOrEqual(r.thresholds.action);
    if (x.state === 'agreed') expect(x.minuted || x.owner_act).toBeTruthy();
    else expect(x.minuted).toBeNull();
  }
});

describe('a minuted decision', () => {
  let meetingId, riskId;
  beforeAll(async () => {
    const { body: r } = await get('ciso');
    const candidate = r.agreement.risks.find((x) => x.state !== 'agreed');
    if (!candidate) return;
    riskId = candidate.risk_id;
    const { rows: [m] } = await query(
      `INSERT INTO working_group_meetings (meeting_date) VALUES (CURRENT_DATE - 1) RETURNING id`);
    meetingId = m.id;
    await query(
      `INSERT INTO meeting_agenda_items (meeting_id, source, category, entity_type, entity_id, title, order_index, decision_text, decision_recorded_at)
       VALUES ($1, 'pinned', 'risk', 'risk', $2, 'Test risk', 1, 'Treat it: the department agrees', now())`, [meetingId, riskId]);
  });
  afterAll(async () => {
    if (meetingId) {
      await query('DELETE FROM meeting_agenda_items WHERE meeting_id = $1', [meetingId]);
      await query('DELETE FROM working_group_meetings WHERE id = $1', [meetingId]);
    }
  });

  test('makes the risk agreed, with the words and the date', async () => {
    if (!riskId) return;
    const { body: r } = await get('ciso');
    const x = r.agreement.risks.find((y) => y.risk_id === riskId);
    expect(x.state).toBe('agreed');
    expect(x.minuted.decision_text).toBe('Treat it: the department agrees');
    expect(x.minuted.about).toBe('risk');
  });
});

test('the investment list claims no gain nobody judged, and none that raises a score', async () => {
  const { body: r } = await get('ciso');
  for (const f of r.investment.fixes) {
    expect(f.points_removed).toBeGreaterThanOrEqual(0);
    expect(f.risks_judged).toBeLessThanOrEqual(f.risks);
    if (f.risks_judged === 0) expect(f.points_removed).toBe(0);
    expect(f.risks_brought_below_action).toBeLessThanOrEqual(f.risks_judged);
    expect(f.systems).toBeGreaterThan(0);
    if (!f.cost) expect(f.cost_unknown_because).toEqual(expect.any(String));
  }
});

test('a cost is for the organisation once, or for each system', () => {
  expect(costFor(null, 3)).toBeNull();
  expect(costFor({ cost_basis: null, cost_one_off: null }, 3)).toBeNull();
  expect(costFor({ cost_basis: 'organisation', cost_one_off: 5000, cost_annual: 1000 }, 3))
    .toEqual({ one_off: 5000, annual: 1000, basis: 'organisation' });
  expect(costFor({ cost_basis: 'per_system', cost_one_off: 200, cost_annual: null }, 3))
    .toEqual({ one_off: 600, annual: null, basis: 'per_system' });
});

describe('estimated cost on a security solution (v170)', () => {
  let id;
  beforeAll(async () => {
    const res = await request(app).post('/api/v1/controls/solutions')
      .set({ Authorization: `Bearer ${tokenFor('ciso')}` }).send({ name: 'Cost test solution' });
    expect(res.status).toBe(201);
    id = res.body.solution.id;
  });
  afterAll(async () => {
    await query(`DELETE FROM audit_log WHERE entity_type = 'delivery_pattern' AND entity_id = $1`, [id]);
    await query('DELETE FROM delivery_patterns WHERE id = $1', [id]);
  });

  test('is refused without saying what it is for, or when not a whole number', async () => {
    expect((await patch(id, { cost_one_off: 5000 })).status).toBe(400);
    expect((await patch(id, { cost_one_off: -1, cost_basis: 'organisation' })).status).toBe(400);
    expect((await patch(id, { cost_one_off: 12.5, cost_basis: 'organisation' })).status).toBe(400);
    expect((await patch(id, { cost_basis: 'per_system' })).status).toBe(400);
  });

  test('is saved with who set it, audited, and cleared back to not known', async () => {
    const res = await patch(id, { cost_one_off: 250, cost_annual: 40, cost_basis: 'per_system', cost_note: 'Vendor quote' });
    expect(res.status).toBe(200);
    expect(res.body.solution).toMatchObject({ cost_one_off: 250, cost_annual: 40, cost_basis: 'per_system', cost_note: 'Vendor quote' });
    expect(res.body.solution.cost_set_by_name).toEqual(expect.any(String));
    const { rows: [a] } = await query(
      `SELECT human_narrative FROM audit_log WHERE entity_type = 'delivery_pattern' AND entity_id = $1
        ORDER BY created_at DESC LIMIT 1`, [id]);
    expect(a.human_narrative).toMatch(/not known → 250 one-off, 40 a year, per system/);

    const cleared = await patch(id, { cost_one_off: null, cost_annual: null, cost_basis: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.solution).toMatchObject({ cost_one_off: null, cost_annual: null, cost_basis: null, cost_set_by_name: null });
  });

  test('the database refuses a figure without a basis', async () => {
    await expect(query(`UPDATE delivery_patterns SET cost_one_off = 1 WHERE id = $1`, [id])).rejects.toThrow(/chk_delivery_pattern_cost_basis/);
  });
});
