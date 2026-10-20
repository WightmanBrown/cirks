// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * DepartmentScopeFilter — the one department scope control for every list page.
 *
 * Pairs with useDepartmentScope() below. Renders:
 *   [ All ] [ My Dept ] [ …page facets… ] [ Shared ]   ( ▾ specific department )
 *
 * "My Dept" is offered only when the caller actually has a department — a CISO
 * or admin has none in any meaningful sense, so the button would be a dead end.
 * The specific-department dropdown appears only when the rows span more than one
 * department, which makes the control self-configuring: with department
 * isolation ON the backend has already scoped the payload, one department comes
 * back, and no dropdown renders. No page needs to branch on org config.
 *
 * IMPORTANT: wherever this control appears, the list MUST also show an owning
 * Department column. Filtering and sorting by a column the user cannot see is
 * how the Assets and Systems pages ended up hiding Department from exactly the
 * dept-scoped roles that most needed it.
 */

import { useMemo, useState } from 'react';
import {
  SCOPE_ALL, SCOPE_DEPT, SCOPE_SHARED,
  applyDepartmentScope, departmentsIn,
} from '../utils/departmentScope';
import styles from './DepartmentScopeFilter.module.css';

/**
 * State + filtering for a list page.
 *
 * @param {object}  opts
 * @param {Array}   opts.rows          the full payload from the API
 * @param {string}  [opts.userDeptId]  caller's department id
 * @param {Array}   [opts.facets]      page-specific extra facets {key,label,test}
 * @param {boolean} [opts.defaultToOwnDept=true]
 */
export function useDepartmentScope({
  rows, userDeptId, facets = [], defaultToOwnDept = true, initialScope = null,
  alwaysInScope,
}) {
  // Default to the caller's own department when they have one — that is the
  // whole point. Cross-department roles start on "All".
  //
  // initialScope overrides both, for pages whose scope is URL-driven: Impact
  // Tables is deep-linked as ?scope=organisation from the SIRO widgets and the
  // /siro/impact-tables redirect, and that link must keep landing where it says.
  const [scope,  setScope]  = useState(
    initialScope || (userDeptId && defaultToOwnDept ? SCOPE_DEPT : SCOPE_ALL));
  const [deptId, setDeptId] = useState('');

  const departments = useMemo(() => departmentsIn(rows), [rows]);

  const filtered = useMemo(
    () => applyDepartmentScope(rows, { scope, userDeptId, deptId, facets, alwaysInScope }),
    // `facets` is defined inline by callers and would change identity every render;
    // its behaviour is static, so key on the scope inputs that actually vary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, scope, userDeptId, deptId],
  );

  return {
    scope, setScope,
    deptId, setDeptId,
    departments,
    filtered,
    userDeptId,
    facets,
  };
}

export function DepartmentScopeFilter({
  scope, setScope, deptId, setDeptId, departments, userDeptId, facets = [],
  myDeptLabel = 'My Dept',
  // Not every entity has a sharing model — risk exceptions do not carry
  // is_shared, so offering "Shared" there would be a button that always
  // returns nothing.
  showShared = true,
}) {
  const buttons = [
    { key: SCOPE_ALL,  label: 'All' },
    ...(userDeptId ? [{ key: SCOPE_DEPT, label: myDeptLabel }] : []),
    ...facets.map(f => ({ key: f.key, label: f.label })),
    ...(showShared ? [{ key: SCOPE_SHARED, label: 'Shared' }] : []),
  ];

  return (
    <>
      {buttons.map(b => (
        <button
          key={b.key}
          type="button"
          className={scope === b.key ? styles.filterActive : styles.filterBtn}
          onClick={() => setScope(b.key)}
          aria-pressed={scope === b.key}
        >
          {b.label}
        </button>
      ))}

      {departments.length > 1 && (
        <select
          className={styles.deptSelect}
          value={deptId}
          onChange={e => setDeptId(e.target.value)}
          aria-label="Filter by a specific department"
        >
          <option value="">All departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
    </>
  );
}
