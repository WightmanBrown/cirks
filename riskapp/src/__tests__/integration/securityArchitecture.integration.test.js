'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The security architecture (v148, docs/system-security-view.md step 2):
// rules on single components, membership groups, builds applied as copies,
// and choices per objective — all report only, all feeding the one
// component-record finding.
//
// Fixture: two systems in IT (A, B) and one in another department (X).
//   Objectives O1, O2 (both delivered by solution EDR), O3 (delivered by EDR2
//   and BK), O4 (delivered by BK only).
//   EDR has one on-system part AGENT; BK has an organisation part.
//   OS component WIN triggers rule "WIN → EDR" citing standard STD.
//   Threat T is countered by O3 and is identified on A.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));
const finding = async (sys) => (await query('SELECT * FROM v_system_component_findings WHERE system_id = $1', [sys])).rows[0];
const security = async (sys) => (await api('ciso', 'get', `/systems/${sys}/security`)).body;

const ids = {};
const comp = async (name, type, inst, extra = {}) => (await query(
  `INSERT INTO control_components (component_type, name, status, instantiation, document_kind, document_next_review, created_by)
   VALUES ($1::component_type, $2, 'operational', $3, $4, $5, $6) RETURNING id`,
  [type, name, inst, extra.kind || null, extra.kind ? '2028-01-01' : null, USERS.admin.id])).rows[0].id;

