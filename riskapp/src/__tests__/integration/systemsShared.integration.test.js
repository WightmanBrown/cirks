'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// PUT /systems/:id must PRESERVE is_shared when the caller does not send it.
//
// The handler wrote `is_shared = $5` with the value `is_shared === true` on
// every update. The system detail page sent only name/description/owner, so the
// field arrived `undefined`, coerced to false, and every ordinary edit silently
// un-shared the system. Nothing surfaced it: the "shared" chip just stopped
// appearing, and the flag is load-bearing — it widens read scope and is what
// lets another department link its own assets into the system, so clearing it
// cuts those departments off with no visible cause.
//
// The test that matters is the omitted-field one; the explicit true/false cases
// pin that the field still WORKS when it is sent, so the fix cannot be "ignore
// is_shared entirely".

const { query, as } = require('./helpers');

const made = { systems: [] };
let dept;

beforeAll(async () => {
  const { rows } = await query(
    `INSERT INTO departments (name) VALUES ('ITG shared-flag Dept') RETURNING id`);
  dept = rows[0].id;
});

afterAll(async () => {
  for (const id of made.systems) await query('DELETE FROM systems WHERE id = $1', [id]);
  if (dept) await query('DELETE FROM departments WHERE id = $1', [dept]);
});

async function mkSystem(name, shared) {
  const { rows } = await query(
    `INSERT INTO systems (name, department_id, is_active, is_shared)
     VALUES ($1,$2,TRUE,$3) RETURNING id`, [name, dept, shared]);
  made.systems.push(rows[0].id);
  return rows[0].id;
}

const sharedOf = async (id) =>
  (await query('SELECT is_shared FROM systems WHERE id = $1', [id])).rows[0].is_shared;

describe('PUT /systems/:id — is_shared', () => {
  test('a shared system stays shared when the field is omitted', async () => {
    const id = await mkSystem('ITG shared-stays', true);

    // Exactly what the detail page sent before this was fixed.
    const res = await as('admin', 'put', `/api/v1/systems/${id}`)
      .send({ name: 'ITG shared-stays renamed', description: 'edited' });

    expect(res.status).toBe(204);
    expect(await sharedOf(id)).toBe(true);
  });

  test('an unshared system stays unshared when the field is omitted', async () => {
    const id = await mkSystem('ITG unshared-stays', false);

    const res = await as('admin', 'put', `/api/v1/systems/${id}`)
      .send({ name: 'ITG unshared-stays renamed' });

    expect(res.status).toBe(204);
    expect(await sharedOf(id)).toBe(false);
  });

  test('sending is_shared:true shares a system', async () => {
    const id = await mkSystem('ITG becomes-shared', false);

    const res = await as('admin', 'put', `/api/v1/systems/${id}`)
      .send({ name: 'ITG becomes-shared', is_shared: true });

    expect(res.status).toBe(204);
    expect(await sharedOf(id)).toBe(true);
  });

  test('sending is_shared:false un-shares a system', async () => {
    const id = await mkSystem('ITG becomes-private', true);

    const res = await as('admin', 'put', `/api/v1/systems/${id}`)
      .send({ name: 'ITG becomes-private', is_shared: false });

    expect(res.status).toBe(204);
    expect(await sharedOf(id)).toBe(false);
  });

  test('POST /systems honours is_shared on create', async () => {
    const res = await as('admin', 'post', '/api/v1/systems')
      .send({ name: 'ITG created-shared', department_id: dept, is_shared: true });

    expect(res.status).toBe(201);
    made.systems.push(res.body.id);
    expect(await sharedOf(res.body.id)).toBe(true);
  });

  test('POST /systems defaults to not shared', async () => {
    const res = await as('admin', 'post', '/api/v1/systems')
      .send({ name: 'ITG created-private', department_id: dept });

    expect(res.status).toBe(201);
    made.systems.push(res.body.id);
    expect(await sharedOf(res.body.id)).toBe(false);
  });
});
