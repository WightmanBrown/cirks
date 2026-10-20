'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// H-15 4a. "Who changed the owner of this system, from whom, to whom" had no
// answer: controllers write directly to tables and audit_log covered only risk
// validate/return, role switches and a few meeting actions. Repairing 11
// mis-assigned owners produced ZERO audit_log rows.
//
// The reason this is a TRIGGER and not controller code is the third test here:
// a change made outside the application is still recorded. Controller-level
// auditing covers the paths someone remembered to instrument, and the case most
// worth catching is the one nobody instrumented.

const { query, withActor, USERS, IT_DEPT } = require('./helpers');

const made = { systems: [], assets: [], services: [] };

afterAll(async () => {
  for (const id of made.systems)  await query('DELETE FROM systems WHERE id = $1', [id]);
  for (const id of made.assets)   await query('DELETE FROM information_assets WHERE id = $1', [id]);
  for (const id of made.services) await query('DELETE FROM business_services WHERE id = $1', [id]);
});

async function mkSystem(name) {
  const { rows } = await query(
    `INSERT INTO systems (name, department_id, is_active) VALUES ($1,$2,TRUE) RETURNING id`,
    [name, IT_DEPT]);
  made.systems.push(rows[0].id); return rows[0].id;
}

const latestFor = async (entityId) => (await query(
  `SELECT * FROM audit_log WHERE entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
  [entityId])).rows[0];

const countFor = async (entityId) => Number((await query(
  'SELECT count(*) AS n FROM audit_log WHERE entity_id = $1', [entityId])).rows[0].n);

describe('accountability changes are audited', () => {
  test('an owner change records who, what, and the before and after', async () => {
    const sys = await mkSystem('ITG audit owner');
    await query('UPDATE systems SET owner_user_id = $1 WHERE id = $2', [USERS.owner.id, sys]);

    const row = await latestFor(sys);
    expect(row.action).toBe('update');
    expect(row.entity_type).toBe('systems');
    expect(row.entity_label).toBe('ITG audit owner');
    expect(row.changes.owner_user_id.from).toBeNull();
    expect(row.changes.owner_user_id.to).toBe(USERS.owner.id);
  });

  test('the acting user is recorded when the app names them', async () => {
    const sys = await mkSystem('ITG audit actor');
    await withActor(USERS.ciso.id, db =>
      db.query('UPDATE systems SET owner_user_id = $1 WHERE id = $2', [USERS.owner.id, sys]));

    const row = await latestFor(sys);
    expect(row.user_id).toBe(USERS.ciso.id);
    expect(row.user_role).toBe('ciso');
    expect(row.human_narrative).toMatch(/\(by /);
  });

  test('THE POINT: a change made outside the application is still recorded', async () => {
    // Raw SQL, no actor — a migration, a repair script, someone in psql.
    // Controller-level auditing cannot see this at all.
    const sys = await mkSystem('ITG audit direct');
    await query('UPDATE systems SET managed_by_user_id = $1 WHERE id = $2', [USERS.iam.id, sys]);

    const row = await latestFor(sys);
    expect(row.user_id).toBeNull();
    expect(row.user_name).toBe('unattributed');
    expect(row.human_narrative).toMatch(/changed outside the application/);
  });

  test('an update that touches nothing accountable writes nothing', async () => {
    // Most updates are renames and descriptions. If those generated audit rows
    // the table would fill with noise and stop being read.
    const sys = await mkSystem('ITG audit noise');
    const before = await countFor(sys);
    await query(`UPDATE systems SET description = 'changed' WHERE id = $1`, [sys]);
    expect(await countFor(sys)).toBe(before);
  });

  test('a no-op update writes nothing', async () => {
    const sys = await mkSystem('ITG audit noop');
    await query('UPDATE systems SET owner_user_id = $1 WHERE id = $2', [USERS.owner.id, sys]);
    const after = await countFor(sys);
    await query('UPDATE systems SET owner_user_id = $1 WHERE id = $2', [USERS.owner.id, sys]);
    expect(await countFor(sys)).toBe(after);
  });

  test('several columns changing at once produce ONE row with a combined diff', async () => {
    // Row-level, not column-level: a bulk change must not write a row per column.
    const sys = await mkSystem('ITG audit combined');
    const before = await countFor(sys);
    await query(
      'UPDATE systems SET owner_user_id = $1, managed_by_user_id = $2 WHERE id = $3',
      [USERS.owner.id, USERS.iam.id, sys]);

    expect(await countFor(sys)).toBe(before + 1);
    const row = await latestFor(sys);
    expect(Object.keys(row.changes).sort()).toEqual(['managed_by_user_id', 'owner_user_id']);
  });

  test('information assets are covered too', async () => {
    const { rows } = await query(
      `INSERT INTO information_assets (name, department_id, is_active)
       VALUES ('ITG audit asset', $1, TRUE) RETURNING id`, [IT_DEPT]);
    made.assets.push(rows[0].id);
    await query('UPDATE information_assets SET owner_user_id = $1 WHERE id = $2',
                [USERS.owner.id, rows[0].id]);
    expect((await latestFor(rows[0].id)).entity_type).toBe('information_assets');
  });

  test('a service records its owning DEPARTMENT — it has no person owner', async () => {
    const { rows } = await query(
      `INSERT INTO business_services (name, department_id, owner_department_id)
       VALUES ('ITG audit service', $1, $1) RETURNING id`, [IT_DEPT]);
    made.services.push(rows[0].id);

    const { rows: d } = await query(
      `INSERT INTO departments (name) VALUES ('ITG audit dept') RETURNING id`);
    await query('UPDATE business_services SET owner_department_id = $1 WHERE id = $2',
                [d[0].id, rows[0].id]);

    const row = await latestFor(rows[0].id);
    expect(row.changes.owner_department_id.to).toBe(d[0].id);

    await query('UPDATE business_services SET owner_department_id = $1 WHERE id = $2', [IT_DEPT, rows[0].id]);
    await query('DELETE FROM departments WHERE id = $1', [d[0].id]);
  });

  test('a malformed actor setting does not block the write it describes', async () => {
    // The audit must never be able to stop the business change.
    const sys = await mkSystem('ITG audit bad actor');
    const client = await require('./helpers').pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('cirks.actor_id', 'not-a-uuid', true)`);
      await client.query('UPDATE systems SET owner_user_id = $1 WHERE id = $2', [USERS.owner.id, sys]);
      await client.query('COMMIT');
    } finally { client.release(); }

    const row = await latestFor(sys);
    expect(row.user_id).toBeNull();          // unattributable, but recorded
    expect(row.changes.owner_user_id.to).toBe(USERS.owner.id);
  });
});