beforeAll(async () => {
  ids.otherDept = (await query(`INSERT INTO departments (name) VALUES ('ARCH other dept') RETURNING id`)).rows[0].id;
  const sys = async (name, dept) => (await query(
    `INSERT INTO systems (name, department_id, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
    [name, dept, USERS.owner.id])).rows[0].id;
  ids.A = await sys('ARCH Sys A', IT_DEPT);
  ids.B = await sys('ARCH Sys B', IT_DEPT);
  ids.X = await sys('ARCH Sys X', ids.otherDept);
  const ctl = async (code) => (await query(
    `INSERT INTO controls (title, description, delivery, reference_code) VALUES ($1, 'fixture', 'system', $1) RETURNING id`,
    [`ARCH-${code}`])).rows[0].id;
  for (const o of ['O1', 'O2', 'O3', 'O4']) ids[o] = await ctl(o);
  ids.STD   = await comp('ARCH Security Architecture Standard', 'information', 'organisational', { kind: 'standard' });
  ids.GUIDE = await comp('ARCH Guideline', 'information', 'organisational', { kind: 'guideline' });
  ids.WIN   = await comp('ARCH Windows', 'technology', 'per_system');
  ids.AGENT = await comp('ARCH EDR agent', 'technology', 'per_system');
  ids.CONSOLE = await comp('ARCH backup service', 'technology', 'organisational');
  ids.ZONE1 = await comp('ARCH Zone internal', 'technology', 'per_system');
  ids.ZONE2 = await comp('ARCH Zone DMZ', 'technology', 'per_system');
  const pattern = async (name, objectives) => {
    const id = (await query(`INSERT INTO delivery_patterns (name, kind) VALUES ($1, 'parts') RETURNING id`, [name])).rows[0].id;
    for (const o of objectives) await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [id, ids[o]]);
    return id;
  };
  ids.EDR  = await pattern('ARCH EDR', ['O1', 'O2']);
  ids.EDR2 = await pattern('ARCH EDR two', ['O3']);
  ids.BK   = await pattern('ARCH Backup', ['O3', 'O4']);
  await query(`INSERT INTO delivery_pattern_parts (pattern_id, component_id, location) VALUES ($1, $2, 'on_system')`, [ids.EDR, ids.AGENT]);
  await query(`INSERT INTO delivery_pattern_parts (pattern_id, component_id, location) VALUES ($1, $2, 'organisation')`, [ids.BK, ids.CONSOLE]);
  ids.T = (await query(`INSERT INTO threats (name, threat_category) VALUES ('ARCH threat', 'deliberate') RETURNING id`)).rows[0].id;
  await query(`INSERT INTO control_threats (control_id, threat_id) VALUES ($1, $2)`, [ids.O3, ids.T]);
  await query(`INSERT INTO system_threats (system_id, threat_id) VALUES ($1, $2)`, [ids.A, ids.T]);
});

afterAll(async () => {
  const systems = [ids.A, ids.B, ids.X];
  await query(`DELETE FROM security_actions WHERE subject_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_solution_choices WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM architecture_rules WHERE standard_id = $1`, [ids.STD]);
  await query(`DELETE FROM membership_groups WHERE standard_id = $1`, [ids.STD]);
  await query(`DELETE FROM system_builds WHERE name LIKE 'ARCH%'`);
  await query(`DELETE FROM system_threats WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_components WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_controls WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM control_component_links WHERE control_id = ANY($1)`, [[ids.O1, ids.O2, ids.O3, ids.O4]]);
  await query(`DELETE FROM control_threats WHERE threat_id = $1`, [ids.T]);
  await query(`DELETE FROM threats WHERE id = $1`, [ids.T]);
  await query(`DELETE FROM delivery_patterns WHERE name LIKE 'ARCH%'`);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [[...systems, ids.STD]]);
  await query(`DELETE FROM audit_log WHERE entity_type IN ('architecture_rule', 'membership_group', 'system_build', 'system_security')
                 AND entity_label LIKE '%ARCH%'`);
  await query(`DELETE FROM control_components WHERE name LIKE 'ARCH%'`);
  await query(`DELETE FROM controls WHERE title LIKE 'ARCH-%'`);
  await query(`DELETE FROM systems WHERE id = ANY($1)`, [systems]);
  await query(`DELETE FROM departments WHERE id = $1`, [ids.otherDept]);
});

describe('a threat makes an objective wanted; a person chooses its solution', () => {
  test('before any rule, the objective the threat calls for needs a solution', async () => {
    const f = await finding(ids.A);
    expect(f).toMatchObject({ needs_solution_count: 1, conflict_count: 0, missing_count: 0 });
    const s = await security(ids.A);
    const o3 = s.objectives.find((o) => o.control_id === ids.O3);
    expect(o3).toMatchObject({ state: 'needs_solution', for_threat: true, threats: ['ARCH threat'] });
    expect(o3.solutions.map((p) => p.name)).toEqual(['ARCH Backup', 'ARCH EDR two']);
    // The finding NAMES it, on the system's page and in the findings list — a
    // count alone cannot be acted on (owner, 2026-10-06).
    const page = await api('ciso', 'get', `/systems/${ids.A}`);
    expect(page.status).toBe(200);
    const onPage = (page.body.system || page.body).component_finding;
    expect(onPage.needs_solution_objectives.map((o) => o.id)).toEqual([ids.O3]);
    expect(onPage.conflict_objectives).toEqual([]);
    const listed = await api('ciso', 'get', '/findings/component-record');
    expect(listed.status).toBe(200);
    const row = listed.body.findings.find((r) => r.system_id === ids.A);
    expect(row.needs_solution_objectives.map((o) => o.id)).toEqual([ids.O3]);
    // A system with no threat and no architecture wants nothing — and has no finding.
    expect(await finding(ids.B)).toBeUndefined();
  });

  test('a solution that does not deliver the objective cannot be chosen for it', async () => {
    const res = await api('iam', 'put', `/systems/${ids.A}/solution-choices/${ids.O3}`).send({ pattern_id: ids.EDR });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not deliver/);
  });

  test('another department\'s IAM cannot choose for this system', async () => {
    const res = await api('iam', 'put', `/systems/${ids.X}/solution-choices/${ids.O3}`).send({ pattern_id: ids.BK });
    expect(res.status).toBe(403);
  });

  test('the IAM chooses Backup for O3 — and it counts for O4 too, which it also delivers', async () => {
    const res = await api('iam', 'put', `/systems/${ids.A}/solution-choices/${ids.O3}`)
      .send({ pattern_id: ids.BK, notes: 'Restores from the central service' });
    expect(res.status).toBe(200);
    const o = Object.fromEntries(res.body.objectives.map((x) => [x.control_id, x]));
    expect(o[ids.O3]).toMatchObject({ state: 'delivered', chosen_pattern_id: ids.BK, choice_notes: 'Restores from the central service' });
    expect(o[ids.O4]).toMatchObject({ state: 'delivered', for_threat: false });
    expect(res.body.solutions.map((x) => [x.pattern_name, x.reasons[0].reason])).toEqual([['ARCH Backup', 'chosen']]);
    const { rows } = await query(`SELECT human_narrative FROM audit_log WHERE entity_id = $1 AND entity_type = 'system_security'`, [ids.A]);
    expect(rows.map((r) => r.human_narrative)).toContain('ARCH Sys A: "ARCH Backup" chosen for "ARCH-O3"');
  });

  // v152: they used to sit "implied but not recorded" until someone recorded
  // each by hand. Now the choice records them, in the state the solution is in.
  test('the objectives the choice brings in are recorded on the system, in the solution\'s state', async () => {
    expect(await finding(ids.A)).toBeUndefined();
    const { rows } = await query(
      `SELECT control_id, status, created_by FROM system_controls WHERE system_id = $1 AND control_id = ANY($2)`, [ids.A, [ids.O3, ids.O4]]);
    expect(rows).toHaveLength(2);
    // Backup's one part exists once for the organisation and is operational.
    expect(rows.every((r) => r.status === 'operational' && r.created_by === null)).toBe(true);
    const audit = await query(
      `SELECT human_narrative FROM audit_log WHERE entity_id = $1 AND changes->>'reason' = 'implied_by_security_solution'`, [ids.A]);
    expect(audit.rows.map((r) => r.human_narrative).join(' ')).toMatch(/"ARCH-O4" recorded on the system because ARCH Backup/);
  });

  test('unlinking the solution from the objective withdraws the choice made for it', async () => {
    await query(`DELETE FROM delivery_pattern_objectives WHERE pattern_id = $1 AND control_id = $2`, [ids.BK, ids.O3]);
    const { rows } = await query(`SELECT 1 FROM system_solution_choices WHERE system_id = $1`, [ids.A]);
    expect(rows).toHaveLength(0);
    await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [ids.BK, ids.O3]);
    await api('iam', 'put', `/systems/${ids.A}/solution-choices/${ids.O3}`).send({ pattern_id: ids.BK });
  });
});

describe('the architecture: rules on single components', () => {
  test('a rule must cite a policy, standard or procedure — not a guideline', async () => {
    const res = await api('ciso', 'post', '/architecture/rules').send({ pattern_id: ids.EDR, standard_id: ids.GUIDE });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/guideline is advisory/);
  });

  test('only the security team writes the architecture', async () => {
    const res = await api('iam', 'post', '/architecture/rules').send({ pattern_id: ids.EDR, standard_id: ids.STD });
    expect(res.status).toBe(403);
  });

  test('Windows → EDR: a system recording Windows wants EDR, and why', async () => {
    const res = await api('ciso', 'post', '/architecture/rules')
      .send({ pattern_id: ids.EDR, standard_id: ids.STD, trigger_ids: [ids.WIN] });
    expect(res.status).toBe(201);
    ids.rule = res.body.rule.id;
    expect(res.body.rule).toMatchObject({ pattern_name: 'ARCH EDR', standard_name: 'ARCH Security Architecture Standard', systems: 0 });

    await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'operational')`, [ids.B, ids.WIN]);
    const s = await security(ids.B);
    expect(s.solutions).toHaveLength(1);
    expect(s.solutions[0].reasons[0]).toMatchObject({
      reason: 'architecture', standard_name: 'ARCH Security Architecture Standard', trigger_component_name: 'ARCH Windows' });
    expect(s.solutions[0].parts).toEqual([expect.objectContaining({ component_name: 'ARCH EDR agent', location: 'on_system', status: null })]);
  });

  test('its on-system part is now needed, and its objectives are wanted', async () => {
    const f = await finding(ids.B);
    expect(f).toMatchObject({ missing_count: 1, missing_component_names: ['ARCH EDR agent'], needs_solution_count: 0 });
    // v152: its objectives are recorded for it, and read missing because the
    // solution's on-system part is not there.
    expect(f.unrecorded_objective_names).toEqual([]);
    const { rows: recorded } = await query(
      `SELECT status FROM system_controls WHERE system_id = $1 AND control_id = ANY($2)`, [ids.B, [ids.O1, ids.O2]]);
    expect(recorded.map((r) => r.status)).toEqual(['missing', 'missing']);
    // The system page reads the same rule.
    const page = (await api('ciso', 'get', `/systems/${ids.B}`)).body;
    expect(page.expected_components.map((c) => c.name)).toContain('ARCH EDR agent');
    expect(page.component_finding).toMatchObject({ missing_count: 1, needs_solution_count: 0 });
  });

  test('an objective the SoA excludes is not wanted', async () => {
    await query(`INSERT INTO soa_entries (control_id, applicable, justification) VALUES ($1, false, 'fixture')`, [ids.O2]);
    const implied = async () => (await query(
      `SELECT control_id FROM v_system_wanted_objectives WHERE system_id = $1`, [ids.B])).rows.map((r) => r.control_id);
    expect(await implied()).toContain(ids.O1);
    expect(await implied()).not.toContain(ids.O2);
    await query(`DELETE FROM soa_entries WHERE control_id = $1`, [ids.O2]);
  });

  test('a solution the architecture requires stays in the library when it stops delivering anything', async () => {
    for (const o of ['O1', 'O2']) {
      expect((await api('ciso', 'delete', `/controls/${ids[o]}/patterns/${ids.EDR}`)).status).toBe(200);
    }
    expect((await query('SELECT 1 FROM delivery_patterns WHERE id = $1', [ids.EDR])).rows).toHaveLength(1);
    for (const o of ['O1', 'O2']) await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [ids.EDR, ids[o]]);
  });

  test('two required solutions delivering one objective are a conflict until someone chooses', async () => {
    // EDR now also delivers O3, which Backup (chosen on A) delivers too.
    await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [ids.EDR, ids.O3]);
    await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'operational'), ($1, $3, 'operational')`,
      [ids.A, ids.WIN, ids.AGENT]);
    // A's choice for O3 settles it there…
    expect((await finding(ids.A))?.conflict_count ?? 0).toBe(0);
    // …but withdrawing it leaves EDR (architecture) and Backup (chosen for nothing
    // now) — Backup is no longer wanted, so EDR alone delivers O3.
    await api('iam', 'delete', `/systems/${ids.A}/solution-choices/${ids.O3}`);
    const o3 = (await security(ids.A)).objectives.find((o) => o.control_id === ids.O3);
    expect(o3).toMatchObject({ state: 'delivered', pattern_ids: [ids.EDR] });
    // A second rule requiring Backup makes it a real conflict.
    const r2 = await api('ciso', 'post', '/architecture/rules').send({ pattern_id: ids.BK, standard_id: ids.STD, trigger_ids: [ids.WIN] });
    expect(r2.status).toBe(201);
    expect((await finding(ids.A)).conflict_count).toBe(1);
    await api('iam', 'put', `/systems/${ids.A}/solution-choices/${ids.O3}`).send({ pattern_id: ids.EDR });
    expect((await finding(ids.A))?.conflict_count ?? 0).toBe(0);
    // Choosing is per SOLUTION: a second rule requiring EDR2 conflicts with EDR
    // on nothing, but a rule requiring Backup again re-opens O3 and O4 — and one
    // choice of Backup, made for O4, settles O3 as well.
    await api('iam', 'delete', `/systems/${ids.A}/solution-choices/${ids.O3}`);
    expect((await finding(ids.A)).conflict_count).toBe(1);
    await api('iam', 'put', `/systems/${ids.A}/solution-choices/${ids.O4}`).send({ pattern_id: ids.BK });
    const o = Object.fromEntries((await security(ids.A)).objectives.map((x) => [x.control_id, x]));
    expect(o[ids.O3]).toMatchObject({ state: 'delivered', pattern_ids: [ids.BK], chosen_pattern_id: ids.BK });
    await api('iam', 'delete', `/systems/${ids.A}/solution-choices/${ids.O4}`);
    await api('iam', 'put', `/systems/${ids.A}/solution-choices/${ids.O3}`).send({ pattern_id: ids.EDR });
    await api('ciso', 'delete', `/architecture/rules/${r2.body.rule.id}`);
    await query(`DELETE FROM delivery_pattern_objectives WHERE pattern_id = $1 AND control_id = $2`, [ids.EDR, ids.O3]);
  });
});

describe('recording an objective that has security solutions', () => {
  test('provisions none of its library components — they are alternatives, not a checklist', async () => {
    await query(`INSERT INTO control_component_links (control_id, component_id, created_by) VALUES ($1, $2, $3)`,
      [ids.O4, ids.ZONE1, USERS.admin.id]);
    expect((await api('ciso', 'post', `/systems/${ids.X}/controls`).send({ control_id: ids.O4 })).status).toBe(201);
    const { rows } = await query(`SELECT 1 FROM system_components WHERE system_id = $1 AND component_id = $2`, [ids.X, ids.ZONE1]);
    expect(rows).toHaveLength(0);
    await query(`DELETE FROM system_controls WHERE system_id = $1`, [ids.X]);
    await query(`DELETE FROM control_component_links WHERE control_id = $1`, [ids.O4]);
  });
});

describe('membership groups — a blank must read as a blank', () => {
  test('a group with members applies to every system; one not answered is a finding reason', async () => {
    const g = await api('ciso', 'post', '/architecture/groups').send({ name: 'ARCH Network zone', standard_id: ids.STD });
    expect(g.status).toBe(201);
    ids.group = g.body.group.id;
    for (const z of [ids.ZONE1, ids.ZONE2]) {
      expect((await api('ciso', 'post', `/architecture/groups/${ids.group}/members`).send({ component_id: z })).status).toBe(201);
    }
    expect((await finding(ids.B)).missing_membership_names).toContain('ARCH Network zone');
    const lib = (await api('ciso', 'get', '/architecture')).body;
    expect(lib.groups.find((x) => x.id === ids.group).members.map((m) => m.name)).toEqual(['ARCH Zone DMZ', 'ARCH Zone internal']);
  });

  test('recording any one member answers it', async () => {
    await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'operational')`, [ids.B, ids.ZONE2]);
    expect((await finding(ids.B)).missing_membership_names).not.toContain('ARCH Network zone');
    const m = (await security(ids.B)).memberships.find((x) => x.id === ids.group);
    expect(m).toMatchObject({ answered: true, recorded: [{ id: ids.ZONE2, name: 'ARCH Zone DMZ' }] });
  });

  test('with a trigger, the group applies only where the trigger is recorded', async () => {
    expect((await api('ciso', 'post', `/architecture/groups/${ids.group}/triggers`).send({ component_id: ids.WIN })).status).toBe(201);
    const { rows } = await query(`SELECT system_id FROM v_system_membership_gaps WHERE group_id = $1`, [ids.group]);
    expect(rows.map((r) => r.system_id)).toEqual([ids.A]);       // A records Windows, no zone; B answered; X has no Windows
  });
});

