'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The board summary (docs/reporting-siro.md, report 9) and the monthly capture
// that draws its trend (v168). Pinned here: every active risk is on the heat map
// exactly once, now and after committed work; the risks at or above the
// threshold are answered by an action, an acceptance or nothing, and those add
// up; each standard's requirements are counted by the SoA's own derivation; and
// a month is captured once however often the capture runs.

const { app, request, tokenFor, query } = require('./helpers');
const { captureBoard, METRIC_KEY } = require('../../jobs/metricCapture');
const { heatCell } = require('../../reports/board');

const api = (role) => request(app).get('/api/v1/reports/board').set({ Authorization: `Bearer ${tokenFor(role)}` });
let b;

beforeAll(async () => {
  await query('DELETE FROM metric_snapshots WHERE metric_key = $1', [METRIC_KEY]);
  const res = await api('siro');
  expect(res.status).toBe(200);
  b = res.body;
});
afterAll(() => query(`DELETE FROM metric_snapshots WHERE metric_key = $1 OR metric_key LIKE 'department.headline:%' OR metric_key LIKE 'system.headline:%'`, [METRIC_KEY]));

const sum = (grid) => grid.flat().reduce((a, n) => a + n, 0);

test('every active risk is on the heat map once, now and after committed work', async () => {
  const { rows: [n] } = await query('SELECT COUNT(*)::int AS n FROM risks WHERE is_active');
  expect(sum(b.heat_map.current)).toBe(n.n);
  expect(sum(b.heat_map.target)).toBe(n.n);
  expect(b.exposure.total).toBe(n.n);
});

test('a risk sits in the cell of the dimension that gives its score', () => {
  const r = { probability_c: 2, probability_i: 4, probability_a: 1, impact_c: 5, impact_i: 3, impact_a: 5,
              tgt_p_c: null, tgt_p_i: 1, tgt_p_a: null };
  expect(heatCell(r)).toMatchObject({ probability: 4, impact: 3, score: 12 });
  // After committed work integrity falls to 1 × 3; confidentiality (2 × 5) gives the score.
  expect(heatCell(r, true)).toMatchObject({ probability: 2, impact: 5, score: 10 });
});

test('the risks at or above the threshold are each answered once, or not at all', () => {
  const x = b.exposure;
  expect(x.answered_by_action + x.answered_by_acceptance + x.unanswered).toBe(x.at_or_above_action);
  expect(x.decided_not_delivered).toBeLessThanOrEqual(x.unanswered);
  expect(x.target_at_or_above_action).toBeLessThanOrEqual(x.at_or_above_action);
});

test('every enabled standard is listed, loaded or not, and no disabled one', async () => {
  const { rows } = await query(`SELECT code, (SELECT COUNT(*)::int FROM standard_controls sc WHERE sc.standard_id = s.id) AS n
                                  FROM standards s WHERE s.is_enabled ORDER BY s.sort_index, s.name`);
  expect(b.compliance.map((c) => c.code)).toEqual(rows.map((r) => r.code));
  for (const r of rows) expect(b.compliance.find((c) => c.code === r.code).loaded).toBe(r.n > 0);

  const { rows: [one] } = await query(`SELECT id, code FROM standards WHERE is_enabled ORDER BY sort_index LIMIT 1`);
  await query('UPDATE standards SET is_enabled = FALSE WHERE id = $1', [one.id]);
  try {
    const res = await api('ciso');
    expect(res.body.compliance.map((c) => c.code)).not.toContain(one.code);
  } finally {
    await query('UPDATE standards SET is_enabled = TRUE WHERE id = $1', [one.id]);
  }
});

test('each standard is counted by the SoA\'s own derivation', async () => {
  for (const s of b.compliance) {
    expect(s.covered + s.partial + s.gap + s.excluded).toBe(s.requirements);
    const soa = await request(app).get(`/api/v1/soa?framework=${s.code}`).set({ Authorization: `Bearer ${tokenFor('ciso')}` });
    expect(soa.status).toBe(200);
    const rows = (soa.body.groups || []).flatMap((g) => g.controls || []);
    if (rows.length) {
      expect(rows.filter((r) => r.requirement_state === 'covered').length).toBe(s.covered);
      expect(rows.length).toBe(s.requirements);
    }
  }
});

test('controls on systems and the effectiveness ratings are counted, not estimated', async () => {
  const { rows: [n] } = await query(`SELECT COUNT(*)::int AS n FROM system_controls WHERE status::text <> 'not_applicable'`);
  const c = b.controls.on_systems;
  expect(c.operational + c.degraded + c.missing).toBe(n.n);
  expect(b.controls.effectiveness).toHaveLength(5);
});

