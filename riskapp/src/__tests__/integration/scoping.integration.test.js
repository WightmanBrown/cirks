'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Phase 3b: department-isolation data-scoping. The rbacMatrix asserts status codes
// only, so it CANNOT catch a cross-department data leak. These tests assert the
// actual rows returned: with isolation ON an IAM sees only its own department's
// assets; with isolation OFF (spreadsheet mode) it sees all. Guards the fail-open
// risk that motivated this phase.

const { app, request, tokenFor, query, IT_DEPT, USERS } = require('./helpers');
const { _setDepartmentIsolation } = require('../../auth/permissions');

const THREAT = '33333333-0000-0000-0000-000000000001'; // seed: Unpatched Software Exploit

let otherDept;
let itAssetId;
let otherAssetId;
let sharedOtherAssetId;
let itDeptTableId;
let otherDeptTableId;
let sharedSysId;
let plainSysId;
let sharedRiskId;
let plainRiskId;
let itComponentId;
let otherComponentId;

beforeAll(async () => {
  const d = await query(
    `INSERT INTO departments (name) VALUES ('ITG Scope Dept') RETURNING id`
  );
  otherDept = d.rows[0].id;
  const a1 = await query(
    `INSERT INTO information_assets (name, department_id, is_active) VALUES ('ITG IT Asset', $1, TRUE) RETURNING id`,
    [IT_DEPT]
  );
  itAssetId = a1.rows[0].id;
  const a2 = await query(
    `INSERT INTO information_assets (name, department_id, is_active) VALUES ('ITG Other Asset', $1, TRUE) RETURNING id`,
    [otherDept]
  );
  otherAssetId = a2.rows[0].id;
  // A shared asset in another department — dept-scoped roles should still READ it.
  const a3 = await query(
    `INSERT INTO information_assets (name, department_id, is_active, is_shared) VALUES ('ITG Shared Other Asset', $1, TRUE, TRUE) RETURNING id`,
    [otherDept]
  );
  sharedOtherAssetId = a3.rows[0].id;

  // Department-scope impact tables, one per department — for bil seat-write.
  const t1 = await query(
    `INSERT INTO impact_tables (name, scope, department_id) VALUES ('ITG IT Table', 'department', $1) RETURNING id`,
    [IT_DEPT]
  );
  itDeptTableId = t1.rows[0].id;
  const t2 = await query(
    `INSERT INTO impact_tables (name, scope, department_id) VALUES ('ITG Other Table', 'department', $1) RETURNING id`,
    [otherDept]
  );
  otherDeptTableId = t2.rows[0].id;

  // A SHARED system in another department + a validated risk on it, plus a
  // non-shared counterpart — for shared-system risk read.
  const s1 = await query(
    `INSERT INTO systems (name, department_id, is_shared) VALUES ('ITG Shared Sys', $1, TRUE) RETURNING id`,
    [otherDept]
  );
  sharedSysId = s1.rows[0].id;
  const s2 = await query(
    `INSERT INTO systems (name, department_id, is_shared) VALUES ('ITG Plain Sys', $1, FALSE) RETURNING id`,
    [otherDept]
  );
  plainSysId = s2.rows[0].id;
  const r1 = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a, risk_score, rationale, validation_status)
     VALUES ($1, $2, 3, 3, 3, 1, 'ITG shared-system risk', 'validated') RETURNING id`,
    [sharedSysId, THREAT]
  );
  sharedRiskId = r1.rows[0].id;
  const r2 = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a, risk_score, rationale, validation_status)
     VALUES ($1, $2, 3, 3, 3, 1, 'ITG plain-system risk', 'validated') RETURNING id`,
    [plainSysId, THREAT]
  );
  plainRiskId = r2.rows[0].id;

  // Two PPITF components created by users in DIFFERENT departments. v114 removed
  // control_components.owner_department_id, so the creator's department is the
  // only departmental fact left about them — and the tests below pin that it
  // confers nothing.
  const c1 = await query(
    `INSERT INTO control_components (component_type, name, created_by)
     VALUES ('technology', 'ITG IT Component', $1) RETURNING id`,
    [USERS.iam.id]
  );
  itComponentId = c1.rows[0].id;
  const c2 = await query(
    `INSERT INTO control_components (component_type, name, created_by)
     VALUES ('technology', 'ITG Other Component', $1) RETURNING id`,
    [USERS.ciso.id]
  );
  otherComponentId = c2.rows[0].id;
});

