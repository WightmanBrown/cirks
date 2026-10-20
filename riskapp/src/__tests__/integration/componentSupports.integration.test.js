'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Policies & documents (2026-09-29): a document belongs to the control
// objectives it supports, not to a system, so the component list returns the
// objectives each component helps deliver. The AUP on CIRKS-test supports
// GV.RR-02 and GV.RR-04 and is on no system at all.

const { app, request, tokenFor, query, USERS } = require('./helpers');

let docId, linkedId, unlinkedId;

beforeAll(async () => {
  docId = (await query(
    `INSERT INTO control_components (component_type, name, status, document_next_review, created_by)
     VALUES ('information', 'SUPPORTS Acceptable use policy', 'operational', '2028-01-01', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
  linkedId = (await query(
    `INSERT INTO controls (title, description) VALUES ('SUPPORTS HR practices', 'fixture') RETURNING id`)).rows[0].id;
  unlinkedId = (await query(
    `INSERT INTO control_components (component_type, name, status, created_by)
     VALUES ('information', 'SUPPORTS Orphan standard', 'planned', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
  await query(`INSERT INTO control_component_links (control_id, component_id, created_by) VALUES ($1, $2, $3)`,
    [linkedId, docId, USERS.admin.id]);
});

afterAll(async () => {
  await query(`DELETE FROM control_component_links WHERE control_id = $1`, [linkedId]);
  await query(`DELETE FROM controls WHERE id = $1`, [linkedId]);
  await query(`DELETE FROM control_components WHERE id = ANY($1)`, [[docId, unlinkedId]]);
});

test('each policy or document lists the control objectives it supports', async () => {
  const res = await request(app).get('/api/v1/components?type=information&all=1')
    .set('Authorization', `Bearer ${tokenFor('ciso')}`);
  expect(res.status).toBe(200);
  const doc = res.body.components.find(c => c.id === docId);
  expect(doc.controls).toEqual([{ id: linkedId, title: 'SUPPORTS HR practices', ref: null }]);
  expect(doc.systems).toEqual([]);
  expect(res.body.components.find(c => c.id === unlinkedId).controls).toEqual([]);
});
