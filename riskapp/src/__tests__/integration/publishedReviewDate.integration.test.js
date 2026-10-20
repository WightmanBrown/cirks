'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A published document must have a review date (v141, owner's ruling
// 2026-09-29) — without one nothing ever flags it. Enforced by a CHECK added NOT
// VALID: every insert and update from now on must satisfy it, while documents an
// install already published without a date are left alone and surfaced by the
// overdue-for-review finding as `no_review_date`.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const RULE = 'chk_published_document_has_review_date';
let docId, legacyId, createdId;
const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const patch = (body) => request(app).patch(`/api/v1/components/${docId}`).set(as('ciso')).send(body);

beforeAll(async () => {
  docId = (await query(
    `INSERT INTO control_components (component_type, name, status, document_kind, created_by)
     VALUES ('information', 'DATE Draft policy', 'planned', 'policy', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;

  // A document published before the rule existed: exactly what the migration
  // leaves on an install that already had one.
  await query(`ALTER TABLE control_components DROP CONSTRAINT ${RULE}`);
  try {
    legacyId = (await query(
      `INSERT INTO control_components (component_type, name, status, document_kind, created_by)
       VALUES ('information', 'DATE Legacy policy', 'operational', 'policy', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
  } finally {
    await query(`ALTER TABLE control_components ADD CONSTRAINT ${RULE}
                 CHECK (component_type <> 'information' OR status <> 'operational'
                        OR document_next_review IS NOT NULL) NOT VALID`);
  }
});

afterAll(async () => {
  const all = [docId, legacyId, createdId].filter(Boolean);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [all]);
  await query(`DELETE FROM control_components WHERE id = ANY($1)`, [all]);
});

describe('publishing needs a review date', () => {
  test('publishing without one is refused, in plain words', async () => {
    const res = await patch({ status: 'operational' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must have a review date/);
  });

  test('publishing with one, in the same save, is accepted', async () => {
    const res = await patch({ status: 'operational', document_next_review: '2028-01-01' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'operational', document_next_review: '2028-01-01' });
  });

  test('a published document cannot have its date removed', async () => {
    expect((await patch({ document_next_review: null })).status).toBe(400);
  });

  test('an unpublished document needs no date', async () => {
    expect((await patch({ status: 'planned', document_next_review: null })).status).toBe(200);
  });

  test('a document cannot be created already published without one', async () => {
    const bad = await request(app).post('/api/v1/components').set(as('ciso'))
      .send({ component_type: 'information', name: 'DATE Born published', status: 'operational' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/v1/components').set(as('ciso'))
      .send({ component_type: 'information', name: 'DATE Born draft', status: 'planned' });
    expect(ok.status).toBe(201);
    createdId = ok.body.id || ok.body.component?.id;
  });
});

describe('creating a document with its lifecycle', () => {
  test('a new document can be created Published, with its dates, in one step', async () => {
    const res = await request(app).post('/api/v1/components').set(as('ciso')).send({
      component_type: 'information', name: 'DATE Born published with dates', status: 'operational',
      document_kind: 'policy', document_version: '1.0', document_approved_on: '2026-09-01',
      document_next_review: '2027-09-01', document_url: 'https://dms.example/new-policy.pdf',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'operational', document_kind: 'policy', document_version: '1.0',
      document_approved_on: '2026-09-01', document_next_review: '2027-09-01' });
    await query(`DELETE FROM control_components WHERE id = $1`, [res.body.id]);
  });

  test('only a document takes them, and they are checked', async () => {
    expect((await request(app).post('/api/v1/components').set(as('ciso'))
      .send({ component_type: 'technology', name: 'DATE Tool', document_next_review: '2027-01-01' })).status).toBe(400);
    expect((await request(app).post('/api/v1/components').set(as('ciso'))
      .send({ component_type: 'information', name: 'DATE Bad', document_kind: 'memo' })).status).toBe(400);
  });
});

describe('a document published before the rule', () => {
  test('is left in place, and surfaced by the finding as never scheduled', async () => {
    const res = await request(app).get('/api/v1/findings/document-review').set(as('ciso'));
    const f = res.body.findings.find(x => x.component_id === legacyId);
    expect(f).toMatchObject({ reason: 'no_review_date', next_review: null });
  });

  test('touching it at all means giving it a date', async () => {
    const renamed = await request(app).patch(`/api/v1/components/${legacyId}`).set(as('ciso'))
      .send({ name: 'DATE Legacy policy (renamed)' });
    expect(renamed.status).toBe(400);
    const dated = await request(app).patch(`/api/v1/components/${legacyId}`).set(as('ciso'))
      .send({ document_next_review: '2028-01-01' });
    expect(dated.status).toBe(200);
    const res = await request(app).get('/api/v1/findings/document-review').set(as('ciso'));
    expect(res.body.findings.map(x => x.component_id)).not.toContain(legacyId);
  });
});
