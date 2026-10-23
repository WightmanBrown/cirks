'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS as a security solution (owner, 2026-10-23; lib/cirksDelivers.js). CIRKS
// can deliver some control objectives itself. It is OFFERED on those objectives,
// never assumed: an organisation chooses it objective by objective, the first
// choice creating the component and solution as the person choosing, and every
// choice audited with the reason.

const { app, request, tokenFor, query } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));

let suppliers, risk, other;
const created = [];

const cirksRows = async () => ({
  components: (await query(`SELECT id, instantiation, status::text, created_by FROM control_components WHERE lower(name) = 'cirks'`)).rows,
  solutions: (await query(`SELECT id, kind FROM delivery_patterns WHERE lower(name) = 'cirks'`)).rows,
});

beforeAll(async () => {
  const csf = (await query(`SELECT id FROM standards WHERE code = 'nist_csf'`)).rows[0].id;
  const objective = async (title, ref) => {
    const id = (await query(`INSERT INTO controls (title, description) VALUES ($1, 'fixture') RETURNING id`, [title])).rows[0].id;
    let sc = (await query(`SELECT id FROM standard_controls WHERE standard_id = $1 AND ref_code = $2`, [csf, ref])).rows[0];
    if (!sc) {
      sc = (await query(`INSERT INTO standard_controls (standard_id, ref_code, title) VALUES ($1, $2, $3) RETURNING id`, [csf, ref, title])).rows[0];
      created.push(sc.id);
    }
    await query(`INSERT INTO control_mappings (control_id, standard_control_id) VALUES ($1, $2)`, [id, sc.id]);
    return id;
  };
  suppliers = await objective('CSO Suppliers are known and prioritized', 'GV.SC-04');
  risk      = await objective('CSO Inherent risk is understood', 'ID.RA-05');
  other     = await objective('CSO Data at rest is protected', 'PR.DS-01');
});

afterAll(async () => {
  const sol = (await cirksRows()).solutions.map((s) => s.id);
  await query(`DELETE FROM audit_log WHERE entity_label LIKE 'CSO %' OR entity_id = ANY($1::uuid[])`, [sol]);
  await query(`DELETE FROM delivery_patterns WHERE lower(name) = 'cirks'`);
  await query(`DELETE FROM control_components WHERE lower(name) = 'cirks'`);
  await query(`DELETE FROM control_mappings WHERE control_id IN ($1, $2, $3)`, [suppliers, risk, other]);
  await query(`DELETE FROM standard_controls WHERE id = ANY($1::uuid[])`, [created]);
  await query(`DELETE FROM controls WHERE title LIKE 'CSO %'`);
});

describe('CIRKS as a security solution', () => {
  test('an objective CIRKS can deliver says so, with the reason, and nothing is chosen yet', async () => {
    const res = await api('ciso', 'get', `/controls/${suppliers}`);
    expect(res.status).toBe(200);
    expect(res.body.cirks).toMatchObject({ ref: 'GV.SC-04', chosen: false });
    expect(res.body.cirks.reason).toMatch(/supplier register/);
    expect((await api('ciso', 'get', `/controls/${other}`)).body.cirks).toBeNull();
    expect(await cirksRows()).toEqual({ components: [], solutions: [] });
  });

  test('choosing it needs the right to edit control objectives', async () => {
    expect((await api('owner', 'post', `/controls/${suppliers}/patterns/cirks`)).status).toBe(403);
  });

  test('an objective CIRKS does not deliver is refused', async () => {
    const res = await api('ciso', 'post', `/controls/${other}/patterns/cirks`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not deliver/);
  });

  test('the first choice creates CIRKS, once for the organisation, as the person choosing, and audits why', async () => {
    const res = await api('ciso', 'post', `/controls/${suppliers}/patterns/cirks`);
    expect(res.status).toBe(201);
    expect(res.body.patterns.map((p) => p.name)).toEqual(['CIRKS']);
    expect(res.body.patterns[0].parts).toEqual([expect.objectContaining({ component_name: 'CIRKS', location: 'organisation' })]);
    const { components, solutions } = await cirksRows();
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ instantiation: 'organisational', status: 'operational' });
    expect(solutions).toEqual([expect.objectContaining({ kind: 'parts' })]);
    const audit = (await query(
      `SELECT human_narrative FROM audit_log WHERE entity_id = $1 AND entity_type = 'delivery_pattern' ORDER BY created_at`, [suppliers])).rows;
    expect(audit.at(-1).human_narrative).toMatch(/chosen for "CSO Suppliers are known and prioritized" \(GV\.SC-04\): The supplier register/);
    expect((await api('ciso', 'get', `/controls/${suppliers}`)).body.cirks.chosen).toBe(true);
  });

  test('a later choice reuses the same component and solution', async () => {
    expect((await api('ciso', 'post', `/controls/${risk}/patterns/cirks`)).status).toBe(201);
    const { components, solutions } = await cirksRows();
    expect(components).toHaveLength(1);
    expect(solutions).toHaveLength(1);
    const delivers = (await query(`SELECT count(*)::int AS n FROM delivery_pattern_objectives WHERE pattern_id = $1`, [solutions[0].id])).rows[0].n;
    expect(delivers).toBe(2);
  });

  test('choosing it twice for one objective is refused', async () => {
    const res = await api('ciso', 'post', `/controls/${suppliers}/patterns/cirks`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already delivers/);
  });
});
