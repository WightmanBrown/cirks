'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Where the risk sits, a question page (docs/insights-drilldown.md step 3).
// Pinned here: it reads the board's own grid and register, its groups add up,
// a square and a minimum score narrow it correctly, and an IAO or IAM sees only
// their own department whatever they ask.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const get = (role, q = '') => request(app).get(`/api/v1/reports/exposure${q}`).set({ Authorization: `Bearer ${tokenFor(role)}` });

test('the grid is the board\'s, and every active risk is counted once', async () => {
  const [{ body: e }, { body: b }] = await Promise.all([
    get('ciso'), request(app).get('/api/v1/reports/board').set({ Authorization: `Bearer ${tokenFor('ciso')}` }),
  ]);
  expect(e.grid).toEqual(b.heat_map.current);
  const { rows: [n] } = await query('SELECT COUNT(*)::int AS n FROM risks WHERE is_active');
  expect(e.total).toBe(n.n);
  for (const list of [e.by_department, e.by_system, e.by_threat]) {
    expect(list.reduce((a, g) => a + g.risks, 0)).toBe(e.total);
    expect(list.reduce((a, g) => a + g.at_or_above_action, 0)).toBe(e.at_or_above_action);
  }
});

test('a square narrows to its risks, and a minimum score to those at or above it', async () => {
  const { body: all } = await get('ciso');
  for (let i = 1; i <= 5; i += 1) {
    for (let p = 1; p <= 5; p += 1) {
      if (!all.grid[i - 1][p - 1]) continue;
      const { body: sq } = await get('ciso', `?cell=${i},${p}`);
      expect(sq.total).toBe(all.grid[i - 1][p - 1]);
    }
  }
  const { body: high } = await get('ciso', `?min=${all.thresholds.action}`);
  expect(high.total).toBe(all.at_or_above_action);
  for (const r of high.risks) expect(r.score).toBeGreaterThanOrEqual(all.thresholds.action);
  expect((await get('ciso', '?cell=6,1')).status).toBe(400);
  expect((await get('ciso', '?min=0')).status).toBe(400);
});

test('an IAO or IAM sees their own department, whatever they ask', async () => {
  for (const role of ['owner', 'iam']) {
    const { rows: [me] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS[role].id]);
    const { status, body } = await get(role, '?department_id=00000000-0000-0000-0000-000000000000');
    expect(status).toBe(200);
    expect(body.department_id).toBe(me.department_id);
    for (const r of body.risks) expect(r.department_id).toBe(me.department_id);
  }
});
