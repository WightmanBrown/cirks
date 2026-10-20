'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Delivery patterns (v145, docs/control-delivery-patterns.md). Pinned here:
//   * an objective WITHOUT patterns keeps the v138 rule (every per-system part,
//     on every system) — nothing changes until a pattern is written;
//   * WITH patterns, a system is delivered by the best pattern IN PLAY, and the
//     component-record finding asks only for that pattern's missing on-system
//     parts — so a system using agent A is never asked for agent B;
//   * a part on a named security service takes its state from that service, so
//     degrading the SOC once degrades every system relying on it;
//   * "provided by the supplier" is met by the supplier's current evidence;
//   * report only: the hand-set status is untouched, and a disagreement is named;
//   * (v147) a solution is shared: one solution delivers several objectives, its
//     parts are written once, and it leaves the library only when it delivers
//     nothing.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));

const ids = {};
const delivery = async (system) => (await query(
  `SELECT * FROM v_system_control_delivery WHERE system_id = $1 AND control_id = $2`, [ids[system], ids.obj])).rows[0];
const finding = async (system) => (await query(
  `SELECT missing_component_names FROM v_system_component_findings WHERE system_id = $1`, [ids[system]])).rows[0]?.missing_component_names || [];

beforeAll(async () => {
  const q1 = async (sql, p) => (await query(sql, p)).rows[0].id;
  ids.obj = await q1(`INSERT INTO controls (title, description, delivery) VALUES ('DPT Endpoint monitoring', 'fixture', 'system') RETURNING id`);
  ids.obj2 = await q1(`INSERT INTO controls (title, description, delivery) VALUES ('DPT Endpoint logging', 'fixture', 'system') RETURNING id`);
  // The library holds one "provided by the supplier" solution; start from none.
  ids.priorSupplier = (await query(`SELECT id FROM delivery_patterns WHERE kind = 'supplier'`)).rows[0]?.id || null;
  const comp = (name, type, inst, status = 'operational') => q1(
    `INSERT INTO control_components (name, component_type, instantiation, status, created_by) VALUES ($1, $2::component_type, $3, $4::component_status, $5) RETURNING id`,
    [name, type, inst, status, USERS.admin.id]);
  ids.agentA  = await comp('DPT Agent A', 'technology', 'per_system');
  ids.agentB  = await comp('DPT Agent B', 'technology', 'per_system');
  ids.console = await comp('DPT Console A', 'technology', 'organisational');
  ids.soc     = await comp('DPT SOC', 'people', 'organisational');
  // The library list, as today: a flat menu of both agents.
  await query(`INSERT INTO control_component_links (control_id, component_id, created_by) VALUES ($1, $2, $4), ($1, $3, $4)`, [ids.obj, ids.agentA, ids.agentB, USERS.admin.id]);

  const sys = (name) => q1(`INSERT INTO systems (name, department_id, impact_c, impact_i, impact_a) VALUES ($1, $2, 3, 3, 3) RETURNING id`, [name, IT_DEPT]);
  for (const s of ['s1', 's2', 's3', 'saas', 'svc']) ids[s] = await sys(`DPT ${s}`);
  const rec = (s, c, status = 'operational') => query(
    `INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, $3::system_element_status)`, [ids[s], ids[c], status]);
  await rec('s1', 'agentA'); await rec('s2', 'agentB');
  await rec('svc', 'console'); await rec('svc', 'soc');
  for (const [s, st] of [['s1', 'operational'], ['s2', 'degraded'], ['s3', 'operational'], ['saas', 'unknown']]) {
    await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, $3::system_element_status)`, [ids[s], ids.obj, st]);
  }
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [[ids.obj, ids.obj2]]);
  // Solutions outlive objectives (shared since v147): remove the fixture's own.
  await query(`DELETE FROM delivery_patterns WHERE name LIKE 'DPT %' OR (kind = 'supplier' AND id IS DISTINCT FROM $1)`, [ids.priorSupplier]);
  await query(`DELETE FROM supplier_relationships WHERE supplier_id IN (SELECT id FROM suppliers WHERE name = 'DPT Provider')`);
  await query(`DELETE FROM suppliers WHERE name = 'DPT Provider'`);
  await query(`DELETE FROM supplier_type_objectives WHERE control_id = $1`, [ids.obj]);
  await query(`DELETE FROM controls WHERE id = ANY($1)`, [[ids.obj, ids.obj2]]);
  await query(`DELETE FROM system_components WHERE system_id IN (SELECT id FROM systems WHERE name LIKE 'DPT %')`);
  await query(`DELETE FROM systems WHERE name LIKE 'DPT %'`);
  await query(`DELETE FROM control_components WHERE name LIKE 'DPT %'`);
});

describe('before any pattern is written', () => {
  test('the old rule stands: every per-system part is asked of every system', async () => {
    expect(await finding('s1')).toEqual(['DPT Agent B']);
    expect(await finding('s3')).toEqual(['DPT Agent A', 'DPT Agent B']);
    expect(await delivery('s1')).toMatchObject({ delivery: null, disagreement: null });
  });
});

describe('writing patterns', () => {
  let pa, pb;
  test('controls.write writes them; others cannot', async () => {
    expect((await api('owner', 'post', `/controls/${ids.obj}/patterns`).send({ name: 'DPT Agent A stack' })).status).toBe(403);
    const a = await api('analyst', 'post', `/controls/${ids.obj}/patterns`).send({ name: 'DPT Agent A stack' });
    expect(a.status).toBe(201);
    pa = a.body.id;
    const b = await api('ciso', 'post', `/controls/${ids.obj}/patterns`).send({ name: 'DPT Agent B stack' });
    pb = b.body.id;
    expect((await api('ciso', 'post', `/controls/${ids.obj}/patterns`).send({ name: ' dpt agent a STACK ' })).status).toBe(409);
  });

  test('parts say where they must be', async () => {
    const add = (p, body) => api('ciso', 'post', `/controls/${ids.obj}/patterns/${p}/parts`).send(body);
    expect((await add(pa, { component_id: ids.agentA, location: 'on_system' })).status).toBe(201);
    expect((await add(pa, { component_id: ids.console, location: 'service', service_system_id: ids.svc })).status).toBe(201);
    expect((await add(pa, { component_id: ids.soc, location: 'service', service_system_id: ids.svc })).status).toBe(201);
    expect((await add(pb, { component_id: ids.agentB, location: 'on_system' })).status).toBe(201);
    expect((await add(pa, { component_id: ids.agentA, location: 'on_system' })).status).toBe(409);
    expect((await add(pa, { component_id: ids.soc, location: 'service' })).status).toBe(400);   // which service?
    // Where a part can be follows from the component's scope (v137):
    const perSystemElsewhere = await add(pb, { component_id: ids.agentB, location: 'organisation' });
    expect(perSystemElsewhere.status).toBe(400);
    expect(perSystemElsewhere.body.error).toMatch(/once per system, so in a security solution it is on the system itself/);
    expect((await add(pb, { component_id: ids.soc, location: 'on_system' })).body.error).toMatch(/once for the organisation/);
    const unstated = (await query(`INSERT INTO control_components (name, component_type, status, created_by)
                                    VALUES ('DPT Unstated', 'technology', 'operational', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
    expect((await add(pb, { component_id: unstated, location: 'on_system' })).body.error).toMatch(/Say first whether "DPT Unstated"/);
    // On a security system only where it is recorded: the console is recorded on svc, not on s3.
    const notRecorded = await add(pb, { component_id: ids.console, location: 'service', service_system_id: ids.s3 });
    expect(notRecorded.status).toBe(400);
    expect(notRecorded.body.error).toMatch(/not recorded on DPT s3/);
    const rec = await api('analyst', 'get', `/controls/solutions/recorded-on?component_id=${ids.console}`);
    expect(rec.body.systems.map((x) => x.name)).toEqual(['DPT svc']);
    const detail = await api('ciso', 'get', `/controls/${ids.obj}`);
    const patterns = detail.body.delivery_patterns;
    expect(patterns.map((p) => p.name)).toEqual(['DPT Agent A stack', 'DPT Agent B stack']);
    expect(patterns[0].parts.find((x) => x.component_name === 'DPT SOC')).toMatchObject({ location: 'service', service_system_name: 'DPT svc' });
  });
});

