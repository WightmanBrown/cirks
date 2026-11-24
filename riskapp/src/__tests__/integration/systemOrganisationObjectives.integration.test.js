'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /systems/:id/controls/organisation (relation diagrams, 2026-11-19): what
// the organisation delivers once that reaches a system, with the SoA's status,
// and the objectives a threat here calls for that the SoA rules not applicable.

const { app, request, tokenFor, query } = require('./helpers');

const get = (role, path) => request(app).get(`/api/v1${path}`).set({ Authorization: `Bearer ${tokenFor(role)}` });
const STATUS = { implemented: 'operational', partial: 'degraded' };

test('each objective reaching the system says how, with the status the SoA gives it', async () => {
  const { rows: systems } = await query(`SELECT id FROM systems WHERE is_active ORDER BY name LIMIT 5`);
  expect(systems.length).toBeGreaterThan(0);
  for (const s of systems) {
    const res = await get('ciso', `/systems/${s.id}/controls/organisation`);
    expect(res.status).toBe(200);
    const { rows: [n] } = await query(
      `SELECT count(*)::int AS n FROM v_control_presence WHERE system_id = $1 AND via IN ('organisation', 'group')`, [s.id]);
    expect(res.body.reach).toHaveLength(n.n);
    for (const r of res.body.reach) {
      expect(['organisation', 'group']).toContain(r.via);
      expect(r.status).toBe(STATUS[r.implementation_status] || 'missing');
    }
    for (const x of res.body.not_applicable) {
      const { rows: [c] } = await query(
        `SELECT 1 FROM soa_entries se JOIN control_threats ct ON ct.control_id = se.control_id
           JOIN system_threats st ON st.threat_id = ct.threat_id
          WHERE se.control_id = $1 AND NOT se.applicable AND st.system_id = $2 LIMIT 1`, [x.id, s.id]);
      expect(c).toBeTruthy();
    }
  }
});

test('read like the system itself', async () => {
  const { rows: [s] } = await query(`SELECT id FROM systems WHERE is_active LIMIT 1`);
  expect((await get('analyst', `/systems/${s.id}/controls/organisation`)).status).toBe(200);
  expect((await request(app).get(`/api/v1/systems/${s.id}/controls/organisation`)).status).toBe(401);
});
