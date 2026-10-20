'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// SoA findings are DERIVED (v130): each appears when the SoA and the register
// disagree and disappears when either is corrected — nothing is stored.
//
// Fixture: risk ...0003 is HR System × threat ...0001. A control deployed on HR
// and linked to that threat therefore counts on that risk.

const { app, request, tokenFor, query } = require('./helpers');

const HR      = '44444444-0000-0000-0000-000000000002';
const THREAT  = '33333333-0000-0000-0000-000000000001';
const CISO    = '11111111-0000-0000-0000-000000000002';

const get = (path) => request(app).get(path).set('Authorization', `Bearer ${tokenFor('ciso')}`);
const findings = async () => (await query(
  `SELECT finding_type, system_id, why, risks_affected FROM v_soa_findings WHERE control_id = $1 ORDER BY finding_type`, [ctl])).rows;
const types = async () => (await findings()).map(f => f.finding_type);

let ctl, scope;

beforeAll(async () => {
  const c = await query(`INSERT INTO controls (title, control_type, created_by, delivery) VALUES ('FIND hardware integrity', 'preventive', $1, 'system') RETURNING id`, [CISO]);
  ctl = c.rows[0].id;
  await query(`INSERT INTO soa_entries (control_id, applicable, justification) VALUES ($1, TRUE, 'We verify hardware')`, [ctl]);
  await query(`INSERT INTO control_threats (control_id, threat_id, created_by) VALUES ($1, $2, $3)`, [ctl, THREAT, CISO]);
  await query(`INSERT INTO system_controls (system_id, control_id, status, created_by) VALUES ($1, $2, 'operational', $3)`, [HR, ctl, CISO]);
});

afterAll(async () => {
  await query(`DELETE FROM soa_entry_scopes WHERE control_id = $1`, [ctl]);
  if (scope) await query(`DELETE FROM scopes WHERE id = $1`, [scope]);
  await query(`DELETE FROM controls WHERE id = $1`, [ctl]);
});

describe('findings appear and close themselves', () => {
  it('applicable and deployed where it applies: nothing to find', async () => {
    expect(await findings()).toEqual([]);
  });

  it('marked not applicable while deployed and linked to a threat: the mirror, and the threat loop', async () => {
    await query(`UPDATE soa_entries SET applicable = FALSE, justification = 'Not in our estate' WHERE control_id = $1`, [ctl]);
    expect(await findings()).toEqual([
      { finding_type: 'deployed_where_not_applicable', system_id: HR, why: 'not_applicable', risks_affected: 1 },
      // Every active risk carrying the threat — the fixture has two — not only
      // the one where it is deployed: this finding is about the catalogue link.
      { finding_type: 'not_applicable_counters_threat', system_id: null, why: null, risks_affected: 2 },
    ]);
  });

  it('with no reason recorded: that is a finding too', async () => {
    await query(`UPDATE soa_entries SET justification = NULL WHERE control_id = $1`, [ctl]);
    expect(await types()).toContain('not_applicable_without_reason');
  });

  it('applicable again, but narrowed to a scope the system is not in: outside its scope', async () => {
    await query(`UPDATE soa_entries SET applicable = TRUE, justification = 'We verify hardware' WHERE control_id = $1`, [ctl]);
    const s = await query(`INSERT INTO scopes (name) VALUES ('FIND elsewhere') RETURNING id`);
    scope = s.rows[0].id;
    await query(`INSERT INTO soa_entry_scopes (control_id, scope_id) VALUES ($1, $2)`, [ctl, scope]);
    expect(await findings()).toEqual([
      { finding_type: 'deployed_where_not_applicable', system_id: HR, why: 'outside_scope', risks_affected: 1 }]);
  });

  it('closes itself when the scope gains the system', async () => {
    await query(`INSERT INTO scope_systems (scope_id, system_id) VALUES ($1, $2)`, [scope, HR]);
    expect(await findings()).toEqual([]);
    await query(`DELETE FROM scope_systems WHERE scope_id = $1`, [scope]);
  });

  it('a control delivered organisation-wide is not judged by per-system rows', async () => {
    await query(`UPDATE controls SET delivery = 'organisation' WHERE id = $1`, [ctl]);
    expect(await types()).not.toContain('deployed_where_not_applicable');
    await query(`UPDATE controls SET delivery = 'system' WHERE id = $1`, [ctl]);
  });

  it('an exclusion on the system with a reason is not a contradiction', async () => {
    await query(`UPDATE system_controls SET status = 'not_applicable', exclusion_reason = 'Not in scope here'
                  WHERE system_id = $1 AND control_id = $2`, [HR, ctl]);
    expect(await findings()).toEqual([]);
    await query(`UPDATE system_controls SET status = 'operational', exclusion_reason = NULL WHERE system_id = $1 AND control_id = $2`, [HR, ctl]);
  });
});

describe('GET /soa/findings', () => {
  it('returns the findings with their counts, narrowed to one objective', async () => {
    const res = await get(`/api/v1/soa/findings?control_id=${ctl}`);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({
      deployed_where_not_applicable: 1, not_applicable_counters_threat: 0, not_applicable_without_reason: 0 });
    expect(res.body.findings[0]).toMatchObject({ system_name: 'HR System', why: 'outside_scope', title: 'FIND hardware integrity' });
  });

  it('refuses a control_id that is not an id', async () => {
    expect((await get('/api/v1/soa/findings?control_id=nope')).status).toBe(400);
  });

  it('is readable by anyone who can read the SoA, and not by a role that cannot', async () => {
    expect((await request(app).get('/api/v1/soa/findings').set('Authorization', `Bearer ${tokenFor('secretary')}`)).status)
      .toBe(403);
  });
});