describe('what the patterns derive', () => {
  test('each system is delivered by the pattern in play, and asked only for its parts', async () => {
    expect(await delivery('s1')).toMatchObject({ pattern_name: 'DPT Agent A stack', delivery: 'complete', disagreement: null });
    expect(await delivery('s2')).toMatchObject({ pattern_name: 'DPT Agent B stack', delivery: 'complete' });
    // s1 runs agent A: it is no longer asked for agent B.
    expect(await finding('s1')).toEqual([]);
  });

  // v152: the status follows the solution, so "marked operational, but no
  // solution is complete" can no longer stand — it reads missing, with an audit row.
  test('a system with no pattern in place is not a component gap; its objective reads missing', async () => {
    await query('SELECT settle_system_security()');
    expect(await delivery('s3')).toMatchObject({ delivery: 'no_pattern_in_place', marked_status: 'missing' });
    // Since v159 the change can land earlier: the objective was marked
    // operational before its solutions existed, and the first settle after a
    // write made it missing for having no solution at all. Either way it is
    // missing, with one audit row saying why.
    const { rows } = await query(
      `SELECT human_narrative FROM audit_log WHERE entity_id = $1
          AND changes->>'reason' IN ('follows_security_solution', 'no_security_solution')`, [ids.s3]);
    expect(rows).toHaveLength(1);
    expect(rows[0].human_narrative).toMatch(/is now missing \(was operational\) because its status follows its security solution: (none of the security solutions that deliver it is in place|no security solution delivers this objective)/);
    expect(await finding('s3')).toEqual([]);
  });

  // Before v152 this was "named, not changed". Now it is changed, and audited.
  test('marked degraded while every part works becomes operational', async () => {
    await query('SELECT settle_system_security()');
    expect(await delivery('s2')).toMatchObject({ marked_status: 'operational', disagreement: null });
    const { rows } = await query(`SELECT status FROM system_controls WHERE system_id = $1 AND control_id = $2`, [ids.s2, ids.obj]);
    expect(rows[0].status).toBe('operational');
  });

  test('degrading the SOC once, on its service, degrades every system relying on it', async () => {
    await query(`UPDATE system_components SET status = 'degraded' WHERE system_id = $1 AND component_id = $2`, [ids.svc, ids.soc]);
    expect(await delivery('s1')).toMatchObject({ delivery: 'degraded', degraded_parts: ['DPT SOC'],
      disagreement: 'marked operational, but a part it relies on is degraded' });
    await query(`UPDATE system_components SET status = 'operational' WHERE system_id = $1 AND component_id = $2`, [ids.svc, ids.soc]);
  });

  test('a pattern missing a part on the system it is in play on asks for that part — and only that', async () => {
    // Agent B stack now also needs a TLS setting on the system; s2 has agent B only.
    const tls = (await query(`INSERT INTO control_components (name, component_type, instantiation, status, created_by)
                               VALUES ('DPT TLS', 'technology', 'per_system', 'operational', $1) RETURNING id`, [USERS.admin.id])).rows[0].id;
    const detail = await api('ciso', 'get', `/controls/${ids.obj}`);
    const pb = detail.body.delivery_patterns.find((p) => p.name === 'DPT Agent B stack').id;
    const part = await api('ciso', 'post', `/controls/${ids.obj}/patterns/${pb}/parts`).send({ component_id: tls, location: 'on_system' });
    expect(part.status).toBe(201);
    expect(await delivery('s2')).toMatchObject({ pattern_name: 'DPT Agent B stack', delivery: 'incomplete', missing_parts: ['DPT TLS'] });
    expect(await finding('s2')).toEqual(['DPT TLS']);        // not agent A: that is another pattern
    const partId = part.body.patterns.find((p) => p.id === pb).parts.find((x) => x.component_name === 'DPT TLS').id;
    await api('ciso', 'delete', `/controls/${ids.obj}/patterns/${pb}/parts/${partId}`);
    expect(await finding('s2')).toEqual([]);
  });
});