describe('builds are applied as a copy, with a stated status', () => {
  test('the status must be stated — there is no default', async () => {
    const b = await api('ciso', 'post', '/architecture/builds').send({ name: 'ARCH Windows server build' });
    expect(b.status).toBe(201);
    ids.build = b.body.build.id;
    for (const c of [ids.WIN, ids.AGENT, ids.ZONE1]) {
      await api('ciso', 'post', `/architecture/builds/${ids.build}/components`).send({ component_id: c });
    }
    const res = await api('iam', 'post', `/systems/${ids.X}/builds/${ids.build}/apply`).send({});
    expect(res.status).toBe(400);
  });

  test('the preview says what it adds and the candidates it would create', async () => {
    const res = await api('ciso', 'get', `/systems/${ids.B}/builds/${ids.build}/apply`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ adding: 2 });   // B already records Windows and a zone? It records WIN + ZONE2.
    expect(res.body.components.filter((c) => c.already).map((c) => c.name)).toEqual(['ARCH Windows']);
  });

  test('applying copies the missing components; nothing links back', async () => {
    const res = await api('ciso', 'post', `/systems/${ids.B}/builds/${ids.build}/apply`).send({ status: 'missing' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ added: 2, already: 1 });
    const { rows } = await query(
      `SELECT cc.name, x.status::text FROM system_components x JOIN control_components cc ON cc.id = x.component_id
        WHERE x.system_id = $1 AND x.component_id = ANY($2) ORDER BY cc.name`, [ids.B, [ids.AGENT, ids.ZONE1]]);
    expect(rows).toEqual([{ name: 'ARCH EDR agent', status: 'missing' }, { name: 'ARCH Zone internal', status: 'missing' }]);
    // Changing the build later changes nothing already applied.
    await api('ciso', 'delete', `/architecture/builds/${ids.build}/components/${ids.ZONE1}`);
    expect((await query(`SELECT 1 FROM system_components WHERE system_id = $1 AND component_id = $2`, [ids.B, ids.ZONE1])).rows).toHaveLength(1);
    // B now records the agent its architecture needs.
    expect((await finding(ids.B))?.missing_count ?? 0).toBe(0);
  });
});