test('a month is captured once, however often the capture runs', async () => {
  expect(await captureBoard()).toBe(1);
  expect(await captureBoard()).toBe(0);
  const res = await api('ciso');
  expect(res.body.trend).toHaveLength(1);
  const [snap] = res.body.trend;
  expect(snap.period).toBe(new Date().toISOString().slice(0, 7));
  // The capture keeps counts with their denominators, from the same definitions.
  expect(snap.summary.exposure.total).toBe(res.body.exposure.total);
  expect(snap.summary.exposure.at_or_above_action).toBe(res.body.exposure.at_or_above_action);
});

describe('tolerances (v169)', () => {
  const KEY = 'exposure.at_or_above_action';
  const put = (role, body) => request(app).put(`/api/v1/reports/tolerances/${KEY}`)
    .set({ Authorization: `Bearer ${tokenFor(role)}` }).send(body);
  const tileOf = (body) => body.tiles.find((t) => t.key === KEY);

  afterAll(() => query('DELETE FROM metric_tolerances'));

  test('no figure is rated until a tolerance is set', () => {
    for (const t of b.tiles) {
      expect(t.tolerance).toBeNull();
      expect(t.rag).toBeNull();
    }
  });

  test('only the SIRO sets one; the CISO reports against it', async () => {
    expect((await put('ciso', { green_max: 0, amber_max: 1, reason: 'x' })).status).toBe(403);
    expect((await put('admin', { green_max: 0, amber_max: 1, reason: 'x' })).status).toBe(403);
  });

  test('it needs whole numbers, green at the better end, and a reason', async () => {
    expect((await put('siro', { green_max: 5, amber_max: 2, reason: 'x' })).status).toBe(400);
    expect((await put('siro', { green_max: 1.5, amber_max: 2, reason: 'x' })).status).toBe(400);
    expect((await put('siro', { green_max: 1, amber_max: 2, reason: ' ' })).status).toBe(400);
    expect((await request(app).put('/api/v1/reports/tolerances/no.such.figure')
      .set({ Authorization: `Bearer ${tokenFor('siro')}` }).send({ green_max: 1, amber_max: 2, reason: 'x' })).status).toBe(404);
  });

  test('the figure is rated red, amber or green against it, and the change is audited', async () => {
    const value = tileOf(b).value;
    // Green up to the value itself: green.
    expect((await put('siro', { green_max: value, amber_max: value + 5, reason: 'Board, October' })).status).toBe(200);
    let t = tileOf((await api('ciso')).body);
    expect(t).toMatchObject({ rag: 'green', tolerance: { green_max: value, amber_max: value + 5, reason: 'Board, October' } });
    expect(t.tolerance.set_by_name).toBeTruthy();
    if (value > 0) {
      await put('siro', { green_max: 0, amber_max: value, reason: 'Tighter' });
      expect(tileOf((await api('ciso')).body).rag).toBe('amber');
      await put('siro', { green_max: 0, amber_max: value - 1, reason: 'Tighter still' });
      expect(tileOf((await api('ciso')).body).rag).toBe('red');
    }
    const { rows } = await query(`SELECT action::text, human_narrative FROM audit_log
                                   WHERE entity_type = 'metric_tolerances' AND entity_label = $1 ORDER BY created_at`, [KEY]);
    expect(rows[0].action).toBe('create');
    expect(rows[rows.length - 1].human_narrative).toMatch(/→ green up to 0/);
  });

  test('the monthly capture keeps the tolerance in force', async () => {
    await query('DELETE FROM metric_snapshots WHERE metric_key = $1', [METRIC_KEY]);
    await captureBoard();
    const { rows: [snap] } = await query('SELECT summary FROM metric_snapshots WHERE metric_key = $1', [METRIC_KEY]);
    const kept = snap.summary.tiles.find((t) => t.key === KEY);
    expect(kept.tolerance).toMatchObject({ direction: 'lower_better' });
    expect(['green', 'amber', 'red']).toContain(kept.rag);
  });

  test('clearing it stops the rating', async () => {
    const del = await request(app).delete(`/api/v1/reports/tolerances/${KEY}`).set({ Authorization: `Bearer ${tokenFor('siro')}` });
    expect(del.status).toBe(204);
    const t = tileOf((await api('ciso')).body);
    expect(t).toMatchObject({ tolerance: null, rag: null });
  });
});

