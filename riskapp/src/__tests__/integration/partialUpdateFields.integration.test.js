'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Fields an update must NOT silently rewrite when the caller omits them.
//
// Three instances of one bug class, found together while checking whether the
// systems is_shared bug had siblings:
//
//   1. information_assets.is_shared was never writable at ALL — neither POST nor
//      PUT touched it — so every asset sat at the column default and the
//      `OR ia.is_shared` branch in the scoping and service-impact rules was
//      unreachable in production.
//   2. PUT /assets/:id bound `is_active ?? true`, so a caller that omitted the
//      field REACTIVATED a deactivated asset.
//   3. PUT /services/:id assigned managed_by_user_id unconditionally while
//      COALESCEing every other column, so an omitted field CLEARED the manager.
//
// The manager case is the interesting one: the column is nullable and NULL is a
// value a user can legitimately choose ("no manager"), so absent and
// explicitly-null must stay distinguishable. Both are pinned below.

const { query, as } = require('./helpers');

const made = { assets: [], services: [] };
let dept;
let someUser;

beforeAll(async () => {
  const { rows } = await query(
    `INSERT INTO departments (name) VALUES ('ITG partial-update Dept') RETURNING id`);
  dept = rows[0].id;
  const { rows: u } = await query('SELECT id FROM users WHERE is_active = TRUE LIMIT 1');
  someUser = u[0].id;
});

afterAll(async () => {
  for (const id of made.assets)   await query('DELETE FROM information_assets WHERE id = $1', [id]);
  for (const id of made.services) await query('DELETE FROM business_services WHERE id = $1', [id]);
  if (dept) await query('DELETE FROM departments WHERE id = $1', [dept]);
});

async function mkAsset({ shared = false, active = true } = {}) {
  const { rows } = await query(
    `INSERT INTO information_assets (name, department_id, is_active, is_shared)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [`ITG asset ${Math.random().toString(36).slice(2, 9)}`, dept, active, shared]);
  made.assets.push(rows[0].id);
  return rows[0].id;
}

const assetRow = async (id) =>
  (await query('SELECT is_active, is_shared FROM information_assets WHERE id = $1', [id])).rows[0];

const serviceRow = async (id) =>
  (await query('SELECT managed_by_user_id FROM business_services WHERE id = $1', [id])).rows[0];

// The minimum PUT /assets/:id accepts — both name and department_id are
// required. The name is randomised because information_assets carries
// UNIQUE (department_id, name) and every case here writes to the same
// department; a fixed name makes the second update a constraint violation.
const assetPut = (id, extra = {}) =>
  as('admin', 'put', `/api/v1/assets/${id}`)
    .send({ name: `ITG renamed ${Math.random().toString(36).slice(2, 9)}`,
            department_id: dept, ...extra });

describe('PUT /assets/:id — is_shared', () => {
  test('a shared asset stays shared when the field is omitted', async () => {
    const id = await mkAsset({ shared: true });
    expect((await assetPut(id)).status).toBe(204);
    expect((await assetRow(id)).is_shared).toBe(true);
  });

  test('is_shared:true shares an asset', async () => {
    const id = await mkAsset({ shared: false });
    expect((await assetPut(id, { is_shared: true })).status).toBe(204);
    expect((await assetRow(id)).is_shared).toBe(true);
  });

  test('is_shared:false un-shares an asset', async () => {
    const id = await mkAsset({ shared: true });
    expect((await assetPut(id, { is_shared: false })).status).toBe(204);
    expect((await assetRow(id)).is_shared).toBe(false);
  });
});

describe('POST /assets — is_shared', () => {
  test('honours is_shared on create', async () => {
    const res = await as('admin', 'post', '/api/v1/assets')
      .send({ name: 'ITG created-shared asset', department_id: dept, is_shared: true });
    expect(res.status).toBe(201);
    made.assets.push(res.body.id);
    expect((await assetRow(res.body.id)).is_shared).toBe(true);
  });

  test('defaults to not shared', async () => {
    const res = await as('admin', 'post', '/api/v1/assets')
      .send({ name: 'ITG created-private asset', department_id: dept });
    expect(res.status).toBe(201);
    made.assets.push(res.body.id);
    expect((await assetRow(res.body.id)).is_shared).toBe(false);
  });

  test('GET /assets/:id returns is_shared, so an edit form can seed the control', async () => {
    const id = await mkAsset({ shared: true });
    const res = await as('admin', 'get', `/api/v1/assets/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.is_shared).toBe(true);
  });
});

describe('PUT /assets/:id — is_active', () => {
  test('a deactivated asset is NOT reactivated when the field is omitted', async () => {
    const id = await mkAsset({ active: false });
    expect((await assetPut(id)).status).toBe(204);
    expect((await assetRow(id)).is_active).toBe(false);
  });

  test('is_active:false still deactivates', async () => {
    const id = await mkAsset({ active: true });
    expect((await assetPut(id, { is_active: false })).status).toBe(204);
    expect((await assetRow(id)).is_active).toBe(false);
  });

  test('is_active:true still reactivates', async () => {
    const id = await mkAsset({ active: false });
    expect((await assetPut(id, { is_active: true })).status).toBe(204);
    expect((await assetRow(id)).is_active).toBe(true);
  });
});

describe('PUT /services/:id — managed_by_user_id', () => {
  async function mkService() {
    const res = await as('admin', 'post', '/api/v1/services')
      .send({ name: `ITG service ${Math.random().toString(36).slice(2, 9)}`,
              department_id: dept, managed_by_user_id: someUser });
    made.services.push(res.body.id);
    return res.body.id;
  }

  test('the manager survives an update that omits the field', async () => {
    const id = await mkService();
    expect((await serviceRow(id)).managed_by_user_id).toBe(someUser);

    const res = await as('admin', 'put', `/api/v1/services/${id}`)
      .send({ name: 'ITG service renamed' });

    expect(res.status).toBe(200);
    expect((await serviceRow(id)).managed_by_user_id).toBe(someUser);
  });

  test('an explicit null still CLEARS the manager', async () => {
    const id = await mkService();

    const res = await as('admin', 'put', `/api/v1/services/${id}`)
      .send({ name: 'ITG service unassigned', managed_by_user_id: null });

    expect(res.status).toBe(200);
    expect((await serviceRow(id)).managed_by_user_id).toBeNull();
  });

  test('a new manager is still assignable', async () => {
    const id = await mkService();
    await as('admin', 'put', `/api/v1/services/${id}`)
      .send({ name: 'ITG service cleared', managed_by_user_id: null });

    const res = await as('admin', 'put', `/api/v1/services/${id}`)
      .send({ name: 'ITG service reassigned', managed_by_user_id: someUser });

    expect(res.status).toBe(200);
    expect((await serviceRow(id)).managed_by_user_id).toBe(someUser);
  });
});
