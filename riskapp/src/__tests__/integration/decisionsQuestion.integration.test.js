'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Decisions owed, a question page (docs/insights-drilldown.md step 3). Pinned
// here: it agrees with the CISO report's agreement states, each risk owed is at
// exactly one step with someone named, and an IAO or IAM sees only their own
// department whatever they ask.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const get = (role, q = '') => request(app).get(`/api/v1/reports/decisions${q}`).set({ Authorization: `Bearer ${tokenFor(role)}` });

test('agrees with the CISO report: answered is agreed, everything else is owed', async () => {
  const [{ body: d }, { body: c }] = await Promise.all([
    get('ciso'), request(app).get('/api/v1/reports/ciso').set({ Authorization: `Bearer ${tokenFor('ciso')}` }),
  ]);
  expect(d.total).toBe(c.agreement.total);
  expect(d.answered).toBe(c.agreement.agreed);
  const notAgreed = new Set(c.agreement.risks.filter((x) => x.state !== 'agreed').map((x) => x.risk_id));
  expect(new Set(d.owed.map((x) => x.risk_id))).toEqual(notAgreed);
  expect(d.by_stage.reduce((a, s) => a + s.count, 0)).toBe(d.owed.length);
  for (const x of d.owed) {
    expect(['validate', 'correct', 'treat', 'agree']).toContain(x.stage);
    expect(x.who).toEqual(expect.any(String));
    if (x.stage === 'agree') expect(x.treatment_decision).toBeTruthy();
  }
});

test('an IAO or IAM sees their own department, whatever they ask', async () => {
  for (const role of ['owner', 'iam']) {
    const { rows: [me] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS[role].id]);
    const { status, body } = await get(role, '?department_id=00000000-0000-0000-0000-000000000000');
    expect(status).toBe(200);
    expect(body.department_id).toBe(me.department_id);
    for (const x of body.owed) expect(x.department_id).toBe(me.department_id);
  }
});

test('the roles without a report are refused', async () => {
  expect((await get('secretary')).status).toBe(403);
  expect((await get('soc')).status).toBe(403);
});
