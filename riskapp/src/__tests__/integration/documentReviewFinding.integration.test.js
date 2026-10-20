'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The third finding (v140): a Published policy, standard or procedure past its
// review date. It reads `review_overdue` from v_component_state, so the finding and
// the "Under review" shown everywhere else are one fact. Its subject is a document
// — a component with no department — so department-scoped roles do not raise it,
// and the SoD "owner" is the document's own owner.

const { app, request, tokenFor, query, pool, USERS } = require('./helpers');
const { _setDepartmentIsolation } = require('../../auth/permissions');

const daysFromNow = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const ids = {};
let actionId, meetingId;
const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const findings = async () =>
  (await request(app).get('/api/v1/findings/document-review').set(as('ciso'))).body.findings;

beforeAll(async () => {
  _setDepartmentIsolation(true);
  const doc = async (key, kind, status, review) => {
    ids[key] = (await query(
      `INSERT INTO control_components (component_type, name, status, instantiation, document_kind,
                                       document_next_review, document_owner_id, created_by)
       VALUES ('information', $1, $2, 'organisational', $3, $4, $5, $6) RETURNING id`,
      [`REV ${key}`, status, kind, review, USERS.analyst.id, USERS.admin.id])).rows[0].id;
  };
  await doc('overdue policy', 'policy', 'operational', daysFromNow(-20));
  await doc('overdue standard', 'standard', 'operational', daysFromNow(-5));
  await doc('overdue guideline', 'guideline', 'operational', daysFromNow(-20));
  await doc('unpublished', 'policy', 'planned', daysFromNow(-20));
  await doc('in date', 'procedure', 'operational', daysFromNow(90));
});

afterAll(async () => {
  if (meetingId) {
    await query(`DELETE FROM meeting_agenda_items WHERE meeting_id = $1`, [meetingId]);
    await query(`DELETE FROM audit_log WHERE entity_id = $1`, [meetingId]);
    await query(`DELETE FROM working_group_meetings WHERE id = $1`, [meetingId]);
  }
  const all = Object.values(ids);
  await query(`DELETE FROM exceptions WHERE subject_id = ANY($1)`, [all]);
  await query(`DELETE FROM security_actions WHERE subject_id = ANY($1)`, [all]);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [all]);
  await query(`DELETE FROM control_components WHERE id = ANY($1)`, [all]);
  _setDepartmentIsolation(true);
});

describe('what counts', () => {
  test('a Published policy or standard past its review date — not a guideline, not an unpublished one, not one in date', async () => {
    const names = (await findings()).map(f => f.document_name);
    expect(names).toEqual(expect.arrayContaining(['REV overdue policy', 'REV overdue standard']));
    expect(names).not.toEqual(expect.arrayContaining(['REV overdue guideline']));
    expect(names).not.toContain('REV unpublished');
    expect(names).not.toContain('REV in date');
    const f = (await findings()).find(x => x.component_id === ids['overdue policy']);
    expect(f).toMatchObject({ document_kind: 'policy', next_review: daysFromNow(-20), days_overdue: 20 });
  });
});

describe('acting on it', () => {
  test('it is organisation-wide: a department-scoped role does not raise it', async () => {
    const res = await request(app).post(`/api/v1/findings/document-review/${ids['overdue policy']}/actions`)
      .set(as('iam')).send({});
    expect(res.status).toBe(403);
  });

  test('a risk analyst raises it, owned by the document owner by default', async () => {
    const res = await request(app).post(`/api/v1/findings/document-review/${ids['overdue policy']}/actions`)
      .set(as('analyst')).send({});
    expect(res.status).toBe(201);
    actionId = res.body.action_id;
    const { rows: [a] } = await query(
      `SELECT subject_type, origin, primary_owner_user_id, title FROM security_actions WHERE id = $1`, [actionId]);
    expect(a).toEqual({ subject_type: 'component', origin: 'document_review',
                        primary_owner_user_id: USERS.analyst.id, title: 'Review REV overdue policy' });
    expect((await request(app).post(`/api/v1/actions/${actionId}/accept`).set(as('ciso'))).status).toBe(200);
  });

  test('the component page carries the action; the action is readable by a department-scoped role', async () => {
    const d = (await request(app).get(`/api/v1/components/${ids['overdue policy']}`).set(as('ciso'))).body.component;
    expect(d.review_action).toMatchObject({ id: actionId });
    expect((await request(app).get(`/api/v1/actions/${actionId}`).set(as('owner'))).status).toBe(200);
  });

  test('done means reviewed: refused until a new review date is recorded', async () => {
    const refused = await request(app).post(`/api/v1/actions/${actionId}/complete`).set(as('ciso'));
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/still past its review date/);
    await request(app).patch(`/api/v1/components/${ids['overdue policy']}`).set(as('ciso'))
      .send({ document_next_review: daysFromNow(365) });
    expect((await findings()).map(f => f.component_id)).not.toContain(ids['overdue policy']);
    expect((await request(app).post(`/api/v1/actions/${actionId}/complete`).set(as('ciso'))).status).toBe(200);
  });
});

describe('accepting it instead', () => {
  test('the SIRO accepts the overdue standard until a date', async () => {
    const res = await request(app).post(`/api/v1/findings/document-review/${ids['overdue standard']}/exceptions`)
      .set(as('siro')).send({ justification: 'Superseded by the new standard in Q1', expires_at: daysFromNow(60),
                              review_cadence: 'quarterly' });
    expect(res.status).toBe(201);
    expect((await findings()).find(f => f.component_id === ids['overdue standard']).exception_id).toBe(res.body.id);
  });

  test('with the SoD rule on, the document’s own owner cannot accept its lapse', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`UPDATE sod_rules SET enabled = TRUE WHERE key = 'exception.accept'`);
      await expect(c.query(
        `INSERT INTO exceptions (subject_type, subject_id, origin, justification, accepted_by, accepted_role,
                                 expires_at, review_cadence)
         VALUES ('component', $1, 'document_review', 'x', $2, 'risk_analyst', CURRENT_DATE + 30, 'quarterly')`,
        [ids['overdue guideline'], USERS.analyst.id])).rejects.toThrow(/own component/);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});

describe('on the SWG agenda', () => {
  test('one line, with the accepted count', async () => {
    meetingId = (await query(
      `INSERT INTO working_group_meetings (meeting_date, chaired_by, secretary_user_id, planned_at, planned_by)
       VALUES (CURRENT_DATE + 30, $1, $2, now(), $2) RETURNING id`, [USERS.ciso.id, USERS.secretary.id])).rows[0].id;
    expect((await request(app).post(`/api/v1/meetings/${meetingId}/agenda/generate`).set(as('secretary'))).status).toBe(200);
    const { rows } = await query(
      `SELECT title FROM meeting_agenda_items WHERE meeting_id = $1 AND entity_type = 'finding:document_review'`, [meetingId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toMatch(/policies & documents overdue for review — \d+; \d+ with an action raised, 1 accepted/);
  });
});
