'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /systems reports each row's VIEWER STAKE — how many active information
// assets the caller's own department holds in that system. The dashboard's
// "Systems in my remit" widget is built on it.
//
// It exists because the widget used to scope on `own department OR is_shared`,
// which put every shared system in the estate on every IAM's dashboard whether
// or not their department had anything in it: one IAM was told she had 19
// systems, owning 4 and holding information in 5 more. A shared system being
// AVAILABLE to you is not the same as your information being in it.

const { query, as, IT_DEPT, USERS } = require('./helpers');

const made = { systems: [], assets: [] };
let otherDept;

beforeAll(async () => {
  const { rows } = await query(
    `INSERT INTO departments (name) VALUES ('ITG remit Other Dept') RETURNING id`);
  otherDept = rows[0].id;
});

afterAll(async () => {
  for (const id of made.systems) await query('DELETE FROM systems WHERE id = $1', [id]);
  for (const id of made.assets)  await query('DELETE FROM information_assets WHERE id = $1', [id]);
  if (otherDept) await query('DELETE FROM departments WHERE id = $1', [otherDept]);
});

async function mkSystem(name, dept, shared = false) {
  const { rows } = await query(
    `INSERT INTO systems (name, department_id, is_active, is_shared)
     VALUES ($1,$2,TRUE,$3) RETURNING id`, [name, dept, shared]);
  made.systems.push(rows[0].id); return rows[0].id;
}
async function mkAsset(name, dept, shared = false) {
  const { rows } = await query(
    `INSERT INTO information_assets (name, department_id, confidentiality, integrity, availability, is_active, is_shared)
     VALUES ($1,$2,3,3,3,TRUE,$3) RETURNING id`, [name, dept, shared]);
  made.assets.push(rows[0].id); return rows[0].id;
}
const rowFor = async (id, who = 'iam') =>
  (await as(who, 'get', '/api/v1/systems')).body.find((s) => s.id === id);

describe('GET /systems — viewer_asset_count', () => {
  let ownEmpty, sharedWithStake, sharedEmpty;

  beforeAll(async () => {
    // The IAM's own department owns this, but nothing is in it.
    ownEmpty = await mkSystem('ITG remit own-empty', IT_DEPT);

    // Another department's shared system holding the IAM's information.
    sharedWithStake = await mkSystem('ITG remit shared-stake', otherDept, true);
    const mine = await mkAsset('ITG remit mine', IT_DEPT);
    await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sharedWithStake, mine]);

    // Another department's shared system holding only THEIR information — the
    // ten systems that were being counted as the IAM's.
    sharedEmpty = await mkSystem('ITG remit shared-empty', otherDept, true);
    const theirs = await mkAsset('ITG remit theirs', otherDept);
    await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sharedEmpty, theirs]);
  });

  test('a shared system holding the viewer\'s information reports a stake', async () => {
    expect((await rowFor(sharedWithStake)).viewer_asset_count).toBe(1);
  });

  test('a shared system holding only another department\'s information reports zero', async () => {
    expect((await rowFor(sharedEmpty)).viewer_asset_count).toBe(0);
  });

  test('an owned but empty system reports zero — ownership is a separate reason to care', async () => {
    const row = await rowFor(ownEmpty);
    expect(row.viewer_asset_count).toBe(0);
    expect(row.department_id).toBe(IT_DEPT);
  });

  test('the stake is per VIEWER: the same row reads differently for another department', async () => {
    // The CISO sits in a different department from the seed IAM, so the same
    // shared system reports a different stake. A single figure baked into the
    // row would have to be wrong for somebody.
    const asIam  = await rowFor(sharedWithStake, 'iam');
    const asCiso = await rowFor(sharedWithStake, 'ciso');
    const ciso   = (await query('SELECT department_id FROM users WHERE id = $1', [USERS.ciso.id])).rows[0];
    if (ciso.department_id !== IT_DEPT) {
      expect(asIam.viewer_asset_count).toBe(1);
      expect(asCiso.viewer_asset_count).toBe(0);
    }
  });

  test('a shared ASSET counts for every department, as it does everywhere else', async () => {
    const sys = await mkSystem('ITG remit shared-asset-sys', otherDept, true);
    const shared = await mkAsset('ITG remit shared asset', otherDept, true);
    await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sys, shared]);
    expect((await rowFor(sys)).viewer_asset_count).toBe(1);
  });
});
