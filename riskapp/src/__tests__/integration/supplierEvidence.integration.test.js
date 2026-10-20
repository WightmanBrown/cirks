'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Supplier assurance evidence and its finding (v144, docs/supplier-model.md
// step 3). Pinned here: an objective is met ONLY by current evidence (decision
// 8); a report must say when it expires; contract terms end with the contract
// unless dated; evidence may only cover objectives the relationship is expected
// to meet; the finding holds for a live relationship with any objective unmet,
// says why, and an action raised from it cannot complete until it no longer
// holds; the contracting department's IAO raises it, the CISO accepts it.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const { _setDepartmentIsolation } = require('../../auth/permissions');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));

const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

let prog, backup, stranger, sys, supplierId, relId, proposedId, otherDept;

const finding = async () => {
  const res = await api('ciso', 'get', '/findings/supplier-assurance');
  expect(res.status).toBe(200);
  return res.body.findings.find((f) => f.relationship_id === relId) || null;
};
const addEvidence = (body, role = 'ciso') => api(role, 'post', `/suppliers/relationships/${relId}/evidence`).send(body);

beforeAll(async () => {
  _setDepartmentIsolation(true);
  const ctl = async (title) => (await query(
    `INSERT INTO controls (title, description) VALUES ($1, 'fixture') RETURNING id`, [title])).rows[0].id;
  prog     = await ctl('SEV Supplier programme');
  backup   = await ctl('SEV Backups at the provider');
  stranger = await ctl('SEV Not expected of suppliers');
  await query(`INSERT INTO supplier_type_objectives (applies_to, control_id) VALUES ('all', $1), ('service_provider', $2)`, [prog, backup]);
  otherDept = (await query(`INSERT INTO departments (name) VALUES ('SEV Other Dept') RETURNING id`)).rows[0].id;
  sys = (await query(
    `INSERT INTO systems (name, department_id, impact_c, impact_i, impact_a) VALUES ('SEV SaaS', $1, 4, 3, 3) RETURNING id`,
    [IT_DEPT])).rows[0].id;
  supplierId = (await api('ciso', 'post', '/suppliers').send({ name: 'SEV Provider' })).body.id;
  relId = (await api('ciso', 'post', `/suppliers/${supplierId}/relationships`).send({
    relationship_type: 'service_provider', system_id: sys, department_id: IT_DEPT, status: 'active',
    contract_start: '2026-01-01', contract_end: future(400) })).body.id;
  proposedId = (await api('ciso', 'post', `/suppliers/${supplierId}/relationships`).send({
    relationship_type: 'service_provider', system_id: sys, department_id: IT_DEPT, status: 'proposed' })).body.id;
});

afterAll(async () => {
  await query(`DELETE FROM exceptions WHERE origin = 'supplier_assurance' AND subject_id = $1`, [relId]);
  await query(`DELETE FROM security_actions WHERE origin = 'supplier_assurance' AND subject_id = $1`, [relId]);
  await query(`DELETE FROM audit_log WHERE entity_label LIKE 'SEV %' OR entity_id IN (SELECT id FROM supplier_relationships WHERE supplier_id = $1)`, [supplierId]);
  await query(`DELETE FROM supplier_relationships WHERE supplier_id = $1`, [supplierId]);
  await query(`DELETE FROM suppliers WHERE id = $1`, [supplierId]);
  await query(`DELETE FROM supplier_type_objectives WHERE control_id IN ($1, $2)`, [prog, backup]);
  await query(`DELETE FROM controls WHERE title LIKE 'SEV %'`);
  await query(`DELETE FROM systems WHERE id = $1`, [sys]);
  await query(`DELETE FROM departments WHERE id = $1`, [otherDept]);
  _setDepartmentIsolation(false);
});

describe('before any evidence', () => {
  test('a live relationship is a finding, with nothing current', async () => {
    const f = await finding();
    expect(f).toMatchObject({ reason: 'no_evidence', expected_count: 2, unmet_count: 2, owner_user_id: USERS.owner.id });
  });

  test('a proposed relationship is not — no contract is in force yet', async () => {
    const res = await api('ciso', 'get', '/findings/supplier-assurance');
    expect(res.body.findings.map((f) => f.relationship_id)).not.toContain(proposedId);
  });
});

