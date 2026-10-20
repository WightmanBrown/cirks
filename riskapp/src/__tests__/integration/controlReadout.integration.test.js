'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /controls/:id carries a read-out of how well the objective is met, for the
// objective page (2026-09-22). The figures must agree with the tables they come
// from — asserted against direct SQL rather than hard-coded, so a fixture change
// cannot make the test pass for the wrong reason.

const { app, request, tokenFor, query } = require('./helpers');

const MFA = '55555555-0000-0000-0000-000000000001';   // fixture: applicable + implemented
const get = (path) => request(app).get(path).set('Authorization', `Bearer ${tokenFor('ciso')}`);

describe('the objective read-out', () => {
  it('carries the objective\'s SoA entry', async () => {
    const res = await get(`/api/v1/controls/${MFA}`);
    expect(res.status).toBe(200);
    expect(res.body.soa).toMatchObject({ decided: true, applicable: true, implementation_status: 'implemented' });
  });

  it('counts deployments by status, excluding exclusions from "deployed"', async () => {
    const res = await get(`/api/v1/controls/${MFA}`);
    const { rows } = await query(
      `SELECT status::text AS status, count(*)::int AS n FROM system_controls WHERE control_id = $1 GROUP BY status`, [MFA]);
    const expected = Object.fromEntries(rows.map(r => [r.status, r.n]));
    expect(res.body.readout.by_status).toEqual(expected);
    const deployed = rows.filter(r => r.status !== 'not_applicable').reduce((n, r) => n + r.n, 0);
    expect(res.body.readout.deployed_systems).toBe(deployed);
  });

  it('counts the active risks it treats with the coverage panel\'s rule', async () => {
    const res = await get(`/api/v1/controls/${MFA}`);
    const { rows } = await query(
      `SELECT count(DISTINCT r.id)::int AS n FROM system_controls syc
       JOIN control_threats ct ON ct.control_id = syc.control_id
       JOIN risks r ON r.system_id = syc.system_id AND r.threat_id = ct.threat_id AND r.is_active
       WHERE syc.control_id = $1 AND syc.status <> 'not_applicable'`, [MFA]);
    expect(res.body.readout.risks_treated).toBe(rows[0].n);
    expect(typeof res.body.readout.risks_treated).toBe('number');
  });

  it('an objective nobody has decided on says so', async () => {
    const c = await query(
      `INSERT INTO controls (title, control_type) VALUES ('READOUT undecided objective', 'preventive') RETURNING id`);
    try {
      const res = await get(`/api/v1/controls/${c.rows[0].id}`);
      expect(res.body.soa).toMatchObject({ decided: false, applicable: false });
      expect(res.body.readout).toMatchObject({ deployed_systems: 0, risks_treated: 0 });
    } finally {
      await query(`DELETE FROM controls WHERE id = $1`, [c.rows[0].id]);
    }
  });
});

describe('maturity arrives on the SoA record rows, where it is now rated', () => {
  it('each control row carries its effectiveness', async () => {
    const res = await get('/api/v1/soa');
    const row = res.body.groups.flatMap(g => g.controls).find(r => r.control_id === MFA);
    const { rows } = await query(`SELECT effectiveness FROM controls WHERE id = $1`, [MFA]);
    expect(row).toHaveProperty('effectiveness', rows[0].effectiveness);
  });
});
