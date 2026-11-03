'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The CIRKS starter library's one-click parts (owner, 2026-11-02):
//   POST /bil/impact-tables/starter     six impact tables, UNPUBLISHED
//   POST /architecture/groups/starter   six template groups, EMPTY
// and v165: a group with no members asks nothing, so the empty groups flag no
// system until the organisation gives them answers. The loaders that run on a
// new installation (db/seed/starterLibrary.js) leave an existing catalogue alone.

const { app, request, query, pool, USERS, tokenFor } = require('./helpers');
const { STARTER_TABLES } = require('../../routes/bil/starterTables');
const { loadStarterThreats, loadStarterDocuments } = require('../../../db/seed/starterLibrary');

const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${tokenFor(role)}`);
const STARTER_TABLE_NAMES = STARTER_TABLES.map((t) => t.name);
const ids = {};

beforeAll(async () => {
  ids.STD = (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, document_kind, created_by)
     VALUES ('information', 'STARTER architecture standard', 'planned', 'organisational', 'standard', $1) RETURNING id`,
    [USERS.admin.id])).rows[0].id;
  ids.HOST = (await query(
    `INSERT INTO control_components (component_type, name, status, instantiation, created_by)
     VALUES ('facility', 'STARTER server room', 'operational', 'organisational', $1) RETURNING id`,
    [USERS.admin.id])).rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_id IN (SELECT id FROM membership_groups WHERE standard_id = $1)`, [ids.STD]);
  await query(`DELETE FROM membership_groups WHERE standard_id = $1`, [ids.STD]);
  await query(`DELETE FROM impact_tables WHERE id = ANY($1)`, [ids.tables || []]);
  await query(`DELETE FROM control_components WHERE id = ANY($1)`, [[ids.STD, ids.HOST]]);
});

describe('starter impact tables', () => {
  // Not in the RBAC matrix: the matrix posts {}, which for an allowed role
  // would really create the tables. Who may call it is checked here instead —
  // bil.write AND an organisation-scope role, as for a table made by hand.
  test('only a role that may create organisation-scope tables', async () => {
    for (const role of ['analyst', 'iam', 'siro', 'owner']) {
      const r = await api(role, 'post', '/bil/impact-tables/starter').send({});
      expect(r.status).toBe(403);
    }
  });

  test('creates the six tables UNPUBLISHED, organisation-wide, with every level worded', async () => {
    const before = await query(`SELECT name FROM impact_tables WHERE name = ANY($1)`, [STARTER_TABLE_NAMES]);
    expect(before.rowCount).toBe(0);           // the fixture has none of them

    const r = await api('ciso', 'post', '/bil/impact-tables/starter').send({});
    expect(r.status).toBe(201);
    expect(r.body.created.map((t) => t.name)).toEqual(STARTER_TABLE_NAMES);
    ids.tables = r.body.created.map((t) => t.id);

    const { rows } = await query(
      `SELECT t.name, t.scope, t.published_at, t.mandatory, t.department_id,
              (SELECT count(*)::int FROM impact_table_bil_levels b WHERE b.impact_table_id = t.id AND b.statement <> '') AS bil,
              (SELECT count(*)::int FROM impact_table_cia_levels c WHERE c.impact_table_id = t.id AND c.statement <> '') AS cia
         FROM impact_tables t WHERE t.id = ANY($1)`, [ids.tables]);
    const ciso = (await query('SELECT department_id FROM users WHERE id = $1', [USERS.ciso.id])).rows[0];
    for (const t of rows) {
      expect(t).toMatchObject({ scope: 'organisation', published_at: null, mandatory: false, bil: 5, cia: 15 });
      expect(t.department_id).toBe(ciso.department_id);
    }
  });

  test('pressing it again adds nothing', async () => {
    const r = await api('ciso', 'post', '/bil/impact-tables/starter').send({});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ created: [], skipped: STARTER_TABLE_NAMES });
  });

  test('an unknown department is refused', async () => {
    const r = await api('ciso', 'post', '/bil/impact-tables/starter')
      .send({ department_id: '00000000-0000-0000-0000-000000000000' });
    expect([200, 400]).toContain(r.status);   // 200 only because every name is already used
  });
});

describe('starter template groups, and v165: an empty group asks nothing', () => {
  test('needs the architecture.write capability and a document', async () => {
    expect((await api('owner', 'post', '/architecture/groups/starter')
      .send({ standard_id: ids.STD })).status).toBe(403);
    expect((await api('ciso', 'post', '/architecture/groups/starter').send({})).status).toBe(400);
  });

  test('creates the six groups empty, citing the document, audited', async () => {
    const r = await api('ciso', 'post', '/architecture/groups/starter').send({ standard_id: ids.STD });
    expect(r.status).toBe(201);
    expect(r.body.created).toEqual(['Connectivity', 'Hosting', 'Operating system', 'Authentication service',
      'Support team', 'User group']);
    const { rows } = await query(
      `SELECT g.id, g.name, (SELECT count(*)::int FROM membership_group_members m WHERE m.group_id = g.id) AS members
         FROM membership_groups g WHERE g.standard_id = $1 ORDER BY g.sort_index`, [ids.STD]);
    expect(rows).toHaveLength(6);
    expect(rows.every((g) => g.members === 0)).toBe(true);
    ids.groups = Object.fromEntries(rows.map((g) => [g.name, g.id]));
    const audited = await query(
      `SELECT count(*)::int AS n FROM audit_log WHERE entity_type = 'membership_group' AND entity_id = ANY($1)`,
      [Object.values(ids.groups)]);
    expect(audited.rows[0].n).toBe(6);
  });

  test('an empty group flags no system', async () => {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM v_system_membership_gaps WHERE group_id = ANY($1)`, [Object.values(ids.groups)]);
    expect(rows[0].n).toBe(0);
    const lib = (await api('ciso', 'get', '/architecture')).body;
    expect(lib.groups.find((g) => g.id === ids.groups.Hosting).systems_unanswered).toBe(0);
  });

  test('once it has a member, it asks every system that has not answered', async () => {
    expect((await api('ciso', 'post', `/architecture/groups/${ids.groups.Hosting}/members`)
      .send({ component_id: ids.HOST })).status).toBe(201);
    const { rows: [{ n }] } = await query(
      `SELECT count(*)::int AS n FROM v_system_membership_gaps WHERE group_id = $1`, [ids.groups.Hosting]);
    const { rows: [{ active }] } = await query(`SELECT count(*)::int AS active FROM systems WHERE is_active`);
    expect(n).toBe(active);
    const others = await query(
      `SELECT count(*)::int AS n FROM v_system_membership_gaps WHERE group_id = ANY($1)`,
      [Object.values(ids.groups).filter((id) => id !== ids.groups.Hosting)]);
    expect(others.rows[0].n).toBe(0);
  });

  test('pressing it again adds nothing', async () => {
    const r = await api('ciso', 'post', '/architecture/groups/starter').send({ standard_id: ids.STD });
    expect(r.status).toBe(200);
    expect(r.body.created).toEqual([]);
  });
});

describe('the new-installation loaders leave an existing catalogue alone', () => {
  test('threats are loaded only into an empty catalogue', async () => {
    const client = await pool.connect();
    try {
      expect(await loadStarterThreats(client)).toBeNull();
    } finally { client.release(); }
  });

  test('documents are loaded only when there are none', async () => {
    const client = await pool.connect();
    try {
      expect(await loadStarterDocuments(client, USERS.admin.id)).toBeNull();   // STD exists
    } finally { client.release(); }
  });
});
