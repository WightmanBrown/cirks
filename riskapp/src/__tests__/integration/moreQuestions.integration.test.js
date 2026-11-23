'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The remaining question pages (docs/insights-drilldown.md step 3): control
// quality, meeting a standard, work in progress, what changed. Pinned here:
// each counts what the board panel it answers counts, and the department-scoped
// ones keep an IAO or IAM to their own department.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const get = (role, path) => request(app).get(`/api/v1/reports/${path}`).set({ Authorization: `Bearer ${tokenFor(role)}` });
let board;
beforeAll(async () => { ({ body: board } = await get('ciso', 'board')); });

test('control quality counts what the board\'s quality bar counts', async () => {
  const { body: q } = await get('ciso', 'quality');
  const e = board.controls.effectiveness;
  expect(q.totals.weak).toBe(e[0] + e[1]);
  expect(q.totals.adequate).toBe(e[2]);
  expect(q.totals.strong).toBe(e[3] + e[4]);
  expect(q.totals.not_rated).toBe(board.controls.effectiveness_not_rated);
  // Weak and not rated come first.
  const order = q.objectives.map((o) => ['weak', 'not_rated', 'adequate', 'strong'].indexOf(o.band));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test('each standard\'s requirements are the board\'s compliance row', async () => {
  const { body: { standards } } = await get('ciso', 'standards');
  for (const s of standards) {
    const { body: st } = await get('ciso', `standards/${s.code}`);
    const row = board.compliance.find((c) => c.code === s.code);
    expect([st.totals.covered, st.totals.partial, st.totals.gap, st.totals.excluded]).toEqual([row.covered, row.partial, row.gap, row.excluded]);
    for (const r of st.requirements) if (r.state === 'covered') expect(r.shortfalls).toEqual([]);
  }
  expect((await get('ciso', 'standards/no_such_standard')).status).toBe(404);
});

test('work in progress lists every unfinished action once, overdue first', async () => {
  const { body: w } = await get('ciso', 'work');
  const { rows: [n] } = await query(`SELECT COUNT(*)::int AS n FROM security_actions
                                      WHERE status NOT IN ('completed', 'cancelled', 'verified', 'rejected')`);
  expect(w.totals.actions).toBe(n.n);
  expect(new Set(w.actions.map((a) => a.id)).size).toBe(w.actions.length);
  const firstNotOverdue = w.actions.findIndex((a) => !a.overdue);
  if (firstNotOverdue >= 0) for (const a of w.actions.slice(firstNotOverdue)) expect(a.overdue).toBe(false);
});

test('what changed lists real changes only, in the period asked', async () => {
  const { body: c } = await get('ciso', 'changes?days=1095');
  expect(c.totals.down + c.totals.up).toBe(c.totals.changes);
  for (const x of c.changes) expect(x.before).not.toBe(x.after);
  expect((await get('ciso', 'changes?days=0')).status).toBe(400);
  expect((await get('ciso', 'changes?days=1096')).status).toBe(400);
});

test('work and changes keep an IAO or IAM to their own department', async () => {
  for (const role of ['owner', 'iam']) {
    const { rows: [me] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS[role].id]);
    for (const path of ['work', 'changes']) {
      const { status, body } = await get(role, `${path}?department_id=00000000-0000-0000-0000-000000000000`);
      expect(status).toBe(200);
      expect(body.department_id).toBe(me.department_id);
    }
  }
});

// Round 2 (owner and tester, 2026-11-16).
test('the board tile "decided, with nothing carrying it out" lists exactly what it counts', async () => {
  const { body: e } = await get('ciso', 'exposure?only=decided_not_delivered');
  expect(e.total).toBe(board.exposure.decided_not_delivered);
  for (const r of e.risks) {
    expect(r.treatment_decision).toBeTruthy();
    expect(r.treatment_decision).not.toBe('accept');
    expect(r.has_open_action).toBe(false);
    expect(r.has_active_exception).toBe(false);
  }
  expect((await get('ciso', 'exposure?only=nonsense')).status).toBe(400);
});

test('awaiting decision includes every expired acceptance the board counts', async () => {
  const { body: d } = await get('ciso', 'decisions');
  const expired = d.acceptances.filter((a) => a.days_left < 0);
  expect(expired.length).toBeGreaterThanOrEqual(board.exposure.acceptances_expired);
});

test('each shortfall says why the objective applies', async () => {
  const { body: { standards } } = await get('ciso', 'standards');
  if (!standards.length) return;
  const { body: st } = await get('ciso', `standards/${standards[0].code}`);
  for (const r of st.requirements) {
    for (const f of r.shortfalls) {
      expect(f.source).toEqual(expect.objectContaining({ risks: expect.any(Number), threats: expect.any(Array) }));
      if (f.source.risks === 0) expect(f.source.threats).toEqual([]);
    }
  }
});

test('the department report lists its compliance gaps: applicable, recorded, not in place', async () => {
  const { rows: [me] } = await query('SELECT department_id FROM users WHERE id = $1', [USERS.owner.id]);
  const { body: r } = await get('owner', 'department');
  const g = r.compliance_gaps;
  expect(g.system_gaps).toBe(g.systems.reduce((n, s) => n + s.objectives.length, 0));
  const { rows: [n] } = await query(`
    SELECT COUNT(*)::int AS n FROM system_controls sc
      JOIN systems s ON s.id = sc.system_id AND s.department_id = $1 AND s.is_active
      JOIN controls c ON c.id = sc.control_id AND COALESCE(c.delivery, '') NOT IN ('organisation', 'group')
      JOIN soa_entries se ON se.control_id = c.id AND se.applicable
     WHERE sc.status::text IN ('missing', 'unknown')`, [me.department_id]);
  expect(g.system_gaps).toBe(n.n);
  for (const o of g.organisation) expect(o.status).not.toBe('implemented');
});
