'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Creating a system or an asset without naming an owner must assign the
// DEPARTMENT'S Information Asset Owner — not whoever happened to be logged in.
//
// The old rule was `owner_user_id || req.user.id`. On a real instance that put a
// security consultant from Information Security in charge of four of Health's
// clinical systems, and nothing showed it: the list column displays the
// department's IAO regardless of what is stored, so the screen said one name
// while the database held another.
//
// When the department has no IAO the owner is left NULL. An empty owner is
// visibly unfinished; a plausible wrong name is not.

const { query, as, USERS, IT_DEPT } = require('./helpers');

const made = { systems: [], assets: [], users: [], depts: [] };
let iaoLessDept;

beforeAll(async () => {
  const { rows } = await query(
    `INSERT INTO departments (name) VALUES ('ITG owner-defaults no-IAO dept') RETURNING id`);
  iaoLessDept = rows[0].id;
  made.depts.push(iaoLessDept);
});

afterAll(async () => {
  for (const id of made.systems) await query('DELETE FROM systems WHERE id = $1', [id]);
  for (const id of made.assets)  await query('DELETE FROM information_assets WHERE id = $1', [id]);
  for (const id of made.users)   await query('DELETE FROM users WHERE id = $1', [id]);
  for (const id of made.depts)   await query('DELETE FROM departments WHERE id = $1', [id]);
});

const iaoOf = async (deptId) => (await query(
  `SELECT id, full_name FROM users
    WHERE department_id = $1 AND role = 'information_asset_owner' AND is_active = TRUE
    ORDER BY full_name LIMIT 1`, [deptId])).rows[0] || null;

describe('owner defaults to the department IAO', () => {
  test('a system created without an owner gets the department IAO, not its creator', async () => {
    const iao = await iaoOf(IT_DEPT);
    expect(iao).not.toBeNull();                 // fixture sanity: the dept has one

    const res = await as('ciso', 'post', '/api/v1/systems')
      .send({ name: 'ITG owner-default system', department_id: IT_DEPT });
    expect(res.status).toBe(201);
    made.systems.push(res.body.id);

    const { rows } = await query('SELECT owner_user_id FROM systems WHERE id = $1', [res.body.id]);
    expect(rows[0].owner_user_id).toBe(iao.id);
    // The specific regression: NOT the caller.
    expect(rows[0].owner_user_id).not.toBe(USERS.ciso.id);
  });

  test('an explicit owner still wins — this is a default, not a rule', async () => {
    const res = await as('ciso', 'post', '/api/v1/systems')
      .send({ name: 'ITG explicit owner system', department_id: IT_DEPT, owner_user_id: USERS.analyst.id });
    expect(res.status).toBe(201);
    made.systems.push(res.body.id);

    const { rows } = await query('SELECT owner_user_id FROM systems WHERE id = $1', [res.body.id]);
    expect(rows[0].owner_user_id).toBe(USERS.analyst.id);
  });

  test('a department with no IAO leaves the owner NULL rather than guessing', async () => {
    expect(await iaoOf(iaoLessDept)).toBeNull();

    const res = await as('ciso', 'post', '/api/v1/systems')
      .send({ name: 'ITG no-IAO system', department_id: iaoLessDept });
    expect(res.status).toBe(201);
    made.systems.push(res.body.id);

    const { rows } = await query('SELECT owner_user_id FROM systems WHERE id = $1', [res.body.id]);
    expect(rows[0].owner_user_id).toBeNull();
  });

  test('an information asset follows the same rule', async () => {
    const iao = await iaoOf(IT_DEPT);
    const res = await as('ciso', 'post', '/api/v1/assets')
      .send({ name: 'ITG owner-default asset', department_id: IT_DEPT });
    expect(res.status).toBe(201);
    made.assets.push(res.body.id);

    const { rows } = await query('SELECT owner_user_id FROM information_assets WHERE id = $1', [res.body.id]);
    expect(rows[0].owner_user_id).toBe(iao.id);
  });

  test('an inactive IAO is not chosen', async () => {
    // Deactivating the only IAO must fall to NULL, not to a stale pointer.
    const iao = await iaoOf(IT_DEPT);
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [iao.id]);
    try {
      const res = await as('ciso', 'post', '/api/v1/systems')
        .send({ name: 'ITG inactive-IAO system', department_id: IT_DEPT });
      made.systems.push(res.body.id);
      const { rows } = await query('SELECT owner_user_id FROM systems WHERE id = $1', [res.body.id]);
      expect(rows[0].owner_user_id).toBeNull();
    } finally {
      await query('UPDATE users SET is_active = TRUE WHERE id = $1', [iao.id]);
    }
  });
});
