'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The IAM's My systems and system reports (docs/reporting-iam.md). Pinned here:
// "my systems" is the department's systems; an IAM or IAO cannot read another
// department's system, admin, CISO and SIRO can; compliance on a system never
// counts a requirement as met while an objective that applies there is not in
// place; decisions come newest first; and the monthly capture keeps each system.

const { app, request, tokenFor, query, USERS } = require('./helpers');
const { captureBoard } = require('../../jobs/metricCapture');
const { systemKey } = require('../../reports/systems');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const list = (role, q = {}) => request(app).get('/api/v1/reports/systems').query(q).set(auth(role));
const one = (role, id) => request(app).get(`/api/v1/reports/systems/${id}`).set(auth(role));

let ownDept, otherDept, otherSystem;
beforeAll(async () => {
  ({ rows: [{ department_id: ownDept }] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS.iam.id]));
  ({ rows: [{ id: otherDept }] } = await query(`INSERT INTO departments (name) VALUES ('SYSREPORT other') RETURNING id`));
  ({ rows: [{ id: otherSystem }] } = await query(
    `INSERT INTO systems (name, department_id) VALUES ('SYSREPORT elsewhere', $1) RETURNING id`, [otherDept]));
});
afterAll(async () => {
  await query('DELETE FROM systems WHERE id = $1', [otherSystem]);
  await query('DELETE FROM departments WHERE id = $1', [otherDept]);
});

test('My systems is the department’s systems, whatever an IAM asks for', async () => {
  const res = await list('iam', { department_id: otherDept });
  expect(res.status).toBe(200);
  expect(res.body.department.id).toBe(ownDept);
  const { rows } = await query('SELECT id FROM systems WHERE department_id = $1 AND is_active', [ownDept]);
  expect(new Set(res.body.systems.map((s) => s.system_id))).toEqual(new Set(rows.map((r) => r.id)));
  for (const s of res.body.systems) {
    expect(s.answered).toBeLessThanOrEqual(s.at_or_above_action);
    for (const c of s.compliance) expect(c.met + c.partial + c.gap).toBe(c.applies);
  }
  expect(res.body.record).toMatchObject({ items_completed: expect.any(Number), recorded_changes: expect.any(Number) });
});

test('an IAM cannot open another department’s system; the CISO can', async () => {
  expect((await one('iam', otherSystem)).status).toBe(403);
  expect((await one('owner', otherSystem)).status).toBe(403);
  expect((await one('ciso', otherSystem)).status).toBe(200);
  expect((await one('analyst', otherSystem)).status).toBe(200);
  expect((await one('secretary', otherSystem)).status).toBe(403);
  expect((await one('ciso', 'not-a-uuid')).status).toBe(400);
});

test('a system report: met only when every objective that applies here is in place; decisions newest first', async () => {
  const { body: l } = await list('iam');
  const id = l.systems.find((s) => s.risks > 0)?.system_id || l.systems[0].system_id;
  const { body: r } = await one('iam', id);
  expect(r.system.id).toBe(id);
  for (const st of r.compliance) {
    for (const q of st.requirements) {
      const allIn = q.objectives.every((o) => o.status === 'operational');
      expect(q.state === 'met').toBe(allIn);
      expect(q.shortfalls.length).toBe(q.objectives.filter((o) => o.status !== 'operational').length);
    }
  }
  for (let i = 1; i < r.decisions.length; i += 1) {
    expect(new Date(r.decisions[i - 1].at).getTime()).toBeGreaterThanOrEqual(new Date(r.decisions[i].at).getTime());
  }
  const { rows: risks } = await query('SELECT id FROM risks WHERE system_id = $1 AND is_active', [id]);
  expect(r.risks.length).toBe(risks.length);
  const a = r.headline.answered;
  expect(a.treated + a.accepted + a.nothing).toBe(r.headline.at_or_above_action);
});

test('the monthly capture keeps each system’s counts', async () => {
  await query(`DELETE FROM metric_snapshots WHERE metric_key LIKE 'system.headline:%'`);
  await captureBoard();
  const { body: l } = await list('iam');
  const s = l.systems[0];
  const { rows: [snap] } = await query('SELECT summary FROM metric_snapshots WHERE metric_key = $1', [systemKey(s.system_id)]);
  expect(snap.summary.at_or_above_action).toBe(s.at_or_above_action);
  await query(`DELETE FROM metric_snapshots WHERE metric_key LIKE 'system.headline:%' OR metric_key LIKE 'department.headline:%' OR metric_key = 'board.headline'`);
});
