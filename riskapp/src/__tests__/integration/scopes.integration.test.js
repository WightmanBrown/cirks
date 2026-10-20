'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Scopes (v126): WHERE a control objective applies.
//   • a scope is a named set of systems; the whole organisation is the default
//     (every active system), not a row;
//   • drawing a scope needs scopes.manage (admin, ciso, siro);
//   • an adopted objective can be narrowed to scopes — its expected systems are
//     then the union of theirs, and a deployment elsewhere is "outside".

const { app, request, tokenFor, query } = require('./helpers');

const as = (role) => `Bearer ${tokenFor(role)}`;
const call = (method, path, body, role = 'ciso') =>
  request(app)[method](path).set('Authorization', as(role)).send(body);

let scopeId, objId, sysA, sysB, sysOutside;

beforeAll(async () => {
  const sys = await query(`SELECT id FROM systems WHERE is_active ORDER BY name LIMIT 2`);
  [sysA, sysB] = sys.rows.map(r => r.id);
  // The fixture has two systems; a third, kept OUT of the scope, shows "outside".
  const out = await query(
    `INSERT INTO systems (name, department_id) VALUES ('SCOPE outside system', '22222222-0000-0000-0000-000000000001') RETURNING id`);
  sysOutside = out.rows[0].id;
  const o = await query(`INSERT INTO controls (title, control_type) VALUES ('SCOPE tokenise card numbers', 'preventive') RETURNING id`);
  objId = o.rows[0].id;
  // Deployed on one in-scope system and one outside the scope-to-be.
  await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $3, 'operational'), ($2, $3, 'operational')`,
    [sysA, sysOutside, objId]);
});

afterAll(async () => {
  await query(`DELETE FROM soa_entry_scopes WHERE control_id = $1`, [objId]);
  await query(`DELETE FROM scopes WHERE name ILIKE 'SCOPE %'`);
  await query(`DELETE FROM controls WHERE id = $1`, [objId]);
  await query(`DELETE FROM systems WHERE id = $1`, [sysOutside]);
});

describe('drawing a scope', () => {
  it('is refused without scopes.manage — reading is not', async () => {
    expect((await call('post', '/api/v1/scopes', { name: 'SCOPE nope' }, 'analyst')).status).toBe(403);
    expect((await call('get', '/api/v1/scopes', undefined, 'analyst')).status).toBe(200);
  });

  it('the CISO creates one; its name is unique ignoring case', async () => {
    const res = await call('post', '/api/v1/scopes', { name: 'SCOPE Cardholder data environment' });
    expect(res.status).toBe(201);
    scopeId = res.body.scope.id;
    expect((await call('post', '/api/v1/scopes', { name: 'scope cardholder data environment ' })).status).toBe(409);
  });

  it('systems are added and removed, and each change is audited', async () => {
    const add = await call('post', `/api/v1/scopes/${scopeId}/systems`, { system_ids: [sysA, sysB] });
    expect(add.body).toEqual({ added: 2 });
    const del = await call('delete', `/api/v1/scopes/${scopeId}/systems/${sysB}`);
    expect(del.status).toBe(200);
    await call('post', `/api/v1/scopes/${scopeId}/systems`, { system_ids: [sysB] });
    const { rows } = await query(`SELECT count(*)::int AS n FROM audit_log WHERE entity_type = 'scope' AND entity_id = $1`, [scopeId]);
    expect(rows[0].n).toBeGreaterThanOrEqual(5);   // create, 2 adds, remove, re-add
    const got = await call('get', `/api/v1/scopes/${scopeId}`);
    expect(got.body.systems.map(s => s.id).sort()).toEqual([sysA, sysB].sort());
  });

  it('the list reports the organisation baseline alongside the scopes', async () => {
    const res = await call('get', '/api/v1/scopes');
    const { rows } = await query(`SELECT count(*)::int AS n FROM systems WHERE is_active`);
    expect(res.body.organisation_system_count).toBe(rows[0].n);
    expect(res.body.scopes.find(s => s.id === scopeId)).toMatchObject({ system_count: 2, objective_count: 0 });
  });
});

describe('an objective applies organisation-wide unless narrowed', () => {
  const readout = async () => (await call('get', `/api/v1/controls/${objId}`)).body;

  it('adopted with no scopes: expected on every active system', async () => {
    await call('patch', `/api/v1/soa/${objId}`, { applicable: true });
    const { rows } = await query(`SELECT count(*)::int AS n FROM systems WHERE is_active`);
    const body = await readout();
    expect(body.soa.scopes).toEqual([]);
    expect(body.readout).toMatchObject({ expected_systems: rows[0].n, deployed_expected: 2, deployed_outside: 0 });
  });

  it('narrowed to a scope: expected on its systems, and a deployment elsewhere is outside', async () => {
    const res = await call('patch', `/api/v1/soa/${objId}`, { scope_ids: [scopeId] });
    expect(res.status).toBe(200);
    const body = await readout();
    expect(body.soa.scopes.map(s => s.id)).toEqual([scopeId]);
    expect(body.readout).toMatchObject({ expected_systems: 2, deployed_expected: 1, deployed_outside: 1 });
  });

  it('the register carries the scopes on the row', async () => {
    const res = await call('get', '/api/v1/soa');
    const row = res.body.groups.flatMap(g => g.controls).find(c => c.control_id === objId);
    expect(row.scopes).toEqual([{ id: scopeId, name: 'SCOPE Cardholder data environment' }]);
  });

  it('a scope objectives apply in cannot be deleted from under them', async () => {
    const res = await call('delete', `/api/v1/scopes/${scopeId}`);
    expect(res.status).toBe(409);
    expect(res.body.objectives).toContain('SCOPE tokenise card numbers');
  });

  it('marking it not applicable clears its scopes', async () => {
    await call('patch', `/api/v1/soa/${objId}`, { applicable: false, justification: 'No card data' });
    const { rows } = await query(`SELECT count(*)::int AS n FROM soa_entry_scopes WHERE control_id = $1`, [objId]);
    expect(rows[0].n).toBe(0);
    expect((await readout()).readout).toMatchObject({ expected_systems: 0, deployed_outside: 0 });
  });

  it('the bulk decision can adopt into a scope', async () => {
    const res = await call('post', '/api/v1/soa/decisions', { control_ids: [objId], applicable: true, scope_ids: [scopeId] });
    expect(res.status).toBe(200);
    expect((await readout()).soa.scopes.map(s => s.id)).toEqual([scopeId]);
  });

  it('refuses an unknown scope', async () => {
    const res = await call('patch', `/api/v1/soa/${objId}`, { scope_ids: ['00000000-0000-0000-0000-00000000beef'] });
    expect(res.status).toBe(400);
  });

  it('back to the whole organisation with an empty list; then the scope can go', async () => {
    await call('patch', `/api/v1/soa/${objId}`, { scope_ids: [] });
    expect((await readout()).soa.scopes).toEqual([]);
    expect((await call('delete', `/api/v1/scopes/${scopeId}`)).status).toBe(200);
  });
});
