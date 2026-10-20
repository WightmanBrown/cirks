'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// An action that is not about a risk (0133 — docs/assurance-findings.md §5).
//
// Every cross-risk read in routes/actions reached an action's department through
// action → risk → system, so an action about an ASSET was dropped from four
// queues, vanished from the dept-scoped list, and was 403'd on its own detail
// page (`risks.some(...)` over no risks is false). These pin the second path —
// through the subject — and the constraints that keep the two descriptions of an
// action (its subject, its risk links) from disagreeing.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const { _setDepartmentIsolation } = require('../../auth/permissions');

let otherDept;
let itAsset, otherAsset, sharedAsset;
const actions = [];
const assets = [];

async function makeAsset(name, deptId, shared) {
  const r = await query(
    `INSERT INTO information_assets (name, department_id, is_shared) VALUES ($1, $2, $3) RETURNING id`,
    [name, deptId, shared]);
  assets.push(r.rows[0].id);
  return r.rows[0].id;
}

async function makeAssetAction(assetId, title, status = 'proposed', owner = USERS.owner.id) {
  const a = await query(
    `INSERT INTO security_actions (subject_type, subject_id, origin, title, description,
                                   treatment_type, primary_owner_user_id, status)
     VALUES ('asset', $1, 'rating_incomplete', $2, 'rate against every mandatory table',
             'mitigate', $3, $4) RETURNING id`,
    [assetId, title, owner, status]);
  actions.push(a.rows[0].id);
  return a.rows[0].id;
}

const get = (role, path) =>
  request(app).get(`/api/v1${path}`).set('Authorization', `Bearer ${tokenFor(role)}`);

let itAction, otherAction, sharedAction, plannedAction;

beforeAll(async () => {
  const d = await query(`INSERT INTO departments (name) VALUES ('SUBJ Other Dept') RETURNING id`);
  otherDept = d.rows[0].id;
  itAsset     = await makeAsset('SUBJ IT asset',     IT_DEPT,   false);
  otherAsset  = await makeAsset('SUBJ Other asset',  otherDept, false);
  sharedAsset = await makeAsset('SUBJ Shared asset', otherDept, true);

  itAction      = await makeAssetAction(itAsset,     'SUBJ IT action');
  otherAction   = await makeAssetAction(otherAsset,  'SUBJ Other action');
  sharedAction  = await makeAssetAction(sharedAsset, 'SUBJ Shared action');
  // One open action per finding (v134), so each further action needs its own asset.
  plannedAction = await makeAssetAction(await makeAsset('SUBJ IT asset 2', IT_DEPT, false),
                                        'SUBJ planned action', 'planned');
});

afterAll(async () => {
  if (actions.length) await query('DELETE FROM security_actions WHERE id = ANY($1)', [actions]);
  await query('DELETE FROM information_assets WHERE id = ANY($1)', [assets]);
  if (otherDept) await query('DELETE FROM departments WHERE id = $1', [otherDept]);
  _setDepartmentIsolation(true);
});

describe('the database keeps subject, origin and risk links consistent', () => {
  const insert = (subjectType, subjectId, origin) => query(
    `INSERT INTO security_actions (subject_type, subject_id, origin, title, description,
                                   treatment_type, primary_owner_user_id, status)
     VALUES ($1, $2, $3, 'SUBJ bad', 'x', 'mitigate', $4, 'proposed') RETURNING id`,
    [subjectType, subjectId, origin, USERS.owner.id]);

  test('an action must say what it is about — there is no default', async () => {
    await expect(query(
      `INSERT INTO security_actions (title, description, treatment_type, primary_owner_user_id, status)
       VALUES ('SUBJ none', 'x', 'mitigate', $1, 'proposed')`, [USERS.owner.id]))
      .rejects.toThrow(/subject_type/);
  });

  test('a risk action names no subject row; its risks live in security_action_risks', async () => {
    await expect(insert('risk', itAsset, 'risk_treatment')).rejects.toThrow(/chk_sa_subject_id/);
  });

  test('an asset action must name its asset', async () => {
    await expect(insert('asset', null, 'rating_incomplete')).rejects.toThrow(/chk_sa_subject_id/);
  });

  test('risk treatment is only ever about a risk, and a finding is never about one', async () => {
    await expect(insert('asset', itAsset, 'risk_treatment')).rejects.toThrow(/chk_sa_origin_matches_subject/);
    await expect(insert('risk', null, 'rating_incomplete')).rejects.toThrow(/chk_sa_origin_matches_subject/);
  });

  test('an incomplete rating is a finding about an ASSET, not a system', async () => {
    const sys = await query(`SELECT id FROM systems LIMIT 1`);
    await expect(insert('system', sys.rows[0].id, 'rating_incomplete'))
      .rejects.toThrow(/chk_sa_origin_matches_subject/);
  });

  test('an action about an asset cannot also be linked to a risk', async () => {
    const r = await query(`SELECT id FROM risks WHERE is_active LIMIT 1`);
    await expect(query(
      `INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1, $2)`, [itAction, r.rows[0].id]))
      .rejects.toThrow(/not about a risk/);
  });
});

