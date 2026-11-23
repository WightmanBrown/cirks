'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Applying a standard build (docs/system-patterns.md, owner 2026-11-18):
//   21  a build whose pattern differs from the system's is refused, naming both;
//   22  a system with no pattern is offered the build's, set only when confirmed;
//   24  a build that would answer a once-only question again (a second operating
//       system, a second place it runs) is applied only once the person confirms.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set({ Authorization: `Bearer ${tokenFor(role)}` });
const ids = {};

const comp = async (name, roles) => (await query(
  `INSERT INTO control_components (component_type, name, status, instantiation, roles, created_by)
   VALUES ('technology', $1, 'operational', 'per_system', $2, $3) RETURNING id`,
  [name, roles, USERS.admin.id])).rows[0].id;

async function build(name, components, pattern = null) {
  const id = (await query(`INSERT INTO system_builds (name, created_by, system_pattern) VALUES ($1, $2, $3) RETURNING id`,
    [name, USERS.admin.id, pattern])).rows[0].id;
  for (const c of components) await query(`INSERT INTO system_build_components (build_id, component_id) VALUES ($1, $2)`, [id, c]);
  return id;
}

beforeAll(async () => {
  ids.S1 = (await query(`INSERT INTO systems (name, department_id, owner_user_id, system_pattern) VALUES ('OVL S1 system', $1, $2, 'S1') RETURNING id`,
    [IT_DEPT, USERS.owner.id])).rows[0].id;
  ids.S5 = (await query(`INSERT INTO systems (name, department_id, owner_user_id, system_pattern) VALUES ('OVL S5 network', $1, $2, 'S5') RETURNING id`,
    [IT_DEPT, USERS.owner.id])).rows[0].id;
  ids.WIN   = await comp('OVL Windows', ['operating_system']);
  ids.LINUX = await comp('OVL Linux', ['operating_system']);
  ids.ROOM  = await comp('OVL Server room', ['hosting']);
  ids.TEAM  = await comp('OVL Second support team', ['support_team']);
  ids.winBuild   = await build('OVL Windows build', [ids.WIN, ids.ROOM]);
  ids.linuxBuild = await build('OVL Linux build', [ids.LINUX, ids.ROOM, ids.TEAM]);
  ids.teamBuild  = await build('OVL Team only build', [ids.TEAM]);
  ids.cloudBuild = await build('OVL Cloud build', [ids.TEAM], 'S7');
  ids.onPremBuild = await build('OVL On premises build', [ids.TEAM], 'S1');
  ids.NONE = (await query(`INSERT INTO systems (name, department_id, owner_user_id) VALUES ('OVL no pattern', $1, $2) RETURNING id`,
    [IT_DEPT, USERS.owner.id])).rows[0].id;
  for (const s of [ids.S1, ids.S5]) {
    await query(`INSERT INTO system_components (system_id, component_id, status) VALUES ($1, $2, 'operational'), ($1, $3, 'operational')`,
      [s, ids.WIN, ids.ROOM]);
  }
});

afterAll(async () => {
  const systems = [ids.S1, ids.S5, ids.NONE];
  await query(`DELETE FROM system_components WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_controls WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_solution_choices WHERE system_id = ANY($1)`, [systems]);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [systems]);
  await query(`DELETE FROM system_builds WHERE name LIKE 'OVL%'`);
  await query(`DELETE FROM control_components WHERE name LIKE 'OVL%'`);
  await query(`DELETE FROM systems WHERE id = ANY($1)`, [systems]);
});

describe('a second build that answers a once-only question again', () => {
  test('the preview names the question, what is recorded and what would be added', async () => {
    const res = await api('ciso', 'get', `/systems/${ids.S1}/builds/${ids.linuxBuild}/apply`);
    expect(res.status).toBe(200);
    // The server room is already on the system, so it is no second answer.
    expect(res.body.overlaps).toEqual([{
      slot: 'operating_system', label: 'Operating system',
      recorded: [{ id: ids.WIN, name: 'OVL Windows' }], adding: [{ id: ids.LINUX, name: 'OVL Linux' }],
    }]);
  });

  test('applying without confirming is refused, naming the question, and changes nothing', async () => {
    const res = await api('ciso', 'post', `/systems/${ids.S1}/builds/${ids.linuxBuild}/apply`).send({ status: 'operational' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('build_overlaps');
    expect(res.body.error).toMatch(/second answer to "Operating system"/);
    expect(res.body.overlaps).toHaveLength(1);
    const { rowCount } = await query(`SELECT 1 FROM system_components WHERE system_id = $1 AND component_id = ANY($2)`,
      [ids.S1, [ids.LINUX, ids.TEAM]]);
    expect(rowCount).toBe(0);
  });

  test('confirmed, it is applied and the audit says what was confirmed', async () => {
    const res = await api('ciso', 'post', `/systems/${ids.S1}/builds/${ids.linuxBuild}/apply`)
      .send({ status: 'operational', confirm_overlap: true });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ added: 2, already: 1 });
    const { rows } = await query(`SELECT human_narrative FROM audit_log WHERE entity_id = $1 AND entity_type = 'system_security'`, [ids.S1]);
    expect(rows.map((r) => r.human_narrative).join('\n'))
      .toMatch(/confirmed a second answer to "Operating system": OVL Linux beside OVL Windows/);
  });
});