afterAll(async () => {
  const compIds = [itComponentId, otherComponentId].filter(Boolean);
  if (compIds.length) await query('DELETE FROM control_components WHERE id = ANY($1)', [compIds]);
  const riskIds = [sharedRiskId, plainRiskId].filter(Boolean);
  if (riskIds.length) await query('DELETE FROM risks WHERE id = ANY($1)', [riskIds]);
  const sysIds = [sharedSysId, plainSysId].filter(Boolean);
  if (sysIds.length) await query('DELETE FROM systems WHERE id = ANY($1)', [sysIds]);
  const tblIds = [itDeptTableId, otherDeptTableId].filter(Boolean);
  if (tblIds.length) await query('DELETE FROM impact_tables WHERE id = ANY($1)', [tblIds]);
  const ids = [itAssetId, otherAssetId, sharedOtherAssetId].filter(Boolean);
  if (ids.length) await query('DELETE FROM information_assets WHERE id = ANY($1)', [ids]);
  if (otherDept) await query('DELETE FROM departments WHERE id = $1', [otherDept]);
  _setDepartmentIsolation(true); // restore the in-memory default for other suites
});

async function iamAssetIds() {
  const res = await request(app)
    .get('/api/v1/assets')
    .set('Authorization', `Bearer ${tokenFor('iam')}`);
  expect(res.status).toBe(200);
  return res.body.map((a) => a.id);
}

describe('department isolation — data scoping', () => {
  test('ON: IAM (IT dept) sees its own-dept asset but NOT another department\'s', async () => {
    _setDepartmentIsolation(true);
    const ids = await iamAssetIds();
    expect(ids).toContain(itAssetId);
    expect(ids).not.toContain(otherAssetId);
  });

  test('OFF (spreadsheet mode): IAM sees assets from all departments', async () => {
    _setDepartmentIsolation(false);
    const ids = await iamAssetIds();
    expect(ids).toContain(itAssetId);
    expect(ids).toContain(otherAssetId);
  });

  test('ON: IAM also sees a SHARED asset from another department (own dept OR shared)', async () => {
    _setDepartmentIsolation(true);
    const ids = await iamAssetIds();
    expect(ids).toContain(itAssetId);
    expect(ids).toContain(sharedOtherAssetId);   // shared → visible cross-dept
    expect(ids).not.toContain(otherAssetId);     // non-shared other-dept → hidden
  });
});

// IAO read is now DEPARTMENT-based (was identity-based). An IAO sees its whole
// department's assets, not just records personally assigned to them.
describe('IAO read scope — department-based', () => {
  async function ownerAssetIds() {
    const res = await request(app)
      .get('/api/v1/assets')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);
    expect(res.status).toBe(200);
    return res.body.map((a) => a.id);
  }

  test('ON: IAO (IT dept) sees IT assets + shared, not another department\'s', async () => {
    _setDepartmentIsolation(true);
    const ids = await ownerAssetIds();
    expect(ids).toContain(itAssetId);
    expect(ids).toContain(sharedOtherAssetId);
    expect(ids).not.toContain(otherAssetId);
  });
});

// Seat-based write: dept-scoped roles may only WRITE rows in their own dept.
// Shared/other-dept rows are readable but not writable.
describe('seat-based write enforcement', () => {
  const body = (deptId) => ({ name: 'ITG IT Asset', department_id: deptId });

  test('ON: IAM can edit an own-department asset (204)', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .put(`/api/v1/assets/${itAssetId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send(body(IT_DEPT));
    expect(res.status).toBe(204);
  });

  test('ON: IAM cannot edit another department\'s asset (403)', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .put(`/api/v1/assets/${otherAssetId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send(body(otherDept));
    expect(res.status).toBe(403);
  });

  test('ON: IAM cannot edit a SHARED other-department asset either (read ≠ write) (403)', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .put(`/api/v1/assets/${sharedOtherAssetId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send(body(otherDept));
    expect(res.status).toBe(403);
  });

  test('OFF (spreadsheet mode): the department write-wall lifts (204)', async () => {
    _setDepartmentIsolation(false);
    const res = await request(app)
      .put(`/api/v1/assets/${otherAssetId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send(body(otherDept));
    expect(res.status).toBe(204);
  });

  test('global roles (ciso) write across departments regardless (204)', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .put(`/api/v1/assets/${otherAssetId}`)
      .set('Authorization', `Bearer ${tokenFor('ciso')}`)
      .send(body(otherDept));
    expect(res.status).toBe(204);
  });
});

// JML: when a user moves department, records still pointing at them in the old
// department are surfaced for reassignment (no silent mutation).
describe('JML stale-pointer surfacing', () => {
  test('moving an asset owner to another dept flags the orphaned asset', async () => {
    _setDepartmentIsolation(true);
    // Own asset in IT, owned by the IAM user.
    await query('UPDATE information_assets SET owner_user_id = $1 WHERE id = $2', [USERS.iam.id, itAssetId]);
    try {
      const res = await request(app)
        .get(`/api/v1/admin/users/${USERS.iam.id}/orphaned-records`)
        .set('Authorization', `Bearer ${tokenFor('admin')}`);
      expect(res.status).toBe(200);
      // IAM is in IT; the IT asset is NOT orphaned yet.
      expect(res.body.records.map((r) => r.id)).not.toContain(itAssetId);

      // Move the IAM user to another department → the IT asset is now orphaned.
      const patch = await request(app)
        .patch(`/api/v1/admin/users/${USERS.iam.id}`)
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send({ department_id: otherDept });
      expect(patch.status).toBe(200);
      expect(patch.body.needs_reassignment.total).toBeGreaterThan(0);
      expect(patch.body.needs_reassignment.records.map((r) => r.id)).toContain(itAssetId);
    } finally {
      // Restore the IAM user's department and clear the ownership pointer.
      await query('UPDATE users SET department_id = $1 WHERE id = $2', [IT_DEPT, USERS.iam.id]);
      await query('UPDATE information_assets SET owner_user_id = NULL WHERE id = $1', [itAssetId]);
    }
  });
});

// Impact-table (bil) writes are seat-scoped: an IAM may edit a department-scope
// table only in its own department (org tables stay role-gated separately).
describe('impact-table seat-based write', () => {
  test('ON: IAM can edit its own department\'s dept-scope table (200)', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .put(`/api/v1/bil/impact-tables/${itDeptTableId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ name: 'ITG IT Table' });
    expect(res.status).toBe(200);
  });

  test('ON: IAM cannot edit another department\'s dept-scope table (403)', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .put(`/api/v1/bil/impact-tables/${otherDeptTableId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ name: 'ITG Other Table (hijack)' });
    expect(res.status).toBe(403);
  });
});

