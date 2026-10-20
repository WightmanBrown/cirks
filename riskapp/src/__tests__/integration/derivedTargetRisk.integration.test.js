'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// v154 (owner, 2026-10-07): "you can't actually fix [controls], you can only fix
// their components". A security action is made of component items, and Target
// risk is DERIVED: the judged residual of the objectives those items will bring
// into place. Nobody types a target.
//
// Fixture: system S; threat T; objective O (per system) counters T and is
// delivered by solution P, whose one part AGENT lives on the system. Risk R is
// T on S. P is chosen for O on S. AGENT is not recorded on S, so O reads missing
// there (v152).

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const ids = {};
const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));
const row = async () => {
  const res = await api('ciso', 'get', '/operations/risk-heatmap/current');
  return (res.body.risks ?? res.body).find((r) => (r.risk_id ?? r.id) === ids.R);
};
const current = async () => {
  const { rows: [r] } = await query(`SELECT probability_c, probability_i, probability_a FROM risks WHERE id = $1`, [ids.R]);
  return `${r.probability_c}/${r.probability_i}/${r.probability_a}`;
};

beforeAll(async () => {
  ids.S = (await query(`INSERT INTO systems (name, department_id, owner_user_id) VALUES ('DTR system', $1, $2) RETURNING id`,
    [IT_DEPT, USERS.owner.id])).rows[0].id;
  ids.S2 = (await query(`INSERT INTO systems (name, department_id, owner_user_id) VALUES ('DTR security system', $1, $2) RETURNING id`,
    [IT_DEPT, USERS.owner.id])).rows[0].id;
  ids.T = (await query(
    `INSERT INTO threats (name, threat_category, probability_c, probability_i, probability_a)
     VALUES ('DTR threat', 'deliberate', 4, 4, 4) RETURNING id`)).rows[0].id;
  ids.O = (await query(
    `INSERT INTO controls (title, description, delivery, reference_code) VALUES ('DTR-O', 'fixture', 'system', 'DTR-O') RETURNING id`)).rows[0].id;
  const comp = async (name, inst) => (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, created_by)
     VALUES ('technology', $1, 'operational', $2, $3) RETURNING id`, [name, inst, USERS.admin.id])).rows[0].id;
  ids.AGENT = await comp('DTR agent', 'per_system');
  ids.CONSOLE = await comp('DTR console', 'per_system');
  ids.P = (await query(`INSERT INTO delivery_patterns (name, kind) VALUES ('DTR solution', 'parts') RETURNING id`)).rows[0].id;
  await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [ids.P, ids.O]);
  await query(`INSERT INTO delivery_pattern_parts (pattern_id, component_id, location) VALUES ($1, $2, 'on_system')`, [ids.P, ids.AGENT]);
  await query(`INSERT INTO control_threats (control_id, threat_id) VALUES ($1, $2)`, [ids.O, ids.T]);
  await query(`INSERT INTO system_threats (system_id, threat_id) VALUES ($1, $2)`, [ids.S, ids.T]);
  await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'missing')`, [ids.S, ids.O]);
  // The solution is this system's: someone chose it for the objective (a security
  // pattern trigger would do the same). Without that nothing says which parts it needs.
  await query(`INSERT INTO system_solution_choices (system_id, control_id, pattern_id, chosen_by) VALUES ($1, $2, $3, $4)`,
    [ids.S, ids.O, ids.P, USERS.ciso.id]);
  ids.R = (await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a, risk_score, rationale, validation_status)
     VALUES ($1, $2, 4, 4, 4, 1, 'DTR risk', 'validated') RETURNING id`, [ids.S, ids.T])).rows[0].id;
});

afterAll(async () => {
  const systems = [ids.S, ids.S2];
  await query(`DELETE FROM risk_control_probability WHERE risk_id = $1`, [ids.R]);
  await query(`DELETE FROM security_action_notes WHERE action_id IN (SELECT action_id FROM security_action_risks WHERE risk_id = $1)`, [ids.R]);
  const { rows } = await query(`SELECT action_id FROM security_action_risks WHERE risk_id = $1`, [ids.R]);
  const actions = rows.map((r) => r.action_id);
  await query(`DELETE FROM security_action_items WHERE action_id = ANY($1)`, [actions]);
  await query(`DELETE FROM security_action_risks WHERE action_id = ANY($1)`, [actions]);
  await query(`DELETE FROM security_actions WHERE id = ANY($1)`, [actions]);
  await query(`DELETE FROM risk_residual_history WHERE risk_id = $1`, [ids.R]);
  await query(`DELETE FROM risks WHERE id = $1`, [ids.R]);
  await query(`DELETE FROM system_solution_choices WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_controls WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_components WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_threats WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [systems]);
  await query(`DELETE FROM control_threats WHERE control_id = $1`, [ids.O]);
  await query(`DELETE FROM delivery_patterns WHERE id = $1`, [ids.P]);
  await query(`DELETE FROM controls WHERE id = $1`, [ids.O]);
  await query(`DELETE FROM threats WHERE id = $1`, [ids.T]);
  await query(`DELETE FROM control_components WHERE id = ANY($1)`, [[ids.AGENT, ids.CONSOLE]]);
  await query(`DELETE FROM systems WHERE id = ANY($1)`, [systems]);
});