describe('no warning where several answers are normal', () => {
  test('a build adding only a second support team applies without confirming', async () => {
    await query(`DELETE FROM system_components WHERE system_id = $1 AND component_id = $2`, [ids.S1, ids.TEAM]);
    const preview = await api('ciso', 'get', `/systems/${ids.S1}/builds/${ids.teamBuild}/apply`);
    expect(preview.body.overlaps).toEqual([]);
    expect((await api('ciso', 'post', `/systems/${ids.S1}/builds/${ids.teamBuild}/apply`).send({ status: 'operational' })).status).toBe(201);
  });

  test('network infrastructure (S5) may run more than one operating system', async () => {
    const res = await api('ciso', 'get', `/systems/${ids.S5}/builds/${ids.linuxBuild}/apply`);
    expect(res.status).toBe(200);
    expect(res.body.overlaps).toEqual([]);
  });

  test('a system with no pattern is still asked about a second operating system', async () => {
    await query(`UPDATE systems SET system_pattern = NULL WHERE id = $1`, [ids.S5]);
    const res = await api('ciso', 'get', `/systems/${ids.S5}/builds/${ids.linuxBuild}/apply`);
    expect(res.body.overlaps.map((o) => o.slot)).toEqual(['operating_system']);
  });
});

describe('the build\'s pattern against the system\'s (decisions 21 and 22)', () => {
  test('the preview says how the patterns compare', async () => {
    const same = await api('ciso', 'get', `/systems/${ids.S1}/builds/${ids.onPremBuild}/apply`);
    expect(same.body.pattern).toMatchObject({ state: 'match', build: { code: 'S1' }, system: { code: 'S1' } });
    const none = await api('ciso', 'get', `/systems/${ids.S1}/builds/${ids.teamBuild}/apply`);
    expect(none.body.pattern).toMatchObject({ state: 'build_none', build: null });
  });

  test('a build following another pattern is refused, naming both, and changes nothing', async () => {
    await query(`DELETE FROM system_components WHERE system_id = $1 AND component_id = $2`, [ids.S1, ids.TEAM]);
    const preview = await api('ciso', 'get', `/systems/${ids.S1}/builds/${ids.cloudBuild}/apply`);
    expect(preview.body.pattern.state).toBe('mismatch');
    const res = await api('ciso', 'post', `/systems/${ids.S1}/builds/${ids.cloudBuild}/apply`)
      .send({ status: 'operational', confirm_overlap: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('pattern_mismatch');
    expect(res.body.error).toMatch(/follows S7 .*this system follows S1/);
    expect((await query(`SELECT 1 FROM system_components WHERE system_id = $1 AND component_id = $2`, [ids.S1, ids.TEAM])).rowCount).toBe(0);
  });

  test('a system with no pattern is offered the build\'s; declined, the pattern stays unstated', async () => {
    const preview = await api('ciso', 'get', `/systems/${ids.NONE}/builds/${ids.cloudBuild}/apply`);
    expect(preview.body.pattern).toMatchObject({ state: 'offer', build: { code: 'S7' }, system: null });
    const res = await api('ciso', 'post', `/systems/${ids.NONE}/builds/${ids.cloudBuild}/apply`).send({ status: 'operational' });
    expect(res.status).toBe(201);
    expect(res.body.system_pattern).toBeUndefined();
    expect((await query(`SELECT system_pattern FROM systems WHERE id = $1`, [ids.NONE])).rows[0].system_pattern).toBeNull();
  });

  test('confirmed, the build\'s pattern is set and audited with the system\'s pattern history', async () => {
    await query(`DELETE FROM system_components WHERE system_id = $1`, [ids.NONE]);
    const res = await api('ciso', 'post', `/systems/${ids.NONE}/builds/${ids.cloudBuild}/apply`)
      .send({ status: 'operational', set_pattern: true });
    expect(res.status).toBe(201);
    expect(res.body.system_pattern).toBe('S7');
    expect((await query(`SELECT system_pattern FROM systems WHERE id = $1`, [ids.NONE])).rows[0].system_pattern).toBe('S7');
    const { rows } = await query(`SELECT human_narrative FROM audit_log WHERE entity_id = $1 AND entity_type = 'system'`, [ids.NONE]);
    expect(rows.map((r) => r.human_narrative)).toContain(
      'System "OVL no pattern": pattern not stated → S7 Application on cloud infrastructure (IaaS), from the standard build "OVL Cloud build"');
  });
});