// A risk on a SHARED system travels cross-department: dept-scoped roles read it
// even though the system belongs to another department.
describe('shared-system risk visibility', () => {
  async function iamHeatmapRiskIds() {
    const res = await request(app)
      .get('/api/v1/operations/risk-heatmap/current')
      .set('Authorization', `Bearer ${tokenFor('iam')}`);
    expect(res.status).toBe(200);
    return res.body.risks.map((r) => r.risk_id);
  }

  test('ON: IAM (IT) sees a validated risk on a SHARED other-dept system, not on a non-shared one', async () => {
    _setDepartmentIsolation(true);
    const ids = await iamHeatmapRiskIds();
    expect(ids).toContain(sharedRiskId);     // shared system → its risk travels
    expect(ids).not.toContain(plainRiskId);  // non-shared other-dept → hidden
  });

  test('ON: IAM can open the shared-system risk detail (200), but not the non-shared one (403)', async () => {
    _setDepartmentIsolation(true);
    const ok = await request(app)
      .get(`/api/v1/risks/${sharedRiskId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`);
    expect(ok.status).toBe(200);
    const blocked = await request(app)
      .get(`/api/v1/risks/${plainRiskId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`);
    expect(blocked.status).toBe(403);
  });
});

// The component catalogue has NO owning department (v114). It is org-wide
// readable AND org-wide writable to anyone holding the capability — one rule for
// every component type, deliberately unlike systems / assets / services, which
// a department is genuinely accountable FOR.
//
// These tests run with department_isolation ON, because that is the setting
// under which the old seat gate bit. If ownership ever creeps back into this
// table, the 403 will reappear here first.
describe('component catalogue — no departmental ownership', () => {
  test('create records no owning department', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .post('/api/v1/components')
      .set('Authorization', `Bearer ${tokenFor('iam')}`)   // IAM is in IT
      .send({ component_type: 'technology', name: 'ITG Created Component' });
    expect(res.status).toBe(201);
    expect(res.body.owner_department_id).toBeUndefined();

    // And the column is gone from the table, not merely unselected — otherwise
    // this passes while a stale write path keeps stamping it.
    const { rows } = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'control_components' AND column_name = 'owner_department_id'`);
    expect(rows).toHaveLength(0);

    await query('DELETE FROM control_components WHERE id = $1', [res.body.id]);
  });

  test('an IAM may edit a component created in another department (200)', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .patch(`/api/v1/components/${otherComponentId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ description: 'edited across departments, on purpose' });
    expect(res.status).toBe(200);
  });

  test('…and one created in its own (200) — the rule does not depend on who made it', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .patch(`/api/v1/components/${itComponentId}`)
      .set('Authorization', `Bearer ${tokenFor('iam')}`)
      .send({ description: 'updated by own-dept IAM' });
    expect(res.status).toBe(200);
  });

  test('a role without the capability is still refused — capability is the gate', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .patch(`/api/v1/components/${itComponentId}`)
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .send({ description: 'should not land' });
    expect(res.status).toBe(403);
  });

  test('the catalogue stays readable across departments (IAM sees both)', async () => {
    _setDepartmentIsolation(true);
    const res = await request(app)
      .get('/api/v1/components?all=1')
      .set('Authorization', `Bearer ${tokenFor('iam')}`);
    expect(res.status).toBe(200);
    const ids = res.body.components.map((c) => c.id);
    expect(ids).toContain(itComponentId);
    expect(ids).toContain(otherComponentId);
  });
});