describe('an action about an asset is visible where a risk action would be', () => {
  test('it reaches the acceptance queue, with its subject named and no risk', async () => {
    const res = await get('ciso', '/actions/acceptance-queue');
    expect(res.status).toBe(200);
    const row = res.body.actions.find(a => a.action_id === itAction);
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      subject_type: 'asset', subject_id: itAsset, origin: 'rating_incomplete',
      subject_name: 'SUBJ IT asset', risk_id: null,
    });
  });

  test('it counts in the SAP figures for its own department, and not for another', async () => {
    _setDepartmentIsolation(true);
    const before = (await get('iam', '/actions/stats')).body;
    const extra = await makeAssetAction(await makeAsset('SUBJ IT asset 3', IT_DEPT, false), 'SUBJ counted');
    const after = (await get('iam', '/actions/stats')).body;
    expect(Number(after.awaiting_acceptance)).toBe(Number(before.awaiting_acceptance) + 1);

    const elsewhere = await makeAssetAction(await makeAsset('SUBJ Other asset 2', otherDept, false), 'SUBJ not counted');
    const again = (await get('iam', '/actions/stats')).body;
    expect(again.awaiting_acceptance).toBe(after.awaiting_acceptance);
    expect(extra && elsewhere).toBeTruthy();
  });

  test('its owner sees it in their in-progress list, and so does the secretary', async () => {
    const mine = await get('owner', '/actions/my-inprogress');
    expect(mine.status).toBe(200);
    expect(mine.body.actions.map(a => a.id)).toContain(plannedAction);

    const org = await get('secretary', '/actions/org-inprogress');
    expect(org.status).toBe(200);
    const row = org.body.actions.find(a => a.id === plannedAction);
    expect(row).toMatchObject({ subject_type: 'asset', subject_name: 'SUBJ IT asset 2', risk_id: null });
  });
});

describe('department scoping follows the subject when there is no risk', () => {
  test('the IAM of the asset\'s department can open it (was 403: .some() over no risks)', async () => {
    _setDepartmentIsolation(true);
    const res = await get('iam', `/actions/${itAction}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subject_type: 'asset', subject_id: itAsset, risks: [] });
  });

  test('another department\'s asset action is refused; a shared asset\'s is not', async () => {
    _setDepartmentIsolation(true);
    expect((await get('iam', `/actions/${otherAction}`)).status).toBe(403);
    expect((await get('owner', `/actions/${otherAction}`)).status).toBe(403);
    expect((await get('iam', `/actions/${sharedAction}`)).status).toBe(200);
    expect((await get('ciso', `/actions/${otherAction}`)).status).toBe(200);
  });

  test('the dept-scoped list carries own-department and shared asset actions only', async () => {
    _setDepartmentIsolation(true);
    const ids = (await get('owner', '/actions')).body.actions.map(a => a.id);
    expect(ids).toEqual(expect.arrayContaining([itAction, sharedAction]));
    expect(ids).not.toContain(otherAction);

    const all = (await get('ciso', '/actions')).body.actions.map(a => a.id);
    expect(all).toEqual(expect.arrayContaining([itAction, otherAction, sharedAction]));
  });

  test('with isolation OFF a dept-scoped role reads any of them', async () => {
    _setDepartmentIsolation(false);
    expect((await get('owner', `/actions/${otherAction}`)).status).toBe(200);
  });
});
