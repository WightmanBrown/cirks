'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The IAO's My department report (docs/reporting-iao.md, v172). Pinned here: an
// IAO or IAM always gets their own department, whatever they ask for; admin,
// CISO and SIRO may choose; every risk shown is the department's, and every
// shared system is used by its services but owned elsewhere; an obligation
// never claims more met than there are; reputational tables are marked only by
// the CISO or admin, audited; and the monthly capture keeps each department.

const { app, request, tokenFor, query, USERS } = require('./helpers');
const { captureBoard } = require('../../jobs/metricCapture');
const { departmentKey } = require('../../reports/department');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const get = (role, departmentId) => request(app).get('/api/v1/reports/department')
  .query(departmentId ? { department_id: departmentId } : {}).set(auth(role));

let ownDept, otherDept;
beforeAll(async () => {
  ({ rows: [{ department_id: ownDept }] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS.owner.id]));
  // The seed has one department: another to ask for.
  ({ rows: [{ id: otherDept }] } = await query(`INSERT INTO departments (name) VALUES ('DEPTREPORT other') RETURNING id`));
});
afterAll(() => query('DELETE FROM departments WHERE id = $1', [otherDept]));

test('an IAO or IAM gets their own department, even when asking for another', async () => {
  for (const role of ['owner', 'iam']) {
    const res = await get(role, otherDept);
    expect(res.status).toBe(200);
    const { rows: [me] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS[role].id]);
    expect(res.body.department.id).toBe(me.department_id);
  }
});

test('admin, CISO, SIRO and the risk analyst may choose a department; a secretary may not read it', async () => {
  for (const role of ['admin', 'ciso', 'siro', 'analyst']) expect((await get(role, otherDept)).body.department.id).toBe(otherDept);
  expect((await get('secretary')).status).toBe(403);
  expect((await get('ciso', 'not-a-uuid')).status).toBe(400);
});

test('every risk is the department’s; every shared system is used by its services and owned elsewhere', async () => {
  const { body: r } = await get('owner');
  const { rows: own } = await query(
    'SELECT r.id FROM risks r JOIN systems s ON s.id = r.system_id WHERE r.is_active AND s.department_id = $1', [ownDept]);
  expect(new Set(r.risks.map((x) => x.risk_id))).toEqual(new Set(own.map((x) => x.id)));
  for (const s of r.shared.systems) {
    expect(s.owner_department_id).not.toBe(ownDept);
    const { rows } = await query(
      `SELECT 1 FROM business_service_systems bss JOIN business_services bs ON bs.id = bss.service_id
        WHERE bss.system_id = $1 AND bs.department_id = $2`, [s.system_id, ownDept]);
    expect(rows.length).toBeGreaterThan(0);
    for (const x of s.risks) expect(x.score).toBeGreaterThanOrEqual(r.thresholds.action);
  }
});

test('the answered split and the obligations add up', async () => {
  const { body: r } = await get('owner');
  const a = r.headline.answered;
  expect(a.treated + a.accepted + a.nothing).toBe(r.headline.at_or_above_action);
  for (const o of r.obligations) {
    expect(o.met).toBeLessThanOrEqual(o.total);
    expect(o.met).toBe(Math.max(0, o.total - o.open.length));
  }
  expect(r.headline.obligations_met).toBe(r.obligations.filter((o) => o.open.length === 0).length);
});

describe('reputational impact tables', () => {
  let tableId;
  beforeAll(async () => {
    ({ rows: [{ id: tableId }] } = await query(
      `INSERT INTO impact_tables (name, scope, department_id) VALUES ('DEPTREPORT reputation', 'organisation', $1) RETURNING id`, [ownDept]));
  });
  afterAll(() => query('DELETE FROM impact_tables WHERE id = $1', [tableId]));
  const mark = (role, v) => request(app).patch(`/api/v1/bil/impact-tables/${tableId}/reputational`)
    .set(auth(role)).send({ is_reputational: v });

  test('only the CISO or admin may mark one, and it is audited', async () => {
    expect((await mark('owner', true)).status).toBe(403);
    expect((await mark('siro', true)).status).toBe(403);
    expect((await mark('ciso', 'yes')).status).toBe(400);
    const before = (await get('owner')).body.reputation.tables_marked;
    expect((await mark('ciso', true)).body.is_reputational).toBe(true);
    expect((await get('owner')).body.reputation.tables_marked).toBe(before + 1);
    const { rows: [a] } = await query(
      `SELECT human_narrative FROM audit_log WHERE entity_type = 'impact_tables' ORDER BY created_at DESC LIMIT 1`);
    expect(a.human_narrative).toMatch(/marked as reputational/);
  });
});

test('the monthly capture keeps each department’s counts', async () => {
  await query(`DELETE FROM metric_snapshots WHERE metric_key LIKE 'department.headline:%'`);
  await captureBoard();
  const { rows: [snap] } = await query('SELECT summary FROM metric_snapshots WHERE metric_key = $1', [departmentKey(ownDept)]);
  const { body: r } = await get('owner');
  expect(snap.summary.at_or_above_action).toBe(r.headline.at_or_above_action);
  expect(snap.summary.thresholds.action).toBe(r.thresholds.action);
  await query(`DELETE FROM metric_snapshots WHERE metric_key LIKE 'department.headline:%' OR metric_key = 'board.headline'`);
});
