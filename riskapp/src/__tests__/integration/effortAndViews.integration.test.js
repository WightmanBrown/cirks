'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The estimated effort to operate a security solution, and a recorded view on
// a decision (v173, docs/reporting-iam.md decisions 3 and 5). Pinned here:
// effort is optional, says what it is for, and is audited; a view is written
// only by the department's IAO or IAM, only on a decision that exists on that
// risk, and can never be changed or removed — not even by the database owner.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });

describe('estimated effort on a security solution', () => {
  let id;
  const patch = (body) => request(app).patch(`/api/v1/controls/solutions/${id}`).set(auth('ciso')).send(body);
  beforeAll(async () => {
    const res = await request(app).post('/api/v1/controls/solutions').set(auth('ciso')).send({ name: 'Effort test solution' });
    expect(res.status).toBe(201);
    id = res.body.solution.id;
  });
  afterAll(async () => {
    await query(`DELETE FROM audit_log WHERE entity_type = 'delivery_pattern' AND entity_id = $1`, [id]);
    await query('DELETE FROM delivery_patterns WHERE id = $1', [id]);
  });

  test('is refused without a basis, below zero, or beyond one decimal place', async () => {
    expect((await patch({ effort_hours_month: 4 })).status).toBe(400);
    expect((await patch({ effort_hours_month: -1, effort_basis: 'per_system' })).status).toBe(400);
    expect((await patch({ effort_hours_month: 1.25, effort_basis: 'per_system' })).status).toBe(400);
    expect((await patch({ effort_basis: 'per_system' })).status).toBe(400);
  });

  test('is saved with who and when, audited, and cleared as a whole', async () => {
    const res = await patch({ effort_hours_month: 6.5, effort_basis: 'per_system', effort_note: 'Two checks a week' });
    expect(res.status).toBe(200);
    expect(res.body.solution).toMatchObject({ effort_hours_month: 6.5, effort_basis: 'per_system', effort_note: 'Two checks a week' });
    expect(res.body.solution.effort_set_by_name).toBeTruthy();
    const { rows: [a] } = await query(
      `SELECT human_narrative FROM audit_log WHERE entity_type = 'delivery_pattern' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`, [id]);
    expect(a.human_narrative).toMatch(/estimated effort not known → 6.5 hours a month, per system/);
    const cleared = await patch({ effort_hours_month: null, effort_basis: null });
    expect(cleared.body.solution).toMatchObject({ effort_hours_month: null, effort_basis: null, effort_set_by_name: null });
  });
});

describe('a recorded view on a decision', () => {
  let riskId, otherRisk, otherDept, otherSystem;
  const post = (role, risk, body) => request(app).post(`/api/v1/risks/${risk}/decision-views`).set(auth(role)).send(body);
  beforeAll(async () => {
    const { rows: [{ department_id: dept }] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS.iam.id]);
    ({ rows: [{ id: riskId }] } = await query(
      `SELECT r.id FROM risks r JOIN systems s ON s.id = r.system_id
        WHERE r.is_active AND s.department_id = $1 ORDER BY r.id LIMIT 1`, [dept]));
    await query('UPDATE risks SET validated_at = COALESCE(validated_at, now()) WHERE id = $1', [riskId]);
    ({ rows: [{ id: otherDept }] } = await query(`INSERT INTO departments (name) VALUES ('VIEWS other') RETURNING id`));
    ({ rows: [{ id: otherSystem }] } = await query(`INSERT INTO systems (name, department_id) VALUES ('VIEWS elsewhere', $1) RETURNING id`, [otherDept]));
    ({ rows: [{ id: otherRisk }] } = await query(
      `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a, risk_c, risk_i, risk_a, risk_score, rationale, validated_at)
       SELECT $1, threat_id, 2, 2, 2, 2, 2, 2, 2, 'VIEWS test', now() FROM risks WHERE id = $2 RETURNING id`, [otherSystem, riskId]));
  });
  afterAll(async () => {
    await query('DELETE FROM risks WHERE id = $1', [otherRisk]);
    await query('DELETE FROM systems WHERE id = $1', [otherSystem]);
    await query('DELETE FROM departments WHERE id = $1', [otherDept]);
  });

  test('the department’s IAM records one on the validation; it shows on the risk and in the system report', async () => {
    const res = await post('iam', riskId, { decision_kind: 'validated', body: 'I disagree: mitigation is not funded' });
    expect(res.status).toBe(201);
    expect(res.body.views.at(-1)).toMatchObject({ decision_kind: 'validated', body: 'I disagree: mitigation is not funded', written_role: 'information_asset_manager' });
    const list = await request(app).get(`/api/v1/risks/${riskId}/decision-views`).set(auth('ciso'));
    expect(list.body.views.some((v) => v.id === res.body.id)).toBe(true);
    const { rows: [{ system_id }] } = await query('SELECT system_id FROM risks WHERE id = $1', [riskId]);
    const report = await request(app).get(`/api/v1/reports/systems/${system_id}`).set(auth('iam'));
    const d = report.body.decisions.find((x) => x.kind === 'validated' && x.risk_id === riskId);
    expect(d.views.map((v) => v.id)).toContain(res.body.id);
    expect(report.body.people).toMatchObject({ hours_here: expect.any(Number), named: expect.any(Array) });
  });

  test('is refused for another department’s risk, for a role without the capability, and for a decision not on the risk', async () => {
    expect((await post('iam', otherRisk, { decision_kind: 'validated', body: 'x' })).status).toBe(403);
    expect((await post('ciso', riskId, { decision_kind: 'validated', body: 'x' })).status).toBe(403);
    expect((await post('iam', riskId, { decision_kind: 'accepted', decision_ref: '00000000-0000-0000-0000-000000000000', body: 'x' })).status).toBe(404);
    expect((await post('iam', riskId, { decision_kind: 'minuted', body: 'x' })).status).toBe(400);
    expect((await post('iam', riskId, { decision_kind: 'validated', body: '  ' })).status).toBe(400);
  });

  test('can never be changed or removed, whoever asks', async () => {
    const { rows: [v] } = await query('SELECT id FROM risk_decision_views WHERE risk_id = $1 LIMIT 1', [riskId]);
    await expect(query(`UPDATE risk_decision_views SET body = 'changed' WHERE id = $1`, [v.id])).rejects.toThrow(/cannot be changed or removed/);
    await expect(query('DELETE FROM risk_decision_views WHERE id = $1', [v.id])).rejects.toThrow(/cannot be changed or removed/);
  });
});
