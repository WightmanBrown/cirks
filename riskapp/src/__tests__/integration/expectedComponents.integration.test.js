'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Components a system's own controls are delivered by, which nobody recorded
// there (defect 1d).
//
// `provisionControlComponents` runs at ATTACH time only, so a control that gains
// a component in the catalogue afterwards leaves every system it is already on
// with an incomplete record. `GET /systems/:id` read `FROM system_components`,
// so the omission was invisible on the system page — while the coverage panel
// counted each one as a gap and marked down every risk on that system. On
// CIRKS-test, 373 of 425 operational controls are "needs improvement" ONLY
// because of an absent component, against 21 with a genuinely unhealthy one.
//
// Surfaced, never materialised: writing the rows would invent a status for
// components nobody has looked at, and a non-operational component is a
// mandatory remediation candidate on every risk for the system.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const CONTROL = '55555555-0000-0000-0000-000000000001';
let systemId, recordedId, unrecordedId;

const getSystem = () => request(app).get(`/api/v1/systems/${systemId}`)
  .set('Authorization', `Bearer ${tokenFor('ciso')}`);

const expectedIds = async () => (await getSystem()).body.expected_components.map(c => c.id);

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id, owner_user_id, impact_c, impact_i, impact_a)
     VALUES ('DRIFT system', $1, $2, 3, 3, 3) RETURNING id`, [IT_DEPT, USERS.owner.id]);
  systemId = s.rows[0].id;

  const mk = async (name) => (await query(
    `INSERT INTO control_components (name, component_type, status, created_by)
     VALUES ($1, 'process', 'operational', $2) RETURNING id`, [name, USERS.analyst.id])).rows[0].id;
  recordedId   = await mk('DRIFT component that is recorded');
  unrecordedId = await mk('DRIFT component nobody recorded');

  for (const id of [recordedId, unrecordedId]) {
    await query(`INSERT INTO control_component_links (control_id, component_id, created_by)
                 VALUES ($1,$2,$3)`, [CONTROL, id, USERS.analyst.id]);
  }
  // The control is on the system; only ONE of its two components is recorded —
  // exactly the shape a later catalogue change leaves behind.
  await query(`INSERT INTO system_controls (system_id, control_id, status, provenance, created_by)
               VALUES ($1,$2,'operational','recorded',$3)`, [systemId, CONTROL, USERS.analyst.id]);
  await query(`INSERT INTO system_components (system_id, component_id, status, added_by)
               VALUES ($1,$2,'operational',$3)`, [systemId, recordedId, USERS.analyst.id]);
});

afterAll(async () => {
  await query(`DELETE FROM system_components WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM system_controls WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
  await query(`DELETE FROM control_component_links WHERE component_id = ANY($1)`,
    [[recordedId, unrecordedId]]);
  await query(`DELETE FROM control_components WHERE id = ANY($1)`, [[recordedId, unrecordedId]]);
});

describe('GET /systems/:id reports what its controls expect', () => {
  it('names the component nobody recorded, and which control wants it', async () => {
    const { body } = await getSystem();
    const row = body.expected_components.find(c => c.id === unrecordedId);
    expect(row).toBeDefined();
    expect(row.name).toMatch(/nobody recorded/);
    expect(row.required_by.length).toBeGreaterThan(0);
  });

  it('does not repeat a component that IS recorded', async () => {
    expect(await expectedIds()).not.toContain(recordedId);
  });

  // The whole point of deriving rather than writing: the system's own component
  // list must keep saying only what someone has actually asserted.
  it('does not add it to the system, only reports it', async () => {
    const { body } = await getSystem();
    expect(body.components.map(c => c.id)).not.toContain(unrecordedId);
    const { rows } = await query(
      `SELECT 1 FROM system_components WHERE system_id=$1 AND component_id=$2`,
      [systemId, unrecordedId]);
    expect(rows).toHaveLength(0);
  });

  it('stops reporting it once someone records it', async () => {
    await request(app).post(`/api/v1/systems/${systemId}/components`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`)
      .send({ component_id: unrecordedId }).expect(201);

    expect(await expectedIds()).not.toContain(unrecordedId);
    await query(`DELETE FROM system_components WHERE system_id=$1 AND component_id=$2`,
      [systemId, unrecordedId]);
  });

  // An excluded control is a decision already taken (0118) — it is "neither a
  // gap nor a contributor", so it has no business asking for components.
  it('says nothing about a control that has been excluded from the system', async () => {
    await query(
      `UPDATE system_controls SET status='not_applicable', exclusion_reason='Not appropriate here.',
              excluded_by=$3, excluded_at=now()
        WHERE system_id=$1 AND control_id=$2`, [systemId, CONTROL, USERS.ciso.id]);

    expect(await expectedIds()).not.toContain(unrecordedId);

    await query(
      `UPDATE system_controls SET status='operational', exclusion_reason=NULL,
              excluded_by=NULL, excluded_at=NULL
        WHERE system_id=$1 AND control_id=$2`, [systemId, CONTROL]);
    expect(await expectedIds()).toContain(unrecordedId);
  });
});
