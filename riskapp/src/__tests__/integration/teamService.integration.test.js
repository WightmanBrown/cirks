'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The security team's service — the CISO's C6 (docs/reporting-ciso.md).
// Pinned here: the reports.read audience; every risk waiting for validation
// is counted with its age; the work counted is the security team's successful
// changes, by area, and never sign-in; four quarters, newest first.

const { app, request, tokenFor, query, USERS } = require('./helpers');
const { quarters, median } = require('../../reports/team');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const team = (role) => request(app).get('/api/v1/reports/team').set(auth(role));
const MARK = '/api/v1/soa/c6-team-service-test';

afterAll(async () => {
  await query(`DELETE FROM api_request_log WHERE endpoint LIKE $1`, [`${MARK}%`]);
  await query(`DELETE FROM api_request_log WHERE endpoint = '/api/v1/auth/c6-team-service-test'`);
});

test('admin, the CISO, the SIRO and risk analysts read it; an IAO and an IAM cannot', async () => {
  for (const role of ['admin', 'ciso', 'siro', 'analyst']) expect((await team(role)).status).toBe(200);
  for (const role of ['owner', 'iam']) expect((await team(role)).status).toBe(403);
});

test('every risk waiting for validation is counted, oldest first, with its age', async () => {
  const { body: r } = await team('ciso');
  const { rows: [n] } = await query(`SELECT COUNT(*)::int AS n FROM risks WHERE is_active AND validation_status = 'pending'`);
  const g = r.waiting.find((x) => x.key === 'validation');
  expect(g.count).toBe(n.n);
  expect(g.rows.length).toBeLessThanOrEqual(g.count);
  for (let i = 1; i < g.rows.length; i += 1) expect(g.rows[i - 1].days).toBeGreaterThanOrEqual(g.rows[i].days);
  if (g.count) expect(g.oldest_days).toBe(g.rows[0].days);
  expect(r.quarters).toHaveLength(4);
  expect(r.quarters[0].current).toBe(true);
  for (const q of r.quarters) expect(q.points_removed).toBeGreaterThanOrEqual(0);
});

test('the work counted is the security team’s successful changes, by area, and never sign-in', async () => {
  const before = (await team('ciso')).body.work;
  const was = before.people.find((p) => p.id === USERS.ciso.id)?.total || 0;
  await query(`INSERT INTO api_request_log (user_id, role, method, endpoint, status_code)
               VALUES ($1, 'ciso', 'PATCH', $2, 200), ($1, 'ciso', 'PATCH', $2, 200),
                      ($1, 'ciso', 'PATCH', $2, 409),
                      ($1, 'ciso', 'GET',   $2, 200),
                      ($1, 'ciso', 'POST',  '/api/v1/auth/c6-team-service-test', 200),
                      ($3, 'information_asset_owner', 'PATCH', $2, 200)`,
  [USERS.ciso.id, `${MARK}/x`, USERS.owner.id]);
  const { body: { work } } = await team('ciso');
  const ciso = work.people.find((p) => p.id === USERS.ciso.id);
  expect(ciso.total).toBe(was + 2);
  expect(ciso.areas['Statement of Applicability']).toBeGreaterThanOrEqual(2);
  expect(work.people.find((p) => p.id === USERS.owner.id)).toBeUndefined();
  expect(work.total).toBe(before.total + 2);
});

test('quarters and medians', () => {
  const qs = quarters(new Date(Date.UTC(2026, 0, 15)));
  expect(qs.map((q) => q.label)).toEqual(['Q1 2026', 'Q4 2025', 'Q3 2025', 'Q2 2025']);
  expect(median([])).toBeNull();
  expect(median([5, 1, 3])).toBe(3);
  expect(median([4, 1, 3, 2])).toBe(2.5);
});
