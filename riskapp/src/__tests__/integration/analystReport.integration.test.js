'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The risk analyst's reports (docs/reporting-analyst.md). Pinned here: an
// analyst sees their own work and cannot ask for another's; the CISO sees the
// team or one analyst; the worklist and quality figures count only what CIRKS
// records under the person's name, and never more than there is; the unknown
// risk report counts what it lists; and the analyst now reads the reports
// (broad access, decision 1).

const { app, request, tokenFor, query, USERS } = require('./helpers');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const mine = (role, q = {}) => request(app).get('/api/v1/reports/analyst').query(q).set(auth(role));

test('an analyst sees their own work, whatever they ask for; an IAO cannot read it', async () => {
  const res = await mine('analyst', { analyst: 'team' });
  expect(res.status).toBe(200);
  expect(res.body.who).toMatchObject({ kind: 'self', can_choose: false });
  const { rows: [n] } = await query('SELECT COUNT(*)::int AS n FROM risks WHERE is_active AND identified_by = $1', [USERS.analyst.id]);
  expect(res.body.headline.risks_identified).toBe(n.n);
  expect((await mine('owner')).status).toBe(403);
});

test('the CISO sees the team, or one analyst', async () => {
  const team = await mine('ciso');
  expect(team.body.who.kind).toBe('team');
  expect(team.body.who.analysts.map((a) => a.id)).toContain(USERS.analyst.id);
  const one = await mine('ciso', { analyst: USERS.analyst.id });
  expect(one.body.who).toMatchObject({ kind: 'analyst', id: USERS.analyst.id });
  expect((await mine('ciso', { analyst: USERS.owner.id })).status).toBe(404);
});

test('the figures add up and count only the person’s own records', async () => {
  const { body: r } = await mine('analyst');
  const q = r.quality;
  expect(q.completeness.fully_judged).toBeLessThanOrEqual(q.risks);
  expect(q.acceptance.first_time).toBeLessThanOrEqual(q.acceptance.validated);
  expect(q.acceptance.validated + q.acceptance.returned_now + q.acceptance.pending).toBeLessThanOrEqual(q.risks);
  for (const g of r.work) expect(g.rows.length).toBeLessThanOrEqual(g.count);
  const { rows: [j] } = await query('SELECT COUNT(*)::int AS n FROM risk_control_probability WHERE set_by = $1 AND set_at >= now() - interval \'365 days\'', [USERS.analyst.id]);
  expect(r.record.judgements_set).toBe(j.n);
  expect(r.record.points_removed).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(r.benefit.fixes)).toBe(true);
  expect(r.relationships.length).toBeGreaterThan(0);
});

test('a risk returned for rework is first on the worklist', async () => {
  const { rows: [{ id }] } = await query(
    `SELECT id FROM risks WHERE is_active AND identified_by = $1 ORDER BY id LIMIT 1`, [USERS.analyst.id]);
  const { rows: [was] } = await query('SELECT validation_status FROM risks WHERE id = $1', [id]);
  await query(`UPDATE risks SET validation_status = 'returned', validation_notes = 'Rationale too thin' WHERE id = $1`, [id]);
  try {
    const { body: r } = await mine('analyst');
    const g = r.work.find((x) => x.key === 'returned');
    expect(r.work[0].key).toBe('returned');
    expect(g.rows.find((x) => x.risk_id === id)).toMatchObject({ why: 'Rationale too thin', link: `/risks/${id}` });
  } finally {
    await query('UPDATE risks SET validation_status = $2, validation_notes = NULL WHERE id = $1', [id, was.validation_status]);
  }
});

test('the unknown-risk report counts what it lists, and is read by the analyst and the CISO', async () => {
  for (const role of ['analyst', 'ciso']) expect((await request(app).get('/api/v1/reports/unknown').set(auth(role))).status).toBe(200);
  expect((await request(app).get('/api/v1/reports/unknown').set(auth('owner'))).status).toBe(403);
  const { body: u } = await request(app).get('/api/v1/reports/unknown').set(auth('analyst'));
  for (const g of u.groups) {
    expect(g.rows.length).toBe(Math.min(g.count, 25));
    expect(g.who).toBeTruthy();
  }
  const { rows: [n] } = await query(
    `SELECT COUNT(*)::int AS n FROM system_threats st JOIN systems s ON s.id = st.system_id AND s.is_active
      WHERE NOT EXISTS (SELECT 1 FROM risks r WHERE r.system_id = st.system_id AND r.threat_id = st.threat_id)`);
  expect(u.groups.find((g) => g.key === 'unassessed').count).toBe(n.n);
});
