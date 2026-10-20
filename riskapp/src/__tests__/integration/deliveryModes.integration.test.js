'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// How a control is delivered (v127): organisation-wide, for a group, or on each
// system — exactly one per control, NOT STATED until someone chooses.
// v_control_reach derives the systems each mode reaches. It changes no risk score
// yet; that is measured and brought to the owner first.

const { app, request, tokenFor, query } = require('./helpers');

const auth  = () => `Bearer ${tokenFor('ciso')}`;
const get   = (path)       => request(app).get(path).set('Authorization', auth());
const patch = (path, body) => request(app).patch(path).set('Authorization', auth()).send(body);
const post  = (path, body) => request(app).post(path).set('Authorization', auth()).send(body);

let obj, sysA, sysB, sysC, group;
const reach = async () => (await get(`/api/v1/controls/${obj}`)).body;

beforeAll(async () => {
  const s = await query(`SELECT id FROM systems WHERE is_active ORDER BY name LIMIT 2`);
  [sysA, sysB] = s.rows.map(r => r.id);
  const c3 = await query(`INSERT INTO systems (name, department_id) VALUES ('DELIVERY third system', '22222222-0000-0000-0000-000000000001') RETURNING id`);
  sysC = c3.rows[0].id;
  const o = await query(`INSERT INTO controls (title, control_type, created_by) VALUES ('DELIVERY training objective', 'preventive', '11111111-0000-0000-0000-000000000002') RETURNING id`);
  obj = o.rows[0].id;
  await query(`INSERT INTO soa_entries (control_id, applicable) VALUES ($1, TRUE)`, [obj]);
  // Deployed by hand on one system — the old way of modelling training.
  await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [sysA, obj]);
  // A people group present on two systems.
  const g = await query(`INSERT INTO control_components (name, component_type, created_by) VALUES ('DELIVERY Developers', 'people', '11111111-0000-0000-0000-000000000002') RETURNING id`);
  group = g.rows[0].id;
  await query(`INSERT INTO system_components (system_id, component_id) VALUES ($1, $3), ($2, $3)`, [sysB, sysC, group]);
});

afterAll(async () => {
  await query(`DELETE FROM controls WHERE id = $1`, [obj]);
  await query(`DELETE FROM control_components WHERE id = $1`, [group]);
  await query(`DELETE FROM systems WHERE id = $1`, [sysC]);
});

describe('each mode reaches its own systems', () => {
  it('not stated: it reaches where it is deployed, as today, and says so', async () => {
    const body = await reach();
    expect(body.control.delivery).toBeNull();
    expect(body.readout.reach_systems).toBe(1);
  });

  it('on each system: the same, stated', async () => {
    expect((await patch(`/api/v1/controls/${obj}`, { delivery: 'system' })).status).toBe(200);
    expect((await reach()).readout.reach_systems).toBe(1);
  });

  it('organisation-wide: every active system where it applies, with no deployment rows needed', async () => {
    await patch(`/api/v1/controls/${obj}`, { delivery: 'organisation' });
    const { rows } = await query(`SELECT count(*)::int AS n FROM systems WHERE is_active`);
    const body = await reach();
    expect(body.readout.reach_systems).toBe(rows[0].n);
    expect(body.readout.deployed_outside).toBe(0);     // a per-system idea only
  });

  it('for a group with no group linked yet: reaches nothing', async () => {
    await patch(`/api/v1/controls/${obj}`, { delivery: 'group' });
    const body = await reach();
    expect(body.readout).toMatchObject({ reach_systems: 0, groups: [] });
  });

  it('for a group: the systems where its people group is present', async () => {
    await query(`INSERT INTO control_component_links (control_id, component_id, created_by)
                 VALUES ($1, $2, '11111111-0000-0000-0000-000000000002')`, [obj, group]);
    const body = await reach();
    expect(body.readout.reach_systems).toBe(2);
    expect(body.readout.groups).toEqual([{ id: group, name: 'DELIVERY Developers', systems: 2 }]);
    const { rows } = await query(`SELECT system_id FROM v_control_reach WHERE control_id = $1 ORDER BY system_id`, [obj]);
    expect(rows.map(r => r.system_id).sort()).toEqual([sysB, sysC].sort());
  });

  it('an unadopted objective reaches nothing organisation-wide or by group', async () => {
    await query(`UPDATE soa_entries SET applicable = FALSE WHERE control_id = $1`, [obj]);
    expect((await reach()).readout.reach_systems).toBe(0);
    await query(`UPDATE soa_entries SET applicable = TRUE WHERE control_id = $1`, [obj]);
  });
});

describe('setting the mode', () => {
  it('refuses a mode that is not one of the three', async () => {
    expect((await patch(`/api/v1/controls/${obj}`, { delivery: 'both' })).status).toBe(400);
  });

  it('can return to not stated', async () => {
    await patch(`/api/v1/controls/${obj}`, { delivery: null });
    expect((await reach()).control.delivery).toBeNull();
  });

  it('is audited with the old and new mode', async () => {
    await patch(`/api/v1/controls/${obj}`, { delivery: 'organisation' });
    const { rows } = await query(
      `SELECT old_value, new_value FROM audit_log WHERE entity_type = 'control_objective' AND entity_id = $1
          AND field_name = 'delivery' ORDER BY created_at DESC LIMIT 1`, [obj]);
    expect(rows[0]).toEqual({ old_value: null, new_value: 'organisation' });
  });

  it('can be set for several at once, reporting what changed', async () => {
    const res = await post('/api/v1/controls/delivery', { control_ids: [obj], delivery: 'organisation' });
    expect(res.body).toEqual({ updated: 0, unchanged: 1 });
    const res2 = await post('/api/v1/controls/delivery', { control_ids: [obj], delivery: 'system' });
    expect(res2.body).toEqual({ updated: 1, unchanged: 0 });
  });

  it('the database refuses an unknown mode even from direct SQL', async () => {
    await expect(query(`UPDATE controls SET delivery = 'everywhere' WHERE id = $1`, [obj]))
      .rejects.toThrow(/chk_controls_delivery/);
  });
});