describe('a solution that leaves no trace on the system (v149)', () => {
  // Backup has only an organisation part. v145 counted it in play on every
  // system deploying an objective it delivers; now only where it is wanted.
  const inPlay = async (sys) => (await query(
    `SELECT bool_or(in_play) AS p FROM v_delivery_pattern_state WHERE system_id = $1 AND pattern_id = $2`, [sys, ids.BK])).rows[0].p;

  test('is not in place merely because the objective is deployed', async () => {
    await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [ids.X, ids.O4]);
    expect(await inPlay(ids.X)).toBe(false);
  });

  test('is in place once the system wants it — here, by a choice', async () => {
    await query(`INSERT INTO system_solution_choices (system_id, control_id, pattern_id) VALUES ($1, $2, $3)`, [ids.X, ids.O4, ids.BK]);
    expect(await inPlay(ids.X)).toBe(true);
    await query(`DELETE FROM system_solution_choices WHERE system_id = $1`, [ids.X]);
    await query(`DELETE FROM system_controls WHERE system_id = $1`, [ids.X]);
  });
});

describe('an action raised from the finding completes only when nothing it names remains', () => {
  test('the refusal names what is still outstanding', async () => {
    await query(`DELETE FROM system_controls WHERE system_id = $1`, [ids.B]);
    const raised = await api('ciso', 'post', `/findings/component-record/${ids.B}/actions`).send({});
    expect(raised.status).toBe(201);
    const actionId = raised.body.action_id;
    expect((await api('ciso', 'post', `/actions/${actionId}/accept`)).status).toBe(200);
    const res = await api('ciso', 'post', `/actions/${actionId}/complete`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/implied by the security architecture but not recorded: ARCH-O1/);
  });
});

