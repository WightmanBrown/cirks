// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Seat-based write eligibility (frontend mirror of the backend assertWriteScope
// in riskapp/src/auth/scoping.js). Dept-scoped roles (IAO, IAM) may only write
// rows in their own department; everyone else writes across departments. When
// department isolation is off there are no walls. The backend is authoritative —
// this just hides edit affordances that would 403 on save.

const DEPT_SCOPED_ROLES = new Set([
  'information_asset_owner',
  'information_asset_manager',
]);

/**
 * @param {object}  user                 the auth user ({ role, department_id })
 * @param {boolean} departmentIsolation  org-wide isolation flag
 * @param {string}  entityDeptId         the row's department_id
 * @returns {boolean}
 */
export function seatCanWrite(user, departmentIsolation, entityDeptId) {
  if (!departmentIsolation) return true;
  if (!DEPT_SCOPED_ROLES.has(user?.role)) return true;
  return !!user?.department_id && entityDeptId === user.department_id;
}

/**
 * Can the user add/link assets to a system?
 * Dept-scoped roles may link to their own-dept systems AND to shared systems
 * (on shared systems they can only link their own dept's assets — enforced by
 * seatCanUnlinkAsset/backend, not here).
 */
export function seatCanLinkAsset(user, departmentIsolation, systemDeptId, systemIsShared) {
  if (!departmentIsolation) return true;
  if (!DEPT_SCOPED_ROLES.has(user?.role)) return true;
  if (!user?.department_id) return false;
  return systemDeptId === user.department_id || !!systemIsShared;
}

/**
 * Can the user unlink a specific asset from a system?
 * Own-dept system: can remove any linked asset.
 * Shared cross-dept system: only own-dept assets may be removed.
 */
export function seatCanUnlinkAsset(user, departmentIsolation, systemDeptId, assetDeptId) {
  if (!departmentIsolation) return true;
  if (!DEPT_SCOPED_ROLES.has(user?.role)) return true;
  if (!user?.department_id) return false;
  if (systemDeptId === user.department_id) return true;
  return assetDeptId === user.department_id;
}
