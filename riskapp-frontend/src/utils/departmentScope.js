// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Department scoping — the single source of truth for "show me my department".
 *
 * PRESENTATION ONLY. This never decides what a user is *allowed* to see; the
 * backend does that. It decides what a list page shows by DEFAULT.
 *
 * The distinction matters because `org_config.department_isolation` may be off
 * ("spreadsheet mode" — a legitimate deployment choice for organisations that
 * do not want departmental walls). With it off, the backend deliberately
 * returns every department's rows to a dept-scoped role. That is correct for
 * authorisation and useless as a default view: an IAM for one department was
 * being shown the whole organisation's register.
 *
 * WHY THIS IS SHARED
 * Four list pages needed this and three had grown their own version. Assets and
 * Systems had byte-identical predicates, duplicated. Business Services had a
 * DIFFERENT one — `!row.adopted`, i.e. "not adopted from another department",
 * which is a completely different concept and silently filtered nothing at all
 * once no services were adopted. Exceptions had none. The page written
 * separately was the broken one, which is the argument for one implementation.
 *
 * Always match on department_id, never department_name: names are labels, not
 * identifiers, and two departments may legitimately be renamed or share a word.
 */

/**
 * Roles that work across departments. They see everything by default and are
 * not offered a "My Dept" scope, because they do not meaningfully have one.
 *
 * Previously duplicated in InformationAssetsPage, SystemsPage and
 * InformationAssetDetailPage, with BusinessServicesPage carrying a fourth,
 * divergent list that omitted risk_analyst.
 */
export const CROSS_DEPT_ROLES = new Set([
  'ciso',
  'admin',
  'security_consultant',
  'risk_analyst',
  'security_architect',
]);

export function isCrossDeptRole(role) {
  return CROSS_DEPT_ROLES.has(role);
}

/** Scope keys shared by every list page. */
export const SCOPE_ALL    = 'all';
export const SCOPE_DEPT   = 'dept';
export const SCOPE_SHARED = 'shared';

/**
 * Does `row` belong to `departmentId`?
 * A row with no department never matches a specific department — it cannot be
 * claimed by one, and silently including it would overstate the scope.
 */
export function inDepartment(row, departmentId) {
  if (!departmentId) return true;      // no department chosen → no restriction
  return row?.department_id === departmentId;
}

/**
 * Apply a scope to a list of rows.
 *
 * @param {Array}  rows
 * @param {object} opts
 * @param {string} opts.scope         SCOPE_ALL | SCOPE_DEPT | SCOPE_SHARED | a custom facet key
 * @param {string} [opts.userDeptId]  the caller's department, for SCOPE_DEPT
 * @param {string} [opts.deptId]      an explicitly chosen department (the dropdown)
 * @param {Array}  [opts.facets]      extra page-specific facets: { key, label, test }
 * @param {Function} [opts.alwaysInScope]  rows that belong to EVERY department
 *
 * `alwaysInScope` exists because "my department" is not always the same as
 * "carries my department id". An organisation-scope impact table has a NULL
 * department_id but applies to everyone, and the API says so itself:
 *
 *     WHERE it.scope = 'organisation' OR it.department_id = <caller's dept>
 *
 * Without this, "My Dept" would hide the organisation-wide (often mandatory)
 * tables an IAM actually rates their assets against — a filter that quietly
 * removes the most important rows is worse than no filter.
 */
export function applyDepartmentScope(
  rows, { scope, userDeptId, deptId, facets = [], alwaysInScope } = {},
) {
  let out = rows ?? [];

  // The explicit department dropdown composes with the scope buttons rather
  // than replacing them, matching the existing Assets/Systems behaviour.
  if (deptId) out = out.filter(r => inDepartment(r, deptId) || alwaysInScope?.(r));

  if (scope === SCOPE_DEPT) {
    return out.filter(r => inDepartment(r, userDeptId) || Boolean(alwaysInScope?.(r)));
  }
  if (scope === SCOPE_SHARED) return out.filter(r => Boolean(r?.is_shared));

  const facet = facets.find(f => f.key === scope);
  if (facet) return out.filter(facet.test);

  return out;                          // SCOPE_ALL, or an unknown key
}

/** The distinct departments present in `rows`, as {id, name}, sorted by name. */
export function departmentsIn(rows) {
  const seen = new Map();
  for (const r of rows ?? []) {
    if (r?.department_id && !seen.has(r.department_id)) {
      seen.set(r.department_id, r.department_name || '—');
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
