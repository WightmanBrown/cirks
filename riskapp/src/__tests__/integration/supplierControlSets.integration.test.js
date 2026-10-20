'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The control objectives each kind of supplier relationship is expected to meet
// (v143, docs/supplier-model.md step 2). Pinned here: the sets are DATA edited
// by controls.write; a relationship's set is DERIVED (every-supplier + its
// type's), so editing a set reaches existing relationships; an objective in both
// is listed once with both sources; the seed resolves through the NIST mapping
// and skips what the install does not have; set edits are audited.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));

let programme, saasOnly, stdControl, nistId, sys, supplierId, relId;

beforeAll(async () => {
  const ctl = async (title) => (await query(
    `INSERT INTO controls (title, description) VALUES ($1, 'fixture') RETURNING id`, [title])).rows[0].id;
  programme = await ctl('STO Supplier programme established');
  saasOnly  = await ctl('STO Backups of provider-held data');
  // A NIST requirement mapped to the programme objective, for the seed test.
  nistId = (await query(`SELECT id FROM standards WHERE code = 'nist_csf'`)).rows[0].id;
  stdControl = (await query(
    `INSERT INTO standard_controls (standard_id, ref_code, title) VALUES ($1, 'GV.SC-01', 'STO programme') RETURNING id`,
    [nistId])).rows[0].id;
  await query(`INSERT INTO control_mappings (control_id, standard_control_id) VALUES ($1, $2)`, [programme, stdControl]);

  sys = (await query(
    `INSERT INTO systems (name, department_id, impact_c, impact_i, impact_a) VALUES ('STO SaaS', $1, 3, 3, 3) RETURNING id`,
    [IT_DEPT])).rows[0].id;
  supplierId = (await api('ciso', 'post', '/suppliers').send({ name: 'STO Provider' })).body.id;
  relId = (await api('ciso', 'post', `/suppliers/${supplierId}/relationships`).send({
    relationship_type: 'service_provider', system_id: sys, department_id: IT_DEPT, status: 'active' })).body.id;
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_label LIKE 'STO %'`);
  await query(`DELETE FROM supplier_type_objectives WHERE control_id IN (SELECT id FROM controls WHERE title LIKE 'STO %')`);
  await query(`DELETE FROM supplier_relationships WHERE supplier_id = $1`, [supplierId]);
  await query(`DELETE FROM suppliers WHERE id = $1`, [supplierId]);
  await query(`DELETE FROM control_mappings WHERE standard_control_id = $1`, [stdControl]);
  await query(`DELETE FROM standard_controls WHERE id = $1`, [stdControl]);
  await query(`DELETE FROM controls WHERE title LIKE 'STO %'`);
  await query(`DELETE FROM systems WHERE id = $1`, [sys]);
});

describe('seeding the starting sets', () => {
  test('resolves through the NIST mapping, and skips what the install lacks', async () => {
    const { rows } = await query(`SELECT seed_supplier_type_objectives() AS n`);
    expect(rows[0].n).toBe(1); // only GV.SC-01 exists here, and only in 'all'
    const set = await query(`SELECT applies_to FROM supplier_type_objectives WHERE control_id = $1`, [programme]);
    expect(set.rows.map((r) => r.applies_to)).toEqual(['all']);
    // Idempotent.
    expect((await query(`SELECT seed_supplier_type_objectives() AS n`)).rows[0].n).toBe(0);
  });
});

describe('editing a set', () => {
  test('controls.write adds an objective; others cannot', async () => {
    expect((await api('owner', 'post', '/suppliers/objectives')
      .send({ applies_to: 'service_provider', control_id: saasOnly })).status).toBe(403);
    expect((await api('siro', 'post', '/suppliers/objectives')
      .send({ applies_to: 'service_provider', control_id: saasOnly })).status).toBe(403);
    const ok = await api('analyst', 'post', '/suppliers/objectives')
      .send({ applies_to: 'service_provider', control_id: saasOnly });
    expect(ok.status).toBe(201);
    const again = await api('analyst', 'post', '/suppliers/objectives')
      .send({ applies_to: 'service_provider', control_id: saasOnly });
    expect(again.status).toBe(409);
  });

  test('refuses an unknown set or objective', async () => {
    expect((await api('ciso', 'post', '/suppliers/objectives').send({ applies_to: 'friends', control_id: saasOnly })).status).toBe(400);
    expect((await api('ciso', 'post', '/suppliers/objectives')
      .send({ applies_to: 'product', control_id: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);
  });

  test('every role that reads suppliers can read the sets', async () => {
    const res = await api('secretary', 'get', '/suppliers/objectives');
    expect(res.status).toBe(200);
    expect(res.body.sets.all.map((o) => o.control_id)).toContain(programme);
    expect(res.body.sets.service_provider.map((o) => o.control_id)).toContain(saasOnly);
    expect(Object.keys(res.body.sets)).toEqual(['all', 'onshore', 'contracted_service', 'service_provider', 'product']);
  });

  test('edits are audited', async () => {
    const { rows } = await query(
      `SELECT action, user_id FROM audit_log WHERE entity_type = 'supplier_type_objectives' AND entity_id = $1`, [saasOnly]);
    expect(rows).toEqual([{ action: 'create', user_id: USERS.analyst.id }]);
  });
});

describe("a relationship's set is derived", () => {
  const objectivesOf = async () => {
    const res = await api('ciso', 'get', `/suppliers/${supplierId}`);
    return res.body.relationships.find((r) => r.id === relId).objectives;
  };

  test('every-supplier plus its own type, including objectives added after it was recorded', async () => {
    const ids = (await objectivesOf()).map((o) => o.control_id);
    expect(ids).toEqual(expect.arrayContaining([programme, saasOnly]));
  });

  test('an objective in both sets is listed once, naming both', async () => {
    await api('ciso', 'post', '/suppliers/objectives').send({ applies_to: 'service_provider', control_id: programme });
    const rows = (await objectivesOf()).filter((o) => o.control_id === programme);
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toEqual(['service_provider', 'all']);
  });

  test('removing an objective from a set removes it from the relationship', async () => {
    expect((await api('ciso', 'delete', `/suppliers/objectives/service_provider/${saasOnly}`)).status).toBe(204);
    expect((await objectivesOf()).map((o) => o.control_id)).not.toContain(saasOnly);
    expect((await api('ciso', 'delete', `/suppliers/objectives/service_provider/${saasOnly}`)).status).toBe(404);
  });

  test('another type does not inherit it', async () => {
    const other = await api('ciso', 'post', '/suppliers/objectives').send({ applies_to: 'product', control_id: saasOnly });
    expect(other.status).toBe(201);
    expect((await objectivesOf()).map((o) => o.control_id)).not.toContain(saasOnly);
  });
});