describe('what can be planned', () => {
  test('the missing part is offered, not the control objective', async () => {
    const res = await api('ciso', 'get', `/risks/${ids.R}/action-items/candidates`);
    expect(res.status).toBe(200);
    expect(res.body.controls).toEqual([]);
    const part = res.body.components.find((c) => c.component_id === ids.AGENT);
    // not recorded on the system at all — it used to hide behind a control item
    expect(part).toMatchObject({ change_kind: 'component_add', mandatory: true, system_status: null });
    expect(part.via_controls).toEqual(['DTR-O']);
  });

  test('a control item is refused', async () => {
    const res = await api('ciso', 'post', `/risks/${ids.R}/actions/from-gap`)
      .send({ items: [{ element_type: 'control', control_id: ids.O, target_p_c: 1, target_p_i: 1, target_p_a: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('control_items_retired');
  });

  test('no open item: no target, and nothing to explain', async () => {
    expect(await row()).toMatchObject({ tgt_p_c: null, tgt_objectives: 0 });
  });
});

describe('Target risk is derived from the components being fixed', () => {
  test('work planned whose effect nobody has judged: no number, but the register can say why', async () => {
    const res = await api('ciso', 'post', `/risks/${ids.R}/actions/from-gap`)
      .send({ title: 'DTR action', items: [{ element_type: 'component', component_id: ids.AGENT }] });
    expect(res.status).toBe(201);
    ids.action = res.body.id;
    expect(await row()).toMatchObject({ tgt_p_c: null, tgt_objectives: 1, tgt_objectives_judged: 0 });
  });

  test('once the objective is judged on the risk page, that judgement IS the target', async () => {
    const res = await api('ciso', 'put', `/risks/${ids.R}/controls/${ids.O}/probability`)
      .send({ probability_c: 2, probability_i: 2, probability_a: 3 });
    expect(res.status).toBeLessThan(300);
    // the objective is not in place, so the judgement does not count yet …
    expect(await current()).toBe('4/4/4');
    // … but it is what the open item will achieve
    expect(await row()).toMatchObject({ tgt_p_c: 2, tgt_p_i: 2, tgt_p_a: 3, tgt_objectives: 1, tgt_objectives_judged: 1 });
  });

  test('a solution also held back by a part that lives elsewhere is not counted: the item alone will not complete it', async () => {
    await query(`INSERT INTO delivery_pattern_parts (pattern_id, component_id, location, service_system_id) VALUES ($1, $2, 'service', $3)`,
      [ids.P, ids.CONSOLE, ids.S2]);
    expect(await row()).toMatchObject({ tgt_p_c: null, tgt_objectives: 0 });
    // record the console as working on its security system, and it counts again
    await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'operational')`, [ids.S2, ids.CONSOLE]);
    expect(await row()).toMatchObject({ tgt_p_c: 2, tgt_objectives: 1 });
  });

  test('completing the item brings the objective into place, and the current risk moves to where the target was', async () => {
    expect((await api('ciso', 'post', `/risks/${ids.R}/actions/${ids.action}/accept`)).status).toBe(200);
    const { rows: [item] } = await query(`SELECT id FROM security_action_items WHERE action_id = $1`, [ids.action]);
    expect((await api('ciso', 'post', `/risks/${ids.R}/action-items/${item.id}/complete`).send({})).status).toBe(200);
    // the part is recorded as working, the solution is complete, the status follows (v152)
    const { rows: [sc] } = await query(`SELECT status FROM system_controls WHERE system_id = $1 AND control_id = $2`, [ids.S, ids.O]);
    expect(sc.status).toBe('operational');
    expect(await current()).toBe('2/2/3');
    // nothing is open any more, so there is no target left to show
    expect(await row()).toMatchObject({ tgt_p_c: null, tgt_objectives: 0 });
  });
});