describe('provided by the supplier', () => {
  test('met only by the supplier\'s current evidence', async () => {
    const sp = (await api('ciso', 'post', `/controls/${ids.obj}/patterns`).send({ name: 'By the supplier', kind: 'supplier' })).body.id;
    expect((await api('ciso', 'post', `/controls/${ids.obj}/patterns/${sp}/parts`)
      .send({ component_id: ids.agentA, location: 'on_system' })).status).toBe(400);
    const supplier = (await api('ciso', 'post', '/suppliers').send({ name: 'DPT Provider' })).body.id;
    const rel = (await api('ciso', 'post', `/suppliers/${supplier}/relationships`).send({
      relationship_type: 'service_provider', system_id: ids.saas, department_id: IT_DEPT, status: 'active' })).body.id;
    expect(await delivery('saas')).toMatchObject({ pattern_kind: 'supplier', delivery: 'incomplete' });
    // v146: relying on the supplier to deliver it makes it expected of them —
    // no need to add it to the SaaS control set.
    const { rows: exp } = await query(
      `SELECT sources FROM v_supplier_relationship_objectives WHERE relationship_id = $1 AND control_id = $2`, [rel, ids.obj]);
    expect(exp[0].sources).toEqual(['delivered_here']);
    const ev = await api('ciso', 'post', `/suppliers/relationships/${rel}/evidence`).send({
      kind: 'report', title: 'DPT SOC 2', expires_on: '2099-01-01', control_ids: [ids.obj] });
    expect(ev.status).toBe(201);
    // the evidence makes it complete, and the status follows (v152)
    expect(await delivery('saas')).toMatchObject({ delivery: 'complete', marked_status: 'operational', disagreement: null });
  });
});