describe('recording evidence', () => {
  test('a report must say when it expires', async () => {
    const res = await addEvidence({ kind: 'report', title: 'SEV SOC 2', control_ids: [prog] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must say when it expires/);
  });

  test('evidence can only cover objectives this relationship is expected to meet', async () => {
    const res = await addEvidence({ kind: 'report', title: 'SEV SOC 2', expires_on: future(200), control_ids: [stranger] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected to meet/);
  });

  test('it must cover something', async () => {
    expect((await addEvidence({ kind: 'report', title: 'SEV SOC 2', expires_on: future(200), control_ids: [] })).status).toBe(400);
  });

  test('an IAO records evidence for their own department only', async () => {
    const otherRel = (await api('ciso', 'post', `/suppliers/${supplierId}/relationships`).send({
      relationship_type: 'product', component_id: (await query(
        `INSERT INTO control_components (component_type, name, status, created_by)
         VALUES ('technology', 'SEV agent', 'planned', $1) RETURNING id`, [USERS.admin.id])).rows[0].id,
      department_id: otherDept, status: 'active' })).body.id;
    const res = await api('owner', 'post', `/suppliers/relationships/${otherRel}/evidence`)
      .send({ kind: 'report', title: 'SEV x', expires_on: future(10), control_ids: [prog] });
    expect(res.status).toBe(403);
    await query(`DELETE FROM supplier_relationships WHERE id = $1`, [otherRel]);
    await query(`DELETE FROM control_components WHERE name = 'SEV agent'`);
  });

  test('a current report covering one objective leaves the finding partial', async () => {
    const res = await addEvidence({ kind: 'report', title: 'SEV SOC 2 Type II', reference: 'Audit Co, 2026',
      issued_on: '2026-03-01', expires_on: future(200), control_ids: [prog] }, 'owner');
    expect(res.status).toBe(201);
    const f = await finding();
    expect(f).toMatchObject({ reason: 'partial', unmet_count: 1, unmet_refs: ['SEV Backups at the provider'] });
  });

  test('contract terms with no date of their own count until the contract ends — and close the finding', async () => {
    const res = await addEvidence({ kind: 'contract_terms', title: 'SEV Master agreement, clause 14', control_ids: [backup] });
    expect(res.status).toBe(201);
    expect(await finding()).toBeNull();
    const detail = await api('ciso', 'get', `/suppliers/${supplierId}`);
    const rel = detail.body.relationships.find((r) => r.id === relId);
    const cov = rel.objectives.find((o) => o.control_id === backup);
    expect(cov).toMatchObject({ met: true, covered_until: future(400) });
    expect(rel.evidence).toHaveLength(2);
    expect(rel.assurance_finding).toBeNull();
  });

  test('when the contract ends, its terms stop counting: the finding is back, as expired', async () => {
    await api('ciso', 'patch', `/suppliers/relationships/${relId}`).send({ contract_end: '2026-06-30' });
    const f = await finding();
    expect(f).toMatchObject({ reason: 'expired', unmet_count: 1, expired_count: 1 });
  });
});

describe('answering the finding', () => {
  let actionId;

  test('the IAO of the contracting department raises the action', async () => {
    const res = await api('owner', 'post', `/findings/supplier-assurance/${relId}/actions`).send({});
    expect(res.status).toBe(201);
    actionId = res.body.action_id;
    const { rows } = await query(`SELECT subject_type, origin, primary_owner_user_id, title FROM security_actions WHERE id = $1`, [actionId]);
    expect(rows[0]).toMatchObject({ subject_type: 'supplier_relationship', origin: 'supplier_assurance', primary_owner_user_id: USERS.owner.id });
    expect(rows[0].title).toMatch(/SEV Provider/);
  });

  test('the action names its subject and links to the supplier', async () => {
    const res = await api('ciso', 'get', `/actions/${actionId}`);
    expect(res.body.subject_name || res.body.action?.subject_name).toMatch(/SEV Provider — SEV SaaS/);
    expect(res.body.subject_parent_id || res.body.action?.subject_parent_id).toBe(supplierId);
  });

  test('done means fixed: it cannot complete while the finding holds', async () => {
    expect((await api('ciso', 'post', `/actions/${actionId}/accept`)).status).toBe(200);
    const res = await api('owner', 'post', `/actions/${actionId}/complete`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no current evidence yet covers: SEV Backups at the provider/);
  });

  test('renewed terms fix it, and then it completes', async () => {
    await api('ciso', 'patch', `/suppliers/relationships/${relId}`).send({ contract_end: future(700) });
    expect(await finding()).toBeNull();
    expect((await api('owner', 'post', `/actions/${actionId}/complete`)).status).toBe(200);
  });

  test('acceptance is the CISO\'s, not the IAO\'s', async () => {
    await api('ciso', 'patch', `/suppliers/relationships/${relId}`).send({ contract_end: '2026-06-30' });
    const body = { justification: 'Renewal signed, awaiting countersignature', expires_at: future(30), review_cadence: 'monthly' };
    expect((await api('owner', 'post', `/findings/supplier-assurance/${relId}/exceptions`).send(body)).status).toBe(403);
    expect((await api('ciso', 'post', `/findings/supplier-assurance/${relId}/exceptions`).send(body)).status).toBe(201);
    const f = await finding();
    expect(f.exception_id).toBeTruthy();
  });
});

describe('the supplier list flags gaps', () => {
  test('it counts live relationships with gaps, the objectives not met, and the gaps nobody has answered', async () => {
    const res = await api('ciso', 'get', '/suppliers');
    const row = res.body.suppliers.find((s) => s.id === supplierId);
    // One live relationship (the proposed one does not count), its gap accepted above.
    expect(row).toMatchObject({ live_count: 1, gap_count: 1, unanswered_gaps: 0 });
    expect(row.unmet_objectives).toBeGreaterThan(0);
  });
});

describe('deleting evidence', () => {
  test('is audited, and the coverage it gave goes with it', async () => {
    const detail = await api('ciso', 'get', `/suppliers/${supplierId}`);
    const ev = detail.body.relationships.find((r) => r.id === relId).evidence.find((e) => e.kind === 'report');
    expect((await api('ciso', 'delete', `/suppliers/evidence/${ev.id}`)).status).toBe(204);
    const { rows } = await query(`SELECT action FROM audit_log WHERE entity_type = 'supplier_evidence' AND entity_id = $1 ORDER BY created_at`, [ev.id]);
    expect(rows.map((r) => r.action)).toEqual(['create', 'delete']);
    const f = await finding();
    expect(f.unmet_refs).toEqual(expect.arrayContaining(['SEV Supplier programme']));
  });
});
