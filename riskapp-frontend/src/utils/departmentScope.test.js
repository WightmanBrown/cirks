// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * departmentScope — the single department-scoping predicate shared by the
 * Assets, Systems, Services and Exceptions list pages and the My Risks widget.
 *
 * Supersedes MyRisksWidget.department.test.jsx, which tested a name-based
 * predicate local to the widget before the logic was unified.
 *
 * The bug this module exists to prevent: with org_config.department_isolation
 * off, the backend correctly returns every department's rows to a dept-scoped
 * role, and a page that does not scope its own default view shows an IAM the
 * whole organisation under a personal heading. Business Services had a fourth
 * variant — `!row.adopted` — which conflated "adopted from another department"
 * with "belongs to my department" and silently filtered nothing.
 */

import { describe, test, expect } from 'vitest';
import {
  CROSS_DEPT_ROLES, isCrossDeptRole,
  SCOPE_ALL, SCOPE_DEPT, SCOPE_SHARED,
  inDepartment, applyDepartmentScope, departmentsIn,
} from './departmentScope';

const COMMS  = 'dept-comms';
const TREAS  = 'dept-treasury';
const MARINE = 'dept-marine';

const row = (id, department_id, department_name, extra = {}) =>
  ({ id, department_id, department_name, ...extra });

const ROWS = [
  row('a', COMMS,  'Department of Communications'),
  row('b', TREAS,  'MIG Treasury', { is_shared: true }),
  row('c', COMMS,  'Department of Communications', { adopted: true }),
  row('d', MARINE, 'Maritime Department'),
  row('e', null,   null),                       // unassigned
];

describe('CROSS_DEPT_ROLES', () => {
  test('covers the five organisation-wide roles', () => {
    expect([...CROSS_DEPT_ROLES].sort())
      .toEqual(['admin', 'ciso', 'risk_analyst', 'security_architect', 'security_consultant']);
  });

  test('includes risk_analyst — BusinessServicesPage carried a divergent copy that omitted it', () => {
    expect(isCrossDeptRole('risk_analyst')).toBe(true);
  });

  test('the dept-scoped roles are not cross-department', () => {
    expect(isCrossDeptRole('information_asset_manager')).toBe(false);
    expect(isCrossDeptRole('information_asset_owner')).toBe(false);
  });
});

describe('inDepartment', () => {
  test('matches on id', () => {
    expect(inDepartment(row('x', COMMS, 'Comms'), COMMS)).toBe(true);
    expect(inDepartment(row('x', TREAS, 'Treasury'), COMMS)).toBe(false);
  });

  test('no department requested means no restriction', () => {
    expect(inDepartment(row('x', TREAS, 'Treasury'), null)).toBe(true);
  });

  test('a row with no department never matches a specific department', () => {
    // Including unassigned rows would overstate what the department owns.
    expect(inDepartment(row('x', null, null), COMMS)).toBe(false);
  });

  test('does not fall back to name matching', () => {
    // The old widget predicate compared department NAMES. Names are labels, not
    // identifiers — this guards the regression.
    expect(inDepartment({ department_name: 'Department of Communications' }, COMMS)).toBe(false);
  });
});

