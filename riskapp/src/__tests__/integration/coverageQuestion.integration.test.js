'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Control coverage on systems, the first question page (docs/insights-
// drilldown.md step 3). Pinned here: it counts what the board's ring counts, a
// department's systems add up to that department's row, every row's parts add
// up, and an IAO or IAM sees only their own department whatever they ask.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const get = (role, q = '') => request(app).get(`/api/v1/reports/coverage${q}`).set({ Authorization: `Bearer ${tokenFor(role)}` });

test('counts exactly what the board ring counts', async () => {
  const [{ body: c }, { body: b }] = await Promise.all([
    get('ciso'),
    request(app).get('/api/v1/reports/board').set({ Authorization: `Bearer ${tokenFor('ciso')}` }),
  ]);
  const ring = b.controls.on_systems;
  expect([c.totals.operational, c.totals.degraded, c.totals.missing]).toEqual([ring.operational, ring.degraded, ring.missing]);
  expect(c.can_choose).toBe(true);
});

test('every row adds up, and the views agree with the totals', async () => {
  const { body: c } = await get('ciso');
  for (const list of [c.objectives, c.systems, c.departments]) {
    for (const r of list) expect(r.operational + r.degraded + r.missing).toBe(r.total);
    expect(list.reduce((n, r) => n + r.total, 0)).toBe(c.totals.total);
  }
  expect(c.degraded.length).toBe(c.totals.degraded);
  // Best first: no row is better covered than the one before it.
  const share = (r) => r.operational / r.total;
  for (let i = 1; i < c.systems.length; i += 1) expect(share(c.systems[i])).toBeLessThanOrEqual(share(c.systems[i - 1]));
  // A cause is given only where something is not in place.
  for (const o of c.objectives) if (o.cause) expect(o.operational).toBe(0);
});

test('narrowed to a department, it counts that department\'s systems only', async () => {
  const { body: all } = await get('ciso');
  for (const d of all.departments.filter((x) => x.department_id)) {
    const { body: one } = await get('ciso', `?department_id=${d.department_id}`);
    expect(one.totals.total).toBe(d.total);
    for (const s of one.systems) expect(s.department_id).toBe(d.department_id);
  }
});

test('an IAO or IAM sees their own department, whatever they ask', async () => {
  for (const role of ['owner', 'iam']) {
    const { rows: [me] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS[role].id]);
    const { status, body } = await get(role, '?department_id=00000000-0000-0000-0000-000000000000');
    expect(status).toBe(200);
    expect(body.department_id).toBe(me.department_id);
    expect(body.can_choose).toBe(false);
    for (const s of body.systems) expect(s.department_id).toBe(me.department_id);
  }
});
