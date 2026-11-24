'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /threats/:id/controls for the threat page's picture (relation diagrams,
// 2026-11-19): each objective's state on every system the threat is identified
// against, and the security solutions delivering it.

const { app, request, tokenFor, query } = require('./helpers');

const get = (path) => request(app).get(`/api/v1${path}`).set({ Authorization: `Bearer ${tokenFor('ciso')}` });

// The seed's three threat-objective links (test/e2e/db/seed.sql). Two older
// files (threatUnlinkWithdrawsItems, controlExclusion) delete them when they
// finish, so when this file ran after both it found none and failed, depending
// only on the order the files ran in (2026-11-23). Put back what the seed
// promises; ON CONFLICT leaves them alone when they are there.
beforeAll(async () => {
  await query(`
    INSERT INTO control_threats (control_id, threat_id, created_by) VALUES
      ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
      ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
      ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003')
    ON CONFLICT DO NOTHING`);
});

test('each objective carries its state on the threat\'s systems and its solutions', async () => {
  const { rows: threats } = await query(
    `SELECT threat_id AS id FROM control_threats GROUP BY threat_id ORDER BY count(*) DESC LIMIT 3`);
  expect(threats.length).toBeGreaterThan(0);
  for (const t of threats) {
    const res = await get(`/threats/${t.id}/controls`);
    expect(res.status).toBe(200);
    const { rows: [n] } = await query(
      `SELECT count(*)::int AS n FROM system_threats st JOIN systems s ON s.id = st.system_id AND s.is_active WHERE st.threat_id = $1`, [t.id]);
    for (const c of res.body.controls) {
      expect(c.on_systems).toHaveLength(n.n);
      for (const s of c.on_systems) {
        const { rows: [sc] } = await query(`SELECT status::text FROM system_controls WHERE system_id = $1 AND control_id = $2`, [s.system_id, c.id]);
        expect(s.status).toBe(sc ? sc.status : 'not_recorded');
      }
      const { rows: sols } = await query(`SELECT pattern_id FROM delivery_pattern_objectives WHERE control_id = $1`, [c.id]);
      expect(c.solutions.map((s) => s.id).sort()).toEqual(sols.map((s) => s.pattern_id).sort());
    }
  }
});
