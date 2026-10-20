'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// RACI read-scoping for the security-actions list + detail endpoints
// (GET /actions, GET /actions/:id). The rbacMatrix asserts status codes only and
// cannot catch a cross-department data leak — these tests assert the actual rows.
//
// Model: a dept-scoped role (IAO/IAM) may read an action only when it sits on a
// risk whose owning system is in their department OR on a shared system. Global
// roles (CISO) see everything. Mirrors GET /risks/:id, reusing isDeptScoped +
// the shared-system carve-out.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const { _setDepartmentIsolation } = require('../../auth/permissions');

const THREAT = '33333333-0000-0000-0000-000000000001'; // seed: Unpatched Software Exploit

let otherDept;
let itSysId, otherSysId, sharedSysId;
let itRiskId, otherRiskId, sharedRiskId;
let itActionId, otherActionId, sharedActionId;

async function makeSystem(name, deptId, shared) {
  const r = await query(
    `INSERT INTO systems (name, department_id, is_shared) VALUES ($1, $2, $3) RETURNING id`,
    [name, deptId, shared]
  );
  return r.rows[0].id;
}

async function makeRisk(systemId) {
  const r = await query(
    // No owner column (v108): a risk belongs to the department that owns its
    // system, so the scope under test comes from systemId alone.
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1, $2, 3, 3, 3, 1, 'ACT-SCOPE risk', 'validated') RETURNING id`,
    [systemId, THREAT]
  );
  return r.rows[0].id;
}

async function makeAction(riskId, title) {
  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type, primary_owner_user_id, status)
     VALUES ('risk', 'risk_treatment', $1, 'ACT-SCOPE action', 'mitigate', $2, 'planned') RETURNING id`,
    [title, USERS.analyst.id]
  );
  const actionId = a.rows[0].id;
  await query(
    `INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1, $2)`,
    [actionId, riskId]
  );
  return actionId;
}

beforeAll(async () => {
  const d = await query(`INSERT INTO departments (name) VALUES ('ACT Scope Dept') RETURNING id`);
  otherDept = d.rows[0].id;

  itSysId     = await makeSystem('ACT IT Sys',     IT_DEPT,   false);
  otherSysId  = await makeSystem('ACT Other Sys',  otherDept, false);
  sharedSysId = await makeSystem('ACT Shared Sys', otherDept, true);

  itRiskId     = await makeRisk(itSysId);
  otherRiskId  = await makeRisk(otherSysId);
  sharedRiskId = await makeRisk(sharedSysId);

  itActionId     = await makeAction(itRiskId,     'ACT IT Action');
  otherActionId  = await makeAction(otherRiskId,  'ACT Other Action');
  sharedActionId = await makeAction(sharedRiskId, 'ACT Shared Action');
});

afterAll(async () => {
  const actionIds = [itActionId, otherActionId, sharedActionId].filter(Boolean);
  if (actionIds.length) {
    await query('DELETE FROM security_action_risks WHERE action_id = ANY($1)', [actionIds]);
    await query('DELETE FROM security_actions WHERE id = ANY($1)', [actionIds]);
  }
  const riskIds = [itRiskId, otherRiskId, sharedRiskId].filter(Boolean);
  if (riskIds.length) await query('DELETE FROM risks WHERE id = ANY($1)', [riskIds]);
  const sysIds = [itSysId, otherSysId, sharedSysId].filter(Boolean);
  if (sysIds.length) await query('DELETE FROM systems WHERE id = ANY($1)', [sysIds]);
  if (otherDept) await query('DELETE FROM departments WHERE id = $1', [otherDept]);
  _setDepartmentIsolation(true); // restore the in-memory default for other suites
});

function getDetail(roleKey, id) {
  return request(app).get(`/api/v1/actions/${id}`).set('Authorization', `Bearer ${tokenFor(roleKey)}`);
}

describe('GET /actions/:id — RACI read-scope', () => {
  test('global role (CISO) reads any action regardless of department', async () => {
    _setDepartmentIsolation(true);
    expect((await getDetail('ciso', itActionId)).status).toBe(200);
    expect((await getDetail('ciso', otherActionId)).status).toBe(200);
  });

  test('IAO reads an action on a risk in their own department (200)', async () => {
    _setDepartmentIsolation(true);
    const res = await getDetail('owner', itActionId);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(itActionId);
    expect(Array.isArray(res.body.risks)).toBe(true);
  });

  test('IAO is FORBIDDEN on an out-of-dept, non-shared action (403)', async () => {
    _setDepartmentIsolation(true);
    expect((await getDetail('owner', otherActionId)).status).toBe(403);
    expect((await getDetail('iam', otherActionId)).status).toBe(403);
  });

  test('IAO reads an action on a SHARED system cross-department (200)', async () => {
    _setDepartmentIsolation(true);
    expect((await getDetail('owner', sharedActionId)).status).toBe(200);
  });

  test('OFF (spreadsheet mode): IAO reads the out-of-dept action (200)', async () => {
    _setDepartmentIsolation(false);
    expect((await getDetail('owner', otherActionId)).status).toBe(200);
  });
});

describe('GET /actions — RACI list scope', () => {
  async function listIds(roleKey) {
    const res = await request(app).get('/api/v1/actions').set('Authorization', `Bearer ${tokenFor(roleKey)}`);
    expect(res.status).toBe(200);
    return res.body.actions.map((a) => a.id);
  }

  test('ON: IAO list includes own-dept + shared, excludes other-dept', async () => {
    _setDepartmentIsolation(true);
    const ids = await listIds('owner');
    expect(ids).toContain(itActionId);
    expect(ids).toContain(sharedActionId);
    expect(ids).not.toContain(otherActionId);
  });

  test('ON: CISO list includes every action', async () => {
    _setDepartmentIsolation(true);
    const ids = await listIds('ciso');
    expect(ids).toEqual(expect.arrayContaining([itActionId, otherActionId, sharedActionId]));
  });

  test('OFF: IAO list includes the other-dept action too', async () => {
    _setDepartmentIsolation(false);
    const ids = await listIds('owner');
    expect(ids).toContain(otherActionId);
  });
});

describe('GET /actions?mine=1 — owner filter', () => {
  async function mineIds(roleKey) {
    const res = await request(app)
      .get('/api/v1/actions?mine=1')
      .set('Authorization', `Bearer ${tokenFor(roleKey)}`);
    expect(res.status).toBe(200);
    return res.body.actions.map((a) => a.id);
  }

  test('owner-of-record (analyst) sees their actions; a non-owner (CISO) does not', async () => {
    _setDepartmentIsolation(true);
    const analystIds = await mineIds('analyst'); // primary_owner of all fixtures
    expect(analystIds).toEqual(expect.arrayContaining([itActionId, otherActionId, sharedActionId]));

    const cisoIds = await mineIds('ciso');       // owns none of the fixtures
    expect(cisoIds).not.toContain(itActionId);
  });
});