describe('a security solution is shared (v147)', () => {
  const solution = async (controlId, name) =>
    (await api('ciso', 'get', `/controls/${controlId}`)).body.delivery_patterns.find((p) => p.name === name);

  test('an existing solution is added to another objective, not copied', async () => {
    const a = await solution(ids.obj, 'DPT Agent A stack');
    const res = await api('ciso', 'post', `/controls/${ids.obj2}/patterns`).send({ pattern_id: a.id });
    expect(res.status).toBe(201);
    const onObj2 = await solution(ids.obj2, 'DPT Agent A stack');
    expect(onObj2.id).toBe(a.id);
    expect(onObj2.objectives.map((o) => o.id).sort()).toEqual([ids.obj, ids.obj2].sort());
    // Adding it twice is refused, by name.
    const again = await api('ciso', 'post', `/controls/${ids.obj2}/patterns`).send({ pattern_id: a.id });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already delivers this objective/);
    // A new solution may not take an existing solution's name.
    expect((await api('ciso', 'post', `/controls/${ids.obj2}/patterns`).send({ name: 'DPT Agent B stack' })).status).toBe(409);
    // The library lists it once, with both objectives.
    const lib = (await api('analyst', 'get', '/controls/solutions')).body.solutions.filter((p) => p.name === 'DPT Agent A stack');
    expect(lib).toHaveLength(1);
    expect(lib[0].objectives).toHaveLength(2);
  });

  test('its parts are written once: a part added through one objective is there for both', async () => {
    const a = await solution(ids.obj2, 'DPT Agent A stack');
    const res = await api('ciso', 'post', `/controls/${ids.obj2}/patterns/${a.id}/parts`)
      .send({ component_id: ids.console, location: 'organisation' });
    expect(res.status).toBe(201);
    expect((await solution(ids.obj, 'DPT Agent A stack')).parts.filter((p) => p.component_name === 'DPT Console A')).toHaveLength(2);
    const part = (await solution(ids.obj, 'DPT Agent A stack')).parts.find((p) => p.component_name === 'DPT Console A' && p.location === 'organisation');
    expect((await api('ciso', 'delete', `/controls/${ids.obj}/patterns/${a.id}/parts/${part.id}`)).status).toBe(200);
    expect((await solution(ids.obj2, 'DPT Agent A stack')).parts.map((p) => p.location)).not.toContain('organisation');
  });

  test('a solution can only be changed through an objective it delivers', async () => {
    const b = await solution(ids.obj, 'DPT Agent B stack');
    expect((await api('ciso', 'post', `/controls/${ids.obj2}/patterns/${b.id}/parts`)
      .send({ component_id: ids.agentA, location: 'on_system' })).status).toBe(404);
    expect((await api('ciso', 'patch', `/controls/${ids.obj2}/patterns/${b.id}`).send({ name: 'DPT renamed' })).status).toBe(404);
  });

  test('"provided by the supplier" is one solution for the whole library', async () => {
    const first = (await solution(ids.obj, (await api('ciso', 'get', `/controls/${ids.obj}`)).body.delivery_patterns.find((p) => p.kind === 'supplier').name)).id;
    const res = await api('ciso', 'post', `/controls/${ids.obj2}/patterns`).send({ kind: 'supplier' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(first);
    expect((await api('ciso', 'delete', `/controls/${ids.obj2}/patterns/${first}`)).status).toBe(200);
  });

  test('removing it from one objective keeps it; from its last, removes it from the library', async () => {
    const a = await solution(ids.obj2, 'DPT Agent A stack');
    expect((await api('ciso', 'delete', `/controls/${ids.obj2}/patterns/${a.id}`)).status).toBe(200);
    expect((await solution(ids.obj, 'DPT Agent A stack')).objectives).toHaveLength(1);
    const c = (await api('ciso', 'post', `/controls/${ids.obj2}/patterns`).send({ name: 'DPT Only here' })).body.id;
    expect((await api('ciso', 'delete', `/controls/${ids.obj2}/patterns/${c}`)).status).toBe(200);
    expect((await query(`SELECT 1 FROM delivery_patterns WHERE id = $1`, [c])).rowCount).toBe(0);
  });
});

describe('who is relied on (v146)', () => {
  test('a contractor on a system where our own pattern is in play is not expected to evidence it', async () => {
    const supplier = (await api('ciso', 'post', '/suppliers').send({ name: 'DPT Maintainer' })).body.id;
    // s1 runs agent A itself: the maintainer does not deliver its monitoring.
    const rel = (await api('ciso', 'post', `/suppliers/${supplier}/relationships`).send({
      relationship_type: 'contracted_service', system_id: ids.s1, department_id: IT_DEPT, status: 'active' })).body.id;
    const { rows } = await query(
      `SELECT sources FROM v_supplier_relationship_objectives WHERE relationship_id = $1 AND control_id = $2`, [rel, ids.obj]);
    expect(rows).toHaveLength(0);
    expect(await delivery('s1')).toMatchObject({ pattern_name: 'DPT Agent A stack', delivery: 'complete' });
    await query(`DELETE FROM supplier_relationships WHERE id = $1`, [rel]);
    await query(`DELETE FROM suppliers WHERE id = $1`, [supplier]);
  });
});

describe('on the system page', () => {
  test('delivery is returned beside each control, and expected parts follow the pattern', async () => {
    const res = await api('ciso', 'get', `/systems/${ids.s1}`);
    expect(res.body.control_delivery.find((d) => d.control_id === ids.obj)).toMatchObject({ pattern_name: 'DPT Agent A stack', delivery: 'complete' });
    expect(res.body.expected_components.map((c) => c.name)).not.toContain('DPT Agent B');
  });
});

// The risk page read the objective's flat library list, so on a system where
// one security solution was complete it still showed every other solution's
// agents as missing — and a recorded-but-degraded alternative agent became a
// MANDATORY remediation item. Owner, 2026-10-01: "both of these should be
// enough". The panel and the candidates now follow the solution in use.
describe('on the risk page', () => {
  let threat; let risk;
  beforeAll(async () => {
    threat = (await query(`INSERT INTO threats (name, threat_category) VALUES ('DPT threat', 'deliberate') RETURNING id`)).rows[0].id;
    await query(`INSERT INTO control_threats (control_id, threat_id) VALUES ($1, $2)`, [ids.obj, threat]);
    risk = (await query(
      `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a, risk_score, rationale, validation_status)
       VALUES ($1, $2, 3, 3, 3, 9, 'DPT risk', 'validated') RETURNING id`, [ids.s1, threat])).rows[0].id;
    // s1 runs agent A (its solution is complete) and ALSO has agent B recorded, degraded.
    await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'degraded')`, [ids.s1, ids.agentB]);
  });
  afterAll(async () => {
    await query(`DELETE FROM system_components WHERE system_id = $1 AND component_id = $2`, [ids.s1, ids.agentB]);
    await query(`DELETE FROM risks WHERE id = $1`, [risk]);
    await query(`DELETE FROM control_threats WHERE threat_id = $1`, [threat]);
    await query(`DELETE FROM threats WHERE id = $1`, [threat]);
  });

  test('the coverage panel shows the solution in use, and the alternatives are not gaps', async () => {
    const res = await api('analyst', 'get', `/risks/gap?system_id=${ids.s1}&threat_id=${threat}&risk_id=${risk}`);
    expect(res.status).toBe(200);
    const c = res.body.controls.find((x) => x.id === ids.obj);
    expect(c.solutions.find((s) => s.in_use)).toMatchObject({ name: 'DPT Agent A stack', state: 'complete' });
    expect(c.solutions.map((s) => s.name)).toContain('DPT Agent B stack');
    const names = c.components.map((x) => x.name);
    expect(names).toContain('DPT Agent A');
    expect(names).not.toContain('DPT Agent B');            // on the library list, but another solution
    expect(c.components.find((x) => x.name === 'DPT SOC'))
      .toMatchObject({ part_location: 'service', security_system: { id: ids.svc, name: 'DPT svc' }, on_system: true });
    expect(res.body.summary.components_missing).toBe(0);
  });

  test('a degraded agent of an unused solution is not a mandatory remediation item', async () => {
    const res = await api('analyst', 'get', `/risks/${risk}/action-items/candidates`);
    expect(res.status).toBe(200);
    expect(res.body.components.map((x) => x.name)).not.toContain('DPT Agent B');
  });

  test('a degraded part of the solution in use still is', async () => {
    await query(`UPDATE system_components SET status = 'degraded' WHERE system_id = $1 AND component_id = $2`, [ids.s1, ids.agentA]);
    try {
      const res = await api('analyst', 'get', `/risks/${risk}/action-items/candidates`);
      // Agent A degraded: neither solution is complete, A stays in use (more of it recorded).
      expect(res.body.components.map((x) => x.name)).toContain('DPT Agent A');
    } finally {
      await query(`UPDATE system_components SET status = 'operational' WHERE system_id = $1 AND component_id = $2`, [ids.s1, ids.agentA]);
    }
  });

  test('an objective without solutions keeps its library list', async () => {
    // obj2 has no security solution left by now: link it to the threat with agent B on its list.
    await query(`INSERT INTO control_threats (control_id, threat_id) VALUES ($1, $2)`, [ids.obj2, threat]);
    await query(`INSERT INTO control_component_links (control_id, component_id, created_by) VALUES ($1, $2, $3)`, [ids.obj2, ids.agentB, USERS.admin.id]);
    const res = await api('analyst', 'get', `/risks/gap?system_id=${ids.s1}&threat_id=${threat}`);
    const c2 = res.body.controls.find((x) => x.id === ids.obj2);
    expect(c2.solutions).toBeNull();
    expect(c2.components.map((x) => x.name)).toEqual(['DPT Agent B']);
    // …and there the degraded agent B IS a candidate, through obj2, as before.
    await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [ids.s1, ids.obj2]);
    const cand = await api('analyst', 'get', `/risks/${risk}/action-items/candidates`);
    expect(cand.body.components.find((x) => x.name === 'DPT Agent B')?.via_controls).toEqual(['DPT Endpoint logging']);
    await query(`DELETE FROM system_controls WHERE system_id = $1 AND control_id = $2`, [ids.s1, ids.obj2]);
  });
});
