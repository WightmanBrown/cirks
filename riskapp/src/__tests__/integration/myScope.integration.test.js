'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// "Mine" is an OWNERSHIP question; isolation is a PERMISSION one.
//
// With department_isolation OFF — "spreadsheet mode", how CIRKS-test runs while
// its dataset is curated — every list endpoint correctly returns the whole org.
// The dashboard's possessive widgets were calling those endpoints and titling
// the result "My Business Services" / "My Information Assets" / "Systems in my
// remit": an IAO whose department owns 7 services, 5 assets and 4 systems was
// shown 90, 44 and 51.
//
// `?mine=1` asks the second question, and applies the SAME expression the
// isolation branch uses so "mine" cannot come to mean two things by mode.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const { _setDepartmentIsolation } = require('../../auth/permissions');

let otherDept, mySystemId, otherSystemId, sharedSystemId, myAssetId, otherAssetId;

const list = (path, who = 'owner') => request(app).get(path)
  .set('Authorization', `Bearer ${tokenFor(who)}`);

beforeAll(async () => {
  const d = await query(`INSERT INTO departments (name) VALUES ('MYSCOPE Dept') RETURNING id`);
  otherDept = d.rows[0].id;

  const mk = async (name, dept, shared) => (await query(
    `INSERT INTO systems (name, department_id, is_shared) VALUES ($1,$2,$3) RETURNING id`,
    [name, dept, shared])).rows[0].id;
  mySystemId     = await mk('MYSCOPE mine',   IT_DEPT,   false);
  otherSystemId  = await mk('MYSCOPE theirs', otherDept, false);
  sharedSystemId = await mk('MYSCOPE shared', otherDept, true);

  const mka = async (name, dept, shared) => (await query(
    `INSERT INTO information_assets (name, department_id, is_shared, confidentiality, integrity, availability)
     VALUES ($1,$2,$3,3,3,3) RETURNING id`, [name, dept, shared])).rows[0].id;
  myAssetId    = await mka('MYSCOPE asset mine',   IT_DEPT,   false);
  otherAssetId = await mka('MYSCOPE asset theirs', otherDept, false);
});

afterAll(async () => {
  await query(`DELETE FROM information_assets WHERE name LIKE 'MYSCOPE%'`);
  await query(`DELETE FROM systems WHERE name LIKE 'MYSCOPE%'`);
  await query(`DELETE FROM departments WHERE id = $1`, [otherDept]);
  _setDepartmentIsolation(true);
});

describe('with department isolation OFF (spreadsheet mode)', () => {
  beforeAll(() => _setDepartmentIsolation(false));

  // The endpoint is not the bug — this is the correct answer to "what may I see".
  test('the plain list returns the whole org, as designed', async () => {
    const sys = await list('/api/v1/systems');
    expect(sys.status).toBe(200);
    const ids = sys.body.map(s => s.id);
    expect(ids).toEqual(expect.arrayContaining([mySystemId, otherSystemId]));
  });

  test('?mine=1 returns only the caller’s own systems, plus shared', async () => {
    const res = await list('/api/v1/systems?mine=1');
    expect(res.status).toBe(200);
    const ids = res.body.map(s => s.id);
    expect(ids).toContain(mySystemId);
    expect(ids).toContain(sharedSystemId);      // shared IS in your remit
    expect(ids).not.toContain(otherSystemId);
  });

  test('?mine=1 does the same for assets', async () => {
    const all  = (await list('/api/v1/assets')).body.map(a => a.id);
    const mine = (await list('/api/v1/assets?mine=1')).body.map(a => a.id);
    expect(all).toEqual(expect.arrayContaining([myAssetId, otherAssetId]));
    expect(mine).toContain(myAssetId);
    expect(mine).not.toContain(otherAssetId);
  });
});

describe('with department isolation ON', () => {
  beforeAll(() => _setDepartmentIsolation(true));

  // The point of reusing the isolation branch's own expression: switching the
  // flag must not change what "mine" means.
  test('?mine=1 gives the same answer the isolated list already gives', async () => {
    const plain = (await list('/api/v1/systems')).body.map(s => s.id).sort();
    const mine  = (await list('/api/v1/systems?mine=1')).body.map(s => s.id).sort();
    expect(mine).toEqual(plain);
  });
});

test('a cross-department role also gets only its own when it asks for mine', async () => {
  _setDepartmentIsolation(false);
  const all  = (await list('/api/v1/systems', 'ciso')).body.map(s => s.id);
  const mine = (await list('/api/v1/systems?mine=1', 'ciso')).body.map(s => s.id);
  expect(all).toContain(otherSystemId);
  expect(mine).not.toContain(otherSystemId);
});
