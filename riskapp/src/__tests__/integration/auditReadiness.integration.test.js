'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Audit readiness — the CISO's C7 (docs/reporting-ciso.md). Pinned here: the
// reports.read audience; every line names a clause and never counts more met
// than there is; the SoA counts a decision with no reason, and is approved only
// while nothing has changed since its approved version; the state follows the
// counts.

const { app, request, tokenFor, query } = require('./helpers');
const { stateOf } = require('../../reports/audit');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const audit = (role) => request(app).get('/api/v1/reports/audit').set(auth(role));
const lineOf = (r, key) => r.lines.find((l) => l.key === key);

test('admin, the CISO, the SIRO and risk analysts read it; an IAO and an IAM cannot', async () => {
  for (const role of ['admin', 'ciso', 'siro', 'analyst']) expect((await audit(role)).status).toBe(200);
  for (const role of ['owner', 'iam']) expect((await audit(role)).status).toBe(403);
});

test('every line names its clause and adds up', async () => {
  const { body: r } = await audit('ciso');
  expect(r.lines.length).toBeGreaterThan(8);
  for (const l of r.lines) {
    expect(l.clause).toBeTruthy();
    expect(l.met).toBeLessThanOrEqual(l.of);
    expect(l.state).toBe(stateOf(l.met, l.of));
    expect(l.link).toMatch(/^\//);
  }
  const { rows: [n] } = await query(`SELECT COUNT(*)::int AS n FROM risks WHERE is_active`);
  expect(lineOf(r, 'risks_validated').of).toBe(n.n);
  expect(r.headline.complete).toBe(r.lines.filter((l) => l.state === 'complete').length);
});

test('the SoA: a decision with no reason is counted, and an approved version goes stale when an entry changes', async () => {
  const { rows: [e] } = await query(`SELECT control_id, justification, updated_at FROM soa_entries WHERE applicable IS NOT NULL ORDER BY control_id LIMIT 1`);
  const { body: before } = await audit('ciso');
  await query(`UPDATE soa_entries SET justification = NULL WHERE control_id = $1`, [e.control_id]);
  try {
    const { body: r } = await audit('ciso');
    const had = e.justification && e.justification.trim() ? 1 : 0;
    expect(lineOf(r, 'soa_reasons').met).toBe(lineOf(before, 'soa_reasons').met - had);
  } finally {
    await query(`UPDATE soa_entries SET justification = $2, updated_at = $3 WHERE control_id = $1`, [e.control_id, e.justification, e.updated_at]);
  }

  const { rows: [v] } = await query(`INSERT INTO soa_versions (version_no, snapshot, control_count, applicable_count, approved_at)
     VALUES ((SELECT COALESCE(MAX(version_no), 0) + 1 FROM soa_versions), '[]', 0, 0, now() + interval '1 minute') RETURNING id`);
  try {
    let l = lineOf((await audit('ciso')).body, 'soa_approved');
    expect(l).toMatchObject({ met: 1, state: 'complete' });
    await query(`UPDATE soa_entries SET updated_at = now() + interval '2 minutes' WHERE control_id = $1`, [e.control_id]);
    l = lineOf((await audit('ciso')).body, 'soa_approved');
    expect(l).toMatchObject({ met: 0, state: 'none' });
    expect(l.approved.changed_since).toBeGreaterThanOrEqual(1);
  } finally {
    await query(`UPDATE soa_entries SET updated_at = $2 WHERE control_id = $1`, [e.control_id, e.updated_at]);
    await query(`DELETE FROM soa_versions WHERE id = $1`, [v.id]);
  }
});

test('states', () => {
  expect(stateOf(0, 0)).toBe('na');
  expect(stateOf(3, 3)).toBe('complete');
  expect(stateOf(0, 3)).toBe('none');
  expect(stateOf(1, 3)).toBe('part');
});