// v150 (owner, 2026-10-06): asking a person to confirm what is already fully
// delivered is paperwork. Its own objects on Sys X, so the cases above are untouched.
describe('a security solution complete in place counts as chosen (v150)', () => {
  const own = {};
  const o5 = async () => (await security(ids.X)).objectives.find((o) => o.control_id === own.O5);
  const auditRows = async () => (await query(
    `SELECT user_id, human_narrative, changes FROM audit_log
      WHERE entity_id = $1 AND changes->>'reason' = 'complete_in_place'`, [ids.X])).rows;

  beforeAll(async () => {
    own.O5 = (await query(
      `INSERT INTO controls (title, description, delivery, reference_code) VALUES ('ARCH-O5', 'fixture', 'system', 'ARCH-O5') RETURNING id`)).rows[0].id;
    own.AGENT = await comp('ARCH containment agent', 'technology', 'per_system');
    const pattern = async (name) => {
      const id = (await query(`INSERT INTO delivery_patterns (name, kind) VALUES ($1, 'parts') RETURNING id`, [name])).rows[0].id;
      await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [id, own.O5]);
      return id;
    };
    own.P1 = await pattern('ARCH Containment');
    own.P2 = await pattern('ARCH Containment two');
    await query(`INSERT INTO delivery_pattern_parts (pattern_id, component_id, location) VALUES ($1, $2, 'on_system')`, [own.P1, own.AGENT]);
    own.T = (await query(`INSERT INTO threats (name, threat_category) VALUES ('ARCH threat two', 'deliberate') RETURNING id`)).rows[0].id;
    await query(`INSERT INTO control_threats (control_id, threat_id) VALUES ($1, $2)`, [own.O5, own.T]);
    await query(`INSERT INTO system_threats (system_id, threat_id) VALUES ($1, $2)`, [ids.X, own.T]);
    await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [ids.X, own.O5]);
  });

  afterAll(async () => {
    await query(`DELETE FROM system_solution_choices WHERE system_id = $1`, [ids.X]);
    await query(`DELETE FROM system_controls WHERE system_id = $1`, [ids.X]);
    await query(`DELETE FROM system_components WHERE system_id = $1`, [ids.X]);
    await query(`DELETE FROM system_threats WHERE system_id = $1`, [ids.X]);
    await query(`DELETE FROM control_threats WHERE control_id = $1`, [own.O5]);
    await query(`DELETE FROM threats WHERE id = $1`, [own.T]);
    await query(`DELETE FROM delivery_patterns WHERE id = ANY($1)`, [[own.P1, own.P2]]);
  });

  test('a solution in place but incomplete is NOT counted — it stays a suggestion', async () => {
    await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'missing')`, [ids.X, own.AGENT]);
    expect(await o5()).toMatchObject({ state: 'needs_solution', chosen_pattern_id: null });
    expect(await auditRows()).toHaveLength(0);
    expect((await finding(ids.X)).needs_solution_count).toBe(1);
  });

  test('once complete, reading the system counts it as chosen and audits the reason', async () => {
    await query(`UPDATE system_components SET status = 'operational' WHERE system_id = $1 AND component_id = $2`, [ids.X, own.AGENT]);
    expect(await o5()).toMatchObject({
      state: 'delivered', chosen_pattern_id: own.P1, choice_source: 'in_place', chosen_by_name: null,
    });
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].human_narrative).toMatch(/"ARCH Containment" counted as chosen for "ARCH-O5" because it is complete in place/);
    expect(rows[0].changes).toMatchObject({ control_id: own.O5, pattern_id: own.P1 });
    // and the finding no longer asks for it
    expect((await finding(ids.X))?.needs_solution_count ?? 0).toBe(0);
  });

  test('it is settled once: reading again writes nothing more', async () => {
    await o5();
    expect((await api('ciso', 'get', `/systems/${ids.X}`)).status).toBe(200);
    expect((await api('ciso', 'get', '/findings/component-record')).status).toBe(200);
    expect(await auditRows()).toHaveLength(1);
  });

  test('the choice stands if the solution later degrades — the gap shows against a chosen solution', async () => {
    await query(`UPDATE system_components SET status = 'degraded' WHERE system_id = $1 AND component_id = $2`, [ids.X, own.AGENT]);
    expect(await o5()).toMatchObject({ state: 'delivered', chosen_pattern_id: own.P1, choice_source: 'in_place' });
  });

  test('a person can replace it, and the choice is then theirs', async () => {
    const res = await api('ciso', 'put', `/systems/${ids.X}/solution-choices/${own.O5}`).send({ pattern_id: own.P2 });
    expect(res.status).toBe(200);
    expect(await o5()).toMatchObject({ chosen_pattern_id: own.P2, choice_source: 'person' });
    expect((await query(`SELECT chosen_by FROM system_solution_choices WHERE system_id = $1 AND control_id = $2`,
      [ids.X, own.O5])).rows[0].chosen_by).toBe(USERS.ciso.id);
  });
});

// v152 (owner, 2026-10-07): the status of an objective on a system is a proper
// reflection of its solution's parts, so it follows them and is not set by hand.
describe('an objective\'s status on a system follows its security solution (v152)', () => {
  const own = {};
  const status = async () => (await query(
    `SELECT status FROM system_controls WHERE system_id = $1 AND control_id = $2`, [ids.X, own.O6])).rows[0].status;
  const setStatus = (body) => api('ciso', 'patch', `/systems/${ids.X}/controls/${own.O6}`).send(body);

  beforeAll(async () => {
    own.O6 = (await query(
      `INSERT INTO controls (title, description, delivery, reference_code) VALUES ('ARCH-O6', 'fixture', 'system', 'ARCH-O6') RETURNING id`)).rows[0].id;
    own.AGENT = await comp('ARCH logging agent', 'technology', 'per_system');
    own.P = (await query(`INSERT INTO delivery_patterns (name, kind) VALUES ('ARCH Logging', 'parts') RETURNING id`)).rows[0].id;
    await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [own.P, own.O6]);
    await query(`INSERT INTO delivery_pattern_parts (pattern_id, component_id, location) VALUES ($1, $2, 'on_system')`, [own.P, own.AGENT]);
    // Somebody marked it operational by hand, with nothing recorded to deliver it.
    await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational')`, [ids.X, own.O6]);
  });

  afterAll(async () => {
    await query(`DELETE FROM system_controls WHERE system_id = $1`, [ids.X]);
    await query(`DELETE FROM system_components WHERE system_id = $1`, [ids.X]);
    await query(`DELETE FROM delivery_patterns WHERE id = $1`, [own.P]);
  });

  test('marked operational with no solution in place: it reads missing, and the audit says why', async () => {
    expect((await api('ciso', 'get', `/systems/${ids.X}`)).status).toBe(200);
    expect(await status()).toBe('missing');
    const { rows } = await query(
      `SELECT user_id, old_value, new_value, human_narrative FROM audit_log
        WHERE entity_id = $1 AND changes->>'reason' = 'follows_security_solution' AND changes->>'control_id' = $2`, [ids.X, own.O6]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: null, old_value: 'operational', new_value: 'missing' });
    expect(rows[0].human_narrative).toMatch(/"ARCH-O6" is now missing \(was operational\) because its status follows its security solution/);
  });

  test('it cannot be set by hand', async () => {
    const res = await setStatus({ status: 'operational' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('status_follows_solution');
    expect(await status()).toBe('missing');
  });

  test('recording the part as working makes it operational', async () => {
    expect((await api('ciso', 'post', `/systems/${ids.X}/components`).send({ component_id: own.AGENT })).status).toBe(201);
    expect((await api('ciso', 'patch', `/systems/${ids.X}/components/${own.AGENT}`).send({ status: 'operational' })).status).toBeLessThan(300);
    expect(await status()).toBe('operational');
  });

  test('a degraded part degrades it — on this system only, for a part that lives on the system', async () => {
    expect((await api('ciso', 'patch', `/systems/${ids.X}/components/${own.AGENT}`).send({ status: 'degraded' })).status).toBeLessThan(300);
    expect(await status()).toBe('degraded');
    const { rows } = await query(
      `SELECT human_narrative FROM audit_log WHERE entity_id = $1 AND new_value = 'degraded' AND changes->>'control_id' = $2`, [ids.X, own.O6]);
    expect(rows[0].human_narrative).toMatch(/"ARCH Logging" has a degraded part \(ARCH logging agent\)/);
  });

  test('excluding it here is still a person\'s judgement, and is not overwritten', async () => {
    expect((await setStatus({ status: 'not_applicable', exclusion_reason: 'Logs go to the platform' })).status).toBe(204);
    await query('SELECT settle_system_security()');
    expect(await status()).toBe('not_applicable');
  });

  test('lifting the exclusion hands the status back to the solution', async () => {
    expect((await setStatus({ status: 'operational' })).status).toBe(204);
    // whatever was sent, it follows the solution again: the part is still degraded
    expect(await status()).toBe('degraded');
  });
});

