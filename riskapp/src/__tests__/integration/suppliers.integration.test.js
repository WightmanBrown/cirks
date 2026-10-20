'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Suppliers and their relationships (v142, docs/supplier-model.md step 1).
// Pinned here: each type attaches to the right kind of thing (in the database,
// so every path is held to it); ownership is the contracting department with the
// person derived; criticality is derived from the systems touched; an IAM/IAO
// records relationships for their own department only and sees the ones that
// concern it; ending a relationship is status, and moving it is audited.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const { _setDepartmentIsolation } = require('../../auth/permissions');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));

let otherDept, itSys, otherSys, people, process_, tech, info;
const suppliers = [];

beforeAll(async () => {
  _setDepartmentIsolation(true);
  otherDept = (await query(`INSERT INTO departments (name) VALUES ('SUP Other Dept') RETURNING id`)).rows[0].id;
  itSys = (await query(
    `INSERT INTO systems (name, department_id, impact_c, impact_i, impact_a) VALUES ('SUP IT SaaS', $1, 4, 2, 3) RETURNING id`,
    [IT_DEPT])).rows[0].id;
  otherSys = (await query(
    `INSERT INTO systems (name, department_id, impact_c, impact_i, impact_a) VALUES ('SUP Other Sys', $1, 2, 5, 1) RETURNING id`,
    [otherDept])).rows[0].id;
  const comp = async (type, name) => (await query(
    `INSERT INTO control_components (component_type, name, status, created_by)
     VALUES ($1::component_type, $2, 'planned', $3) RETURNING id`,
    [type, name, USERS.admin.id])).rows[0].id;
  people   = await comp('people', 'SUP Acme contractors');
  process_ = await comp('process', 'SUP NOC change process');
  tech     = await comp('technology', 'SUP Falcon agent');
  info     = await comp('information', 'SUP Some policy');
  // The agent is on both systems, so a product relationship touches both.
  await query(`INSERT INTO system_components (system_id, component_id) VALUES ($1, $3), ($2, $3)`, [itSys, otherSys, tech]);
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_type IN ('supplier', 'supplier_relationships')
                  AND (entity_label LIKE 'SUP %' OR entity_id IN (SELECT id FROM supplier_relationships))`);
  await query(`DELETE FROM supplier_relationships WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'SUP %')`);
  await query(`DELETE FROM suppliers WHERE name LIKE 'SUP %'`);
  await query(`DELETE FROM system_components WHERE component_id = $1`, [tech]);
  await query(`DELETE FROM control_components WHERE name LIKE 'SUP %'`);
  await query(`DELETE FROM systems WHERE name LIKE 'SUP %'`);
  await query(`DELETE FROM departments WHERE id = $1`, [otherDept]);
  _setDepartmentIsolation(false);
});

async function makeSupplier(name, role = 'ciso') {
  const res = await api(role, 'post', '/suppliers').send({ name });
  expect(res.status).toBe(201);
  suppliers.push(res.body.id);
  return res.body.id;
}

describe('the supplier catalogue', () => {
  test('one row per organisation, whatever the capitalisation', async () => {
    await makeSupplier('SUP Microsoft');
    const dup = await api('analyst', 'post', '/suppliers').send({ name: '  sup microsoft ' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already exists/);
  });

  test('an IAO can add a supplier — it is a shared catalogue entry', async () => {
    await makeSupplier('SUP Acme Staffing', 'owner');
  });

  test('roles without suppliers.write cannot', async () => {
    expect((await api('secretary', 'post', '/suppliers').send({ name: 'SUP Nope' })).status).toBe(403);
    expect((await api('soc', 'post', '/suppliers').send({ name: 'SUP Nope' })).status).toBe(403);
  });
});

describe('what each type attaches to', () => {
  let sid;
  beforeAll(async () => { sid = await makeSupplier('SUP Attach Co'); });
  const post = (body) => api('ciso', 'post', `/suppliers/${sid}/relationships`)
    .send({ department_id: IT_DEPT, status: 'active', ...body });

  test.each([
    ['onshore', { component_id: 'people' }, 201],
    ['onshore', { component_id: 'tech' }, 400],
    ['onshore', { system_id: 'itSys', component_id: 'people' }, 400],
    ['contracted_service', { system_id: 'itSys' }, 201],
    ['contracted_service', { system_id: 'itSys', component_id: 'process_' }, 201],
    ['contracted_service', { system_id: 'itSys', component_id: 'info' }, 400],
    ['contracted_service', { component_id: 'people' }, 400],
    ['service_provider', { system_id: 'itSys' }, 201],
    ['service_provider', { component_id: 'tech' }, 400],
    ['product', { component_id: 'tech' }, 201],
    ['product', { component_id: 'people' }, 400],
  ])('%s with %j → %i', async (type, refs, status) => {
    const ids = { people, tech, info, process_, itSys };
    const body = { relationship_type: type };
    for (const [k, v] of Object.entries(refs)) body[k] = ids[v];
    const res = await post(body);
    expect(res.status).toBe(status);
    if (status === 400) expect(res.body.error).toMatch(/recorded against|component|system/);
  });

  test('the contract cannot end before it starts', async () => {
    const res = await post({ relationship_type: 'service_provider', system_id: itSys,
      contract_start: '2027-01-01', contract_end: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot end before it starts/);
  });

  test('status is required — never guessed', async () => {
    const res = await api('ciso', 'post', `/suppliers/${sid}/relationships`)
      .send({ relationship_type: 'service_provider', system_id: itSys, department_id: IT_DEPT });
    expect(res.status).toBe(400);
  });
});

describe('derived owner and criticality', () => {
  test('owner is the contracting department\'s IAO; criticality the highest impact touched', async () => {
    const sid = await makeSupplier('SUP Derived Co');
    const saas = await api('ciso', 'post', `/suppliers/${sid}/relationships`).send({
      relationship_type: 'service_provider', system_id: itSys, department_id: IT_DEPT, status: 'active',
      contract_start: '2026-06-01', contract_end: '2028-05-31' });
    expect(saas.status).toBe(201);
    expect(saas.body).toMatchObject({ systems_touched: 1, max_impact: 4, department_id: IT_DEPT,
      contract_start: '2026-06-01', contract_end: '2028-05-31' });
    expect(saas.body.owner_user_ids).toContain(USERS.owner.id);
    expect(saas.body.owner_is_siro_fallback).toBe(false);

    // A product touches every system carrying its component — here both.
    const product = await api('ciso', 'post', `/suppliers/${sid}/relationships`).send({
      relationship_type: 'product', component_id: tech, department_id: otherDept, status: 'active' });
    expect(product.body).toMatchObject({ systems_touched: 2, max_impact: 5 });
    // A department with no IAO falls back to the SIRO.
    expect(product.body.owner_is_siro_fallback).toBe(true);
    expect(product.body.owner_user_ids).toContain(USERS.siro.id);

    // The detail names where the figure comes from: the system(s) at the maximum.
    const detail = await api('ciso', 'get', `/suppliers/${sid}`);
    const p = detail.body.relationships.find((r) => r.id === product.body.id);
    expect(p.criticality_systems).toEqual([expect.objectContaining({ name: 'SUP Other Sys', impact: 5, impact_i: 5 })]);
    const saasRel = detail.body.relationships.find((r) => r.id === saas.body.id);
    expect(saasRel.criticality_systems.map((x) => x.name)).toEqual(['SUP IT SaaS']);
  });
});

describe('department scoping', () => {
  let sid, itRel, otherRel, otherOnItSys;
  beforeAll(async () => {
    sid = await makeSupplier('SUP Scoped Co');
    const mk = async (body) => (await api('ciso', 'post', `/suppliers/${sid}/relationships`)
      .send({ status: 'active', ...body })).body.id;
    itRel        = await mk({ relationship_type: 'onshore', component_id: people, department_id: IT_DEPT });
    otherRel     = await mk({ relationship_type: 'service_provider', system_id: otherSys, department_id: otherDept });
    // Contracted by the other department, but hosting an IT system: IT must see it.
    otherOnItSys = await mk({ relationship_type: 'contracted_service', system_id: itSys, department_id: otherDept });
  });

  test('an IAO sees their department\'s relationships and those touching its systems', async () => {
    const res = await api('owner', 'get', `/suppliers/${sid}`);
    const ids = res.body.relationships.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([itRel, otherOnItSys]));
    expect(ids).not.toContain(otherRel);
    const all = await api('ciso', 'get', `/suppliers/${sid}`);
    expect(all.body.relationships.map((r) => r.id)).toContain(otherRel);
  });

  test('an IAO records relationships for their own department only', async () => {
    const other = await api('owner', 'post', `/suppliers/${sid}/relationships`).send({
      relationship_type: 'service_provider', system_id: otherSys, department_id: otherDept, status: 'proposed' });
    expect(other.status).toBe(403);
    const own = await api('iam', 'post', `/suppliers/${sid}/relationships`).send({
      relationship_type: 'service_provider', system_id: itSys, status: 'proposed' });
    expect(own.status).toBe(201);
    expect(own.body.department_id).toBe(IT_DEPT);
  });

  test('…and edits only those', async () => {
    expect((await api('owner', 'patch', `/suppliers/relationships/${otherOnItSys}`).send({ status: 'ended' })).status).toBe(403);
    expect((await api('owner', 'patch', `/suppliers/relationships/${itRel}`).send({ department_id: otherDept })).status).toBe(403);
    expect((await api('owner', 'patch', `/suppliers/relationships/${itRel}`).send({ status: 'exiting' })).status).toBe(200);
  });

  test('the system page lists every relationship touching the system', async () => {
    const res = await api('ciso', 'get', `/suppliers/relationships?system_id=${itSys}`);
    const ids = res.body.relationships.map((r) => r.id);
    expect(ids).toContain(otherOnItSys);
    expect(ids).not.toContain(otherRel);
  });

  test('the component page lists relationships recorded against the component', async () => {
    const res = await api('ciso', 'get', `/suppliers/relationships?component_id=${people}`);
    expect(res.body.relationships.map((r) => r.id)).toContain(itRel);
  });
});

describe('ending, moving and deleting', () => {
  test('moving a relationship between departments is audited, with the actor', async () => {
    const sid = await makeSupplier('SUP Moved Co');
    const rel = (await api('ciso', 'post', `/suppliers/${sid}/relationships`).send({
      relationship_type: 'service_provider', system_id: itSys, department_id: IT_DEPT, status: 'active' })).body.id;
    expect((await api('ciso', 'patch', `/suppliers/relationships/${rel}`).send({ department_id: otherDept, status: 'ended' })).status).toBe(200);
    const { rows } = await query(
      `SELECT user_id, changes FROM audit_log WHERE entity_id = $1 AND action = 'update'`, [rel]);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USERS.ciso.id);
    expect(rows[0].changes).toMatchObject({ department_id: { from: IT_DEPT, to: otherDept }, status: { from: 'active', to: 'ended' } });
  });

  test('a supplier with relationships cannot be deleted; one without can', async () => {
    const withRel = await makeSupplier('SUP Kept Co');
    await api('ciso', 'post', `/suppliers/${withRel}/relationships`).send({
      relationship_type: 'product', component_id: tech, department_id: IT_DEPT, status: 'active' });
    expect((await api('ciso', 'delete', `/suppliers/${withRel}`)).status).toBe(409);
    const bare = await makeSupplier('SUP Typo Co');
    expect((await api('ciso', 'delete', `/suppliers/${bare}`)).status).toBe(204);
  });

  test('the list summarises types, departments and criticality', async () => {
    const res = await api('ciso', 'get', '/suppliers');
    const row = res.body.suppliers.find((s) => s.name === 'SUP Derived Co');
    expect(row).toMatchObject({ relationship_count: 2, active_count: 2, max_impact: 5 });
    expect(row.types.sort()).toEqual(['product', 'service_provider']);
  });
});
