'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Policies & documents, step 3 (v139): a document has a kind and a lifecycle, and
// its state follows from them. A Published document past its review date reads
// as Under review everywhere — derived, so nobody has to remember — and a
// guideline, being advisory, cannot deliver a control.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

let docId, techId, controlId, sysId;
const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const patch = (id, body, role = 'ciso') => request(app).patch(`/api/v1/components/${id}`).set(as(role)).send(body);
const detail = async (id) => (await request(app).get(`/api/v1/components/${id}`).set(as('ciso'))).body.component;
const daysFromNow = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

beforeAll(async () => {
  docId = (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, document_next_review, created_by)
     VALUES ('information', 'LIFE Acceptable use policy', 'operational', 'organisational', '2028-01-01', $1) RETURNING id`,
    [USERS.admin.id])).rows[0].id;
  techId = (await query(
    `INSERT INTO control_components (component_type, name, status, created_by)
     VALUES ('technology', 'LIFE Agent', 'operational', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
  controlId = (await query(
    `INSERT INTO controls (title, description, delivery) VALUES ('LIFE HR practices', 'fixture', 'system') RETURNING id`)).rows[0].id;
  sysId = (await query(
    `INSERT INTO systems (name, department_id) VALUES ('LIFE Sys', $1) RETURNING id`, [IT_DEPT])).rows[0].id;
  await query(`INSERT INTO control_component_links (control_id, component_id, created_by) VALUES ($1, $2, $3)`,
    [controlId, docId, USERS.admin.id]);
  await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [sysId, controlId]);
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [[docId, techId]]);
  await query(`DELETE FROM system_controls WHERE control_id = $1`, [controlId]);
  await query(`DELETE FROM control_component_links WHERE control_id = $1`, [controlId]);
  await query(`DELETE FROM controls WHERE id = $1`, [controlId]);
  await query(`DELETE FROM systems WHERE id = $1`, [sysId]);
  await query(`DELETE FROM control_components WHERE id = ANY($1)`, [[docId, techId]]);
});

describe('recording the lifecycle', () => {
  test('a document takes a kind, version, owner, approval, review date and link', async () => {
    const res = await patch(docId, {
      document_kind: 'policy', document_version: '2.1', document_owner_id: USERS.ciso.id,
      document_approved_by: USERS.siro.id, document_approved_on: daysFromNow(-30),
      document_next_review: daysFromNow(335), document_url: 'https://dms.example/aup-v2.1.pdf',
    });
    expect(res.status).toBe(200);
    const d = await detail(docId);
    expect(d).toMatchObject({
      document_kind: 'policy', document_version: '2.1', document_owner_name: expect.any(String),
      // exactly the day entered — not shifted by the time zone
      document_approved_on: daysFromNow(-30), document_next_review: daysFromNow(335),
      document_url: 'https://dms.example/aup-v2.1.pdf', effective_status: 'operational', review_overdue: false,
    });
  });

  test('only a document has one, and the values are checked', async () => {
    expect((await patch(techId, { document_kind: 'policy' })).status).toBe(400);
    expect((await patch(docId, { document_kind: 'memo' })).status).toBe(400);
    expect((await patch(docId, { document_next_review: '31/12/2027' })).status).toBe(400);
    expect((await patch(docId, { document_url: 'file:///share/aup.docx' })).status).toBe(400);
  });

  test('the approval and review date are audited with before and after — the GV.PO-02 evidence', async () => {
    const { rows } = await query(
      `SELECT user_id, changes FROM audit_log WHERE entity_id = $1 AND changes ? 'next_review' ORDER BY created_at DESC LIMIT 1`, [docId]);
    expect(rows[0].user_id).toBe(USERS.ciso.id);
    expect(rows[0].changes.next_review).toEqual({ from: '2028-01-01', to: daysFromNow(335) });
    expect(rows[0].changes.approved.to.by).toBe(USERS.siro.id);
  });
});

describe('the state follows the review date', () => {
  test('past its review date, a Published document reads as Under review — everywhere', async () => {
    await patch(docId, { document_next_review: daysFromNow(-1) });
    const d = await detail(docId);
    expect(d).toMatchObject({ status: 'operational', effective_status: 'degraded', review_overdue: true });
    // It is organisation-wide, so every system relying on it shows the lapse.
    const { rows } = await query(
      `SELECT status FROM v_component_presence WHERE component_id = $1 AND system_id = $2`, [docId, sysId]);
    expect(rows[0].status).toBe('degraded');
  });

  test('reviewing it (a new date) restores it — nothing to reset by hand', async () => {
    await patch(docId, { document_next_review: daysFromNow(365) });
    expect((await detail(docId)).effective_status).toBe('operational');
  });

  test('a document that is not Published is not "overdue" — it is simply not in force', async () => {
    await query(`UPDATE control_components SET status = 'planned', document_next_review = $2 WHERE id = $1`,
      [docId, daysFromNow(-10)]);
    expect(await detail(docId)).toMatchObject({ effective_status: 'planned', review_overdue: false });
    await query(`UPDATE control_components SET status = 'operational', document_next_review = $2 WHERE id = $1`,
      [docId, daysFromNow(365)]);
  });
});

describe('a guideline delivers no control', () => {
  test('a document that delivers a control cannot be reclassified as a guideline', async () => {
    const res = await patch(docId, { document_kind: 'guideline' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot be a guideline/);
  });

  test('a guideline cannot be linked to a control', async () => {
    await query(`DELETE FROM control_component_links WHERE component_id = $1`, [docId]);
    expect((await patch(docId, { document_kind: 'guideline' })).status).toBe(200);
    const res = await request(app).post(`/api/v1/controls/${controlId}/components`).set(as('ciso'))
      .send({ existing_component_id: docId });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/guideline is advisory/);
  });
});
