'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The second finding (v138): a system missing components its own controls need.
// Only components STATED per-system count (§5, v137) — a shared one is present
// wherever it is implied, and an unclassified one may be a single shared policy,
// so it is reported as unclassified, never as a gap.
//
// Fixture: one per-system control on two systems, delivered by three components
// — PER (per_system), ORG (organisational) and UNS (not stated) — none recorded.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

let sysA, sysB, controlId, per, org, uns, actionId, meetingId;
const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const findings = async () =>
  (await request(app).get('/api/v1/findings/component-record').set(as('ciso'))).body.findings;
const complete = () => request(app).post(`/api/v1/actions/${actionId}/complete`).set(as('ciso'));

beforeAll(async () => {
  const sys = async (name) => (await query(
    `INSERT INTO systems (name, department_id, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
    [name, IT_DEPT, USERS.owner.id])).rows[0].id;
  sysA = await sys('REC Sys A');
  sysB = await sys('REC Sys B');
  controlId = (await query(
    `INSERT INTO controls (title, description, delivery) VALUES ('REC Control', 'fixture', 'system') RETURNING id`)).rows[0].id;
  const comp = async (name, type, inst) => {
    const id = (await query(
      `INSERT INTO control_components (component_type, name, status, instantiation, document_next_review, created_by)
       VALUES ($1::component_type, $2, 'operational', $3, CASE WHEN $1::text = 'information' THEN DATE '2028-01-01' END, $4) RETURNING id`,
      [type, name, inst, USERS.admin.id])).rows[0].id;
    await query(`INSERT INTO control_component_links (control_id, component_id, created_by) VALUES ($1, $2, $3)`,
      [controlId, id, USERS.admin.id]);
    return id;
  };
  per = await comp('REC agent', 'technology', 'per_system');
  org = await comp('REC policy', 'information', 'organisational');
  uns = await comp('REC unclassified', 'process', null);
  for (const s of [sysA, sysB]) {
    await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [s, controlId]);
  }
});

afterAll(async () => {
  if (meetingId) {
    await query(`DELETE FROM meeting_agenda_items WHERE meeting_id = $1`, [meetingId]);
    await query(`DELETE FROM audit_log WHERE entity_id = $1`, [meetingId]);
    await query(`DELETE FROM working_group_meetings WHERE id = $1`, [meetingId]);
  }
  await query(`DELETE FROM exceptions WHERE subject_id = ANY($1)`, [[sysA, sysB]]);
  await query(`DELETE FROM security_actions WHERE subject_id = ANY($1)`, [[sysA, sysB]]);
  await query(`DELETE FROM system_components WHERE system_id = ANY($1)`, [[sysA, sysB]]);
  await query(`DELETE FROM system_controls WHERE control_id = $1`, [controlId]);
  await query(`DELETE FROM control_component_links WHERE control_id = $1`, [controlId]);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [[per, org, uns]]);
  await query(`DELETE FROM control_components WHERE id = ANY($1)`, [[per, org, uns]]);
  await query(`DELETE FROM controls WHERE id = $1`, [controlId]);
  await query(`DELETE FROM systems WHERE id = ANY($1)`, [[sysA, sysB]]);
});

describe('what counts as missing', () => {
  test('only the per-system component — not the shared one, not the unclassified one', async () => {
    const f = (await findings()).find(x => x.system_id === sysA);
    expect(f).toMatchObject({ missing_count: 1, missing_component_names: ['REC agent'], needed_count: 1 });
  });

  test('the system page carries the same finding', async () => {
    const res = await request(app).get(`/api/v1/systems/${sysA}`).set(as('ciso'));
    expect(res.body.component_finding).toMatchObject({
      missing_count: 1, missing_component_names: ['REC agent'], action: null, exception: null });
  });

  test('classifying a component as per-system makes it count', async () => {
    await query(`UPDATE control_components SET instantiation = 'per_system' WHERE id = $1`, [uns]);
    const f = (await findings()).find(x => x.system_id === sysA);
    expect(f.missing_component_names).toEqual(['REC agent', 'REC unclassified']);
    await query(`UPDATE control_components SET instantiation = NULL WHERE id = $1`, [uns]);
  });
});

describe('acting on it — done means fixed', () => {
  test('the system’s IAM raises an action, owned by the system owner by default', async () => {
    const res = await request(app).post(`/api/v1/findings/component-record/${sysA}/actions`).set(as('iam')).send({});
    expect(res.status).toBe(201);
    actionId = res.body.action_id;
    const { rows: [a] } = await query(
      `SELECT subject_type, origin, primary_owner_user_id, title, description FROM security_actions WHERE id = $1`, [actionId]);
    expect(a).toMatchObject({ subject_type: 'system', origin: 'component_record', primary_owner_user_id: USERS.owner.id,
                              title: 'Complete the component record of REC Sys A' });
    expect(a.description).toContain('REC agent');
    expect((await request(app).post(`/api/v1/actions/${actionId}/accept`).set(as('ciso'))).status).toBe(200);
  });

  test('it cannot be completed while the component is still unrecorded', async () => {
    const res = await complete();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no record of: REC agent/);
  });

  test('recording the component closes the finding, and the action completes', async () => {
    await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'degraded')`, [sysA, per]);
    expect((await findings()).map(x => x.system_id)).not.toContain(sysA);
    expect((await complete()).status).toBe(200);
  });
});

describe('accepting it instead', () => {
  test('the SIRO accepts it on another system; it cannot then be acted on', async () => {
    const res = await request(app).post(`/api/v1/findings/component-record/${sysB}/exceptions`).set(as('siro'))
      .send({ justification: 'Agent rollout in Q1', expires_at: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10),
              review_cadence: 'quarterly' });
    expect(res.status).toBe(201);
    expect((await request(app).post(`/api/v1/findings/component-record/${sysB}/actions`).set(as('ciso')).send({})).status)
      .toBe(409);
    expect((await findings()).find(x => x.system_id === sysB).exception_id).toBe(res.body.id);
  });
});

describe('on the SWG agenda', () => {
  test('one line, counting accepted systems and naming the unclassified components', async () => {
    meetingId = (await query(
      `INSERT INTO working_group_meetings (meeting_date, chaired_by, secretary_user_id, planned_at, planned_by)
       VALUES (CURRENT_DATE + 30, $1, $2, now(), $2) RETURNING id`, [USERS.ciso.id, USERS.secretary.id])).rows[0].id;
    expect((await request(app).post(`/api/v1/meetings/${meetingId}/agenda/generate`).set(as('secretary'))).status).toBe(200);
    const { rows } = await query(
      `SELECT title FROM meeting_agenda_items WHERE meeting_id = $1 AND entity_type = 'finding:component_record'`, [meetingId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toMatch(/system component records incomplete/);
    expect(rows[0].title).toMatch(/1 accepted/);
    expect(rows[0].title).toMatch(/not yet classified shared or per-system, so not counted/);
  });
});