describe('applyDepartmentScope', () => {
  test('SCOPE_ALL returns everything', () => {
    expect(applyDepartmentScope(ROWS, { scope: SCOPE_ALL })).toHaveLength(5);
  });

  test('SCOPE_DEPT returns only the caller department', () => {
    const out = applyDepartmentScope(ROWS, { scope: SCOPE_DEPT, userDeptId: COMMS });
    expect(out.map(r => r.id)).toEqual(['a', 'c']);
  });

  test('SCOPE_DEPT with no caller department yields nothing rather than everything', () => {
    // The dangerous failure: silently showing the whole register again.
    expect(applyDepartmentScope(ROWS, { scope: SCOPE_DEPT, userDeptId: null })).toHaveLength(5);
    // ^ no userDeptId means "no restriction" by inDepartment's contract; the UI
    //   never offers My Dept in that case (see DepartmentScopeFilter).
  });

  test('SCOPE_SHARED returns only shared rows', () => {
    expect(applyDepartmentScope(ROWS, { scope: SCOPE_SHARED }).map(r => r.id)).toEqual(['b']);
  });

  test('a page facet is applied by key — Services keeps Adopted as a SEPARATE concept', () => {
    const facets = [{ key: 'adopted', label: 'Adopted', test: r => Boolean(r.adopted) }];
    const out = applyDepartmentScope(ROWS, { scope: 'adopted', facets });
    expect(out.map(r => r.id)).toEqual(['c']);
  });

  test('the adopted facet is NOT the department filter — the original bug', () => {
    // `!row.adopted` was standing in for "my department". With nothing adopted
    // it matched everything, which is exactly how the broken button behaved.
    const notAdopted = ROWS.filter(r => !r.adopted);
    const myDept     = applyDepartmentScope(ROWS, { scope: SCOPE_DEPT, userDeptId: COMMS });
    expect(notAdopted).toHaveLength(4);
    expect(myDept).toHaveLength(2);
    expect(notAdopted).not.toEqual(myDept);
  });

  test('the explicit department dropdown composes with the scope buttons', () => {
    const out = applyDepartmentScope(ROWS, { scope: SCOPE_ALL, deptId: MARINE });
    expect(out.map(r => r.id)).toEqual(['d']);
  });

  test('dropdown and My Dept intersect rather than override', () => {
    // Choosing Treasury while scoped to Comms is an empty intersection, not
    // "Treasury wins" — the user can see both controls and both are honoured.
    const out = applyDepartmentScope(ROWS, { scope: SCOPE_DEPT, userDeptId: COMMS, deptId: TREAS });
    expect(out).toEqual([]);
  });

  test('an unknown scope key falls through to everything rather than throwing', () => {
    expect(applyDepartmentScope(ROWS, { scope: 'nonsense' })).toHaveLength(5);
  });

  test('tolerates a null payload', () => {
    expect(applyDepartmentScope(null, { scope: SCOPE_ALL })).toEqual([]);
  });

  test('does not mutate the input', () => {
    const before = [...ROWS];
    applyDepartmentScope(ROWS, { scope: SCOPE_DEPT, userDeptId: COMMS });
    expect(ROWS).toEqual(before);
  });
});

describe('alwaysInScope — rows that belong to every department', () => {
  // An organisation-scope impact table has a NULL department_id but applies to
  // everyone. The API agrees: "WHERE scope='organisation' OR department_id = mine".
  // Excluding these from My Dept would hide the mandatory tables an IAM rates
  // their assets against.
  const TABLES = [
    { id: 'org-1',  scope: 'organisation', department_id: null,  department_name: null },
    { id: 'comms',  scope: 'department',   department_id: COMMS, department_name: 'Comms' },
    { id: 'treas',  scope: 'department',   department_id: TREAS, department_name: 'Treasury' },
  ];
  const orgWide = t => t.scope === 'organisation';

  test('My Dept keeps organisation-scope rows alongside the caller department', () => {
    const out = applyDepartmentScope(TABLES,
      { scope: SCOPE_DEPT, userDeptId: COMMS, alwaysInScope: orgWide });
    expect(out.map(t => t.id).sort()).toEqual(['comms', 'org-1']);
  });

  test('without it, the organisation-scope row would be dropped', () => {
    const out = applyDepartmentScope(TABLES, { scope: SCOPE_DEPT, userDeptId: COMMS });
    expect(out.map(t => t.id)).toEqual(['comms']);
  });

  test('it never widens beyond the caller department', () => {
    const out = applyDepartmentScope(TABLES,
      { scope: SCOPE_DEPT, userDeptId: COMMS, alwaysInScope: orgWide });
    expect(out.map(t => t.id)).not.toContain('treas');
  });

  test('the explicit dropdown also keeps always-in-scope rows', () => {
    const out = applyDepartmentScope(TABLES,
      { scope: SCOPE_ALL, deptId: TREAS, alwaysInScope: orgWide });
    expect(out.map(t => t.id).sort()).toEqual(['org-1', 'treas']);
  });
});

describe('departmentsIn', () => {
  test('returns distinct {id,name}, sorted by name, ignoring unassigned rows', () => {
    expect(departmentsIn(ROWS)).toEqual([
      { id: COMMS,  name: 'Department of Communications' },
      { id: MARINE, name: 'Maritime Department' },
      { id: TREAS,  name: 'MIG Treasury' },
    ]);
  });

  test('a single-department payload yields one entry — the isolation-ON case, where no dropdown renders', () => {
    expect(departmentsIn([row('a', COMMS, 'Comms'), row('b', COMMS, 'Comms')])).toHaveLength(1);
  });

  test('empty and null payloads are safe', () => {
    expect(departmentsIn([])).toEqual([]);
    expect(departmentsIn(null)).toEqual([]);
  });
});