// v159 (owner, 2026-10-07 ruling, switched on 2026-10-15): "no solution means no
// security objective". An objective delivered per system that no security
// solution delivers reads missing, and cannot be set by hand either.
describe('an objective with no security solution reads missing (v159)', () => {
  const own = {};
  const status = async (controlId) => (await query(
    `SELECT status FROM system_controls WHERE system_id = $1 AND control_id = $2`, [ids.X, controlId])).rows[0].status;
  const setStatus = (controlId, body) => api('ciso', 'patch', `/systems/${ids.X}/controls/${controlId}`).send(body);

  beforeAll(async () => {
    own.O7 = (await query(
      `INSERT INTO controls (title, description, delivery, reference_code) VALUES ('ARCH-O7', 'fixture', 'system', 'ARCH-O7') RETURNING id`)).rows[0].id;
    // Delivered organisation-wide: still a person's to set (v129).
    own.O8 = (await query(
      `INSERT INTO controls (title, description, delivery, reference_code) VALUES ('ARCH-O8', 'fixture', 'organisation', 'ARCH-O8') RETURNING id`)).rows[0].id;
    // Somebody marked both operational by hand; nothing delivers either.
    await query(`INSERT INTO system_controls (system_id, control_id, status) VALUES ($1, $2, 'operational'), ($1, $3, 'operational')`,
      [ids.X, own.O7, own.O8]);
  });

  afterAll(async () => {
    await query(`DELETE FROM system_controls WHERE system_id = $1`, [ids.X]);
  });

  test('marked operational with no security solution at all: it reads missing, and the audit says why', async () => {
    expect((await api('ciso', 'get', `/systems/${ids.X}`)).status).toBe(200);
    expect(await status(own.O7)).toBe('missing');
    const { rows } = await query(
      `SELECT user_id, old_value, new_value, human_narrative FROM audit_log
        WHERE entity_id = $1 AND changes->>'reason' = 'no_security_solution' AND changes->>'control_id' = $2`, [ids.X, own.O7]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: null, old_value: 'operational', new_value: 'missing' });
    expect(rows[0].human_narrative).toMatch(/"ARCH-O7" is now missing \(was operational\) because .*no security solution delivers this objective/);
  });

  test('it cannot be set by hand, and the refusal says what to do', async () => {
    const res = await setStatus(own.O7, { status: 'operational' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('status_follows_solution');
    expect(res.body.error).toMatch(/No security solution delivers this control objective.*not applicable here/);
    expect(await status(own.O7)).toBe('missing');
  });

  test('excluding it here, with a reason, is still a person\'s judgement', async () => {
    expect((await setStatus(own.O7, { status: 'not_applicable', exclusion_reason: 'No capacity concern on this system' })).status).toBe(204);
    await query('SELECT settle_system_security()');
    expect(await status(own.O7)).toBe('not_applicable');
  });

  test('an objective delivered organisation-wide is left alone', async () => {
    await query('SELECT settle_system_security()');
    expect(await status(own.O8)).toBe('operational');
  });

  test('the system\'s control list says how each is delivered', async () => {
    const res = await api('ciso', 'get', `/systems/${ids.X}/controls`);
    expect(res.status).toBe(200);
    expect(res.body.find((c) => c.id === own.O7).delivery).toBe('system');
    expect(res.body.find((c) => c.id === own.O8).delivery).toBe('organisation');
  });
});
