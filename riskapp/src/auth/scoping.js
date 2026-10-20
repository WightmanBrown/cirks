'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Row-level data scoping — the second axis of access control alongside the
// capability resolver in permissions.js.
//
//   role        = WHAT you can do        (permissions.can / requireCapability)
//   department  = WHICH rows you can READ (deptReadClause, below)
//   seat        = WHICH rows you can WRITE (assertWriteScope, below)
//
// "Seat" = current role + current department. Write eligibility is recomputed
// from the actor's *current* department every time, never from personal
// ownership ("I created it" / owner_user_id = me). A department move therefore
// re-gates access automatically — the Joiners/Movers/Leavers property.
//
// Both read and write scoping are gated on org_config.department_isolation:
// when isolation is OFF (spreadsheet mode) there are no department walls and
// these helpers become no-ops. See memory project_access_scoping.

const { query } = require('../db/pool');
const { isDepartmentIsolationEnabled } = require('./permissions');

// Roles confined to their own department. Every other role is "global" and
// sees / writes across all departments (subject to capability).
const DEPT_SCOPED_ROLES = new Set([
  'information_asset_owner',
  'information_asset_manager',
]);

function isDeptScoped(role) {
  return DEPT_SCOPED_ROLES.has(role);
}

/**
 * Resolve the caller's own department id from their profile.
 * @returns {Promise<string|null>}
 */
async function getUserDepartment(userId) {
  const { rows } = await query('SELECT department_id FROM users WHERE id = $1', [userId]);
  return rows[0]?.department_id ?? null;
}

/**
 * Seat-based write gate. Throws a tagged error (status 403/404) unless the
 * caller's current department matches the target row's department. No-op for
 * global roles and when department isolation is off.
 *
 * Department is resolved either directly from `table.deptColumn` (default
 * department_id) or, for entities that inherit their department from an owning
 * system, via the `via` descriptor.
 *
 * @param {object} req                 Express request (uses req.user.{id,role})
 * @param {object} opts
 * @param {string} opts.id             target row id
 * @param {string} [opts.table]        table to read department from directly
 * @param {string} [opts.deptColumn]   column on `table` (default 'department_id')
 * @param {object} [opts.via]          indirection: { sql } returning one row { department_id }
 */
async function assertWriteScope(req, opts) {
  const { role, id: userId } = req.user;

  // Global roles and spreadsheet mode: no department wall on writes.
  if (!isDepartmentIsolationEnabled() || !isDeptScoped(role)) return;

  const myDept = await getUserDepartment(userId);
  if (!myDept) throw scopeError(403, 'No department assigned.');

  let rowDept;
  if (opts.via) {
    const { rows } = await query(opts.via.sql, [opts.id]);
    if (!rows.length) throw scopeError(404, 'Not found.');
    rowDept = rows[0].department_id;
  } else {
    const col = opts.deptColumn || 'department_id';
    const { rows } = await query(
      `SELECT ${col} AS department_id FROM ${opts.table} WHERE id = $1`,
      [opts.id]
    );
    if (!rows.length) throw scopeError(404, 'Not found.');
    rowDept = rows[0].department_id;
  }

  if (rowDept !== myDept) {
    throw scopeError(403, 'Outside your department.');
  }
}

/** Build an error carrying an HTTP status the route error handler can honour. */
function scopeError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = {
  isDeptScoped,
  getUserDepartment,
  assertWriteScope,
  DEPT_SCOPED_ROLES,
};