// ── Through the API, which is what actually has to work ────────────────────

describe('changes made through the API are attributed', () => {
  const { as } = require('./helpers');
  const made2 = [];

  afterAll(async () => {
    for (const id of made2) await query('DELETE FROM systems WHERE id = $1', [id]);
  });

  test('PUT /systems names the person who changed the owner', async () => {
    const create = await as('ciso', 'post', '/api/v1/systems')
      .send({ name: 'ITG audit api system', department_id: IT_DEPT });
    expect(create.status).toBe(201);
    made2.push(create.body.id);

    const res = await as('ciso', 'put', `/api/v1/systems/${create.body.id}`)
      .send({ name: 'ITG audit api system', owner_user_id: USERS.analyst.id, is_shared: false });
    expect(res.status).toBe(204);

    const { rows } = await query(
      `SELECT user_id, user_role, changes FROM audit_log
        WHERE entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [create.body.id]);
    expect(rows[0].user_id).toBe(USERS.ciso.id);
    expect(rows[0].user_role).toBe('ciso');
    expect(rows[0].changes.owner_user_id.to).toBe(USERS.analyst.id);
  });

  test('a transfer records the department move against the acting user', async () => {
    const { rows: svc } = await query(
      `INSERT INTO business_services (name, department_id, owner_department_id)
       VALUES ('ITG audit api service', $1, $1) RETURNING id`, [IT_DEPT]);
    const { rows: dept } = await query(
      `INSERT INTO departments (name) VALUES ('ITG audit api dept') RETURNING id`);

    const res = await as('ciso', 'post', `/api/v1/services/${svc[0].id}/transfer`)
      .send({ department_id: dept[0].id });
    expect(res.status).toBe(200);

    const { rows } = await query(
      `SELECT user_id, changes FROM audit_log WHERE entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [svc[0].id]);
    expect(rows[0].user_id).toBe(USERS.ciso.id);
    expect(rows[0].changes.owner_department_id.to).toBe(dept[0].id);

    await query('DELETE FROM business_services WHERE id = $1', [svc[0].id]);
    await query('DELETE FROM departments WHERE id = $1', [dept[0].id]);
  });
});
