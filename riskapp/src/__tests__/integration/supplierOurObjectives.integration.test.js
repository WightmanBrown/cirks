'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// v160 — a supplier objective that is OURS (delivered once for the organisation)
// is met by our own control, as the Statement of Applicability states it, never by
// the supplier's evidence, and does not count towards the supplier's finding
// (owner, 2026-10-23; docs/supplier-model.md decisions 9 and 10).

const { app, request, tokenFor, query, IT_DEPT } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

let register, backups, sys, supplierId, relId, solutionId;

const soa = (controlId, applicable, status) => query(
  `INSERT INTO soa_entries (control_id, applicable, implementation_status) VALUES ($1, $2, $3)
   ON CONFLICT (control_id) DO UPDATE SET applicable = EXCLUDED.applicable,
     implementation_status = EXCLUDED.implementation_status`, [controlId, applicable, status]);
const objective = async (controlId) => {
  const res = await api('ciso', 'get', `/suppliers/${supplierId}`);
  expect(res.status).toBe(200);
  return res.body.relationships.find((r) => r.id === relId).objectives.find((o) => o.control_id === controlId);
};
const finding = async () => {
  const res = await api('ciso', 'get', '/findings/supplier-assurance');
  expect(res.status).toBe(200);
  return res.body.findings.find((f) => f.relationship_id === relId) || null;
};

beforeAll(async () => {
  const ctl = async (title, delivery) => (await query(
    `INSERT INTO controls (title, description, delivery) VALUES ($1, 'fixture', $2) RETURNING id`, [title, delivery])).rows[0].id;
  register = await ctl('SOO Suppliers are known and prioritised', 'organisation');
  backups  = await ctl('SOO Backups at the provider', null);
  await soa(register, true, 'partial');
  await query(`INSERT INTO supplier_type_objectives (applies_to, control_id) VALUES ('all', $1), ('service_provider', $2)`, [register, backups]);
  sys = (await query(
    `INSERT INTO systems (name, department_id, impact_c, impact_i, impact_a) VALUES ('SOO SaaS', $1, 3, 3, 3) RETURNING id`,
    [IT_DEPT])).rows[0].id;
  supplierId = (await api('ciso', 'post', '/suppliers').send({ name: 'SOO Provider' })).body.id;
  relId = (await api('ciso', 'post', `/suppliers/${supplierId}/relationships`).send({
    relationship_type: 'service_provider', system_id: sys, department_id: IT_DEPT, status: 'active',
    contract_start: '2026-01-01', contract_end: future(400) })).body.id;
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_label LIKE 'SOO %' OR entity_id IN (SELECT id FROM supplier_relationships WHERE supplier_id = $1)`, [supplierId]);
  await query(`DELETE FROM supplier_relationships WHERE supplier_id = $1`, [supplierId]);
  await query(`DELETE FROM suppliers WHERE id = $1`, [supplierId]);
  await query(`DELETE FROM supplier_type_objectives WHERE control_id IN ($1, $2)`, [register, backups]);
  if (solutionId) await query(`DELETE FROM delivery_patterns WHERE id = $1`, [solutionId]);
  await query(`DELETE FROM soa_entries WHERE control_id IN ($1, $2)`, [register, backups]);
  await query(`DELETE FROM controls WHERE title LIKE 'SOO %'`);
  await query(`DELETE FROM systems WHERE id = $1`, [sys]);
});

describe('supplier objectives that are ours (v160)', () => {
  test('an organisation-wide objective is ours, and reads how the SoA states it', async () => {
    const o = await objective(register);
    expect(o).toMatchObject({ ours: true, met: false, our_status: 'partial', our_solutions: [] });
    expect(await objective(backups)).toMatchObject({ ours: false, met: false, our_status: null, our_solutions: null });
  });

  test("the finding counts only the supplier's objectives", async () => {
    const f = await finding();
    expect(f).toMatchObject({ expected_count: 1, unmet_count: 1, met_count: 0, reason: 'no_evidence' });
    expect(f.unmet_refs).toEqual(['SOO Backups at the provider']);
  });

  test("a supplier's evidence cannot cover an objective that is ours", async () => {
    const res = await api('ciso', 'post', `/suppliers/relationships/${relId}/evidence`).send({
      kind: 'report', title: 'SOO SOC 2', expires_on: future(200), control_ids: [register] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ours/);
  });

  test("covering the supplier's objectives closes the finding, though ours is only partial", async () => {
    const res = await api('ciso', 'post', `/suppliers/relationships/${relId}/evidence`).send({
      kind: 'report', title: 'SOO SOC 2', expires_on: future(200), control_ids: [backups] });
    expect(res.status).toBe(201);
    expect(await finding()).toBeNull();
    expect((await objective(register)).met).toBe(false);
  });

  test('ours is met when the SoA says implemented, and names the solution that delivers it', async () => {
    await soa(register, true, 'implemented');
    solutionId = (await query(`INSERT INTO delivery_patterns (name, kind) VALUES ('SOO Supplier register', 'parts') RETURNING id`)).rows[0].id;
    await query(`INSERT INTO delivery_pattern_objectives (pattern_id, control_id) VALUES ($1, $2)`, [solutionId, register]);
    expect(await objective(register)).toMatchObject({ ours: true, met: true, our_status: 'implemented', our_solutions: ['SOO Supplier register'] });
  });

  test('ours ruled not applicable in the SoA is not met, and still not counted', async () => {
    await soa(register, false, 'implemented');
    expect(await objective(register)).toMatchObject({ ours: true, met: false, our_status: 'not_applicable' });
    expect(await finding()).toBeNull();
  });

  test('an objective with no stated delivery mode stays the supplier\'s (NULL is not organisation-wide)', async () => {
    expect((await objective(backups)).ours).toBe(false);
  });
});
