'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../db/pool');

// Who owns what a department holds.
//
// There were three answers to this and they disagreed:
//
//   1. `owner_user_id || req.user.id` on create — whoever happened to be
//      logged in. On a real instance this put a security consultant from
//      Information Security in charge of four of Health's clinical systems.
//   2. `departments.owner_user_id` — a denormalised pointer that has already
//      drifted: Information Security's names a risk_analyst while its actual
//      IAO is someone else.
//   3. The user holding role = 'information_asset_owner' in that department —
//      what the list columns already display, and what admins actually manage.
//
// (3) is authoritative. It is the assignment a human makes; the other two are
// copies of it that rot. Keeping one implementation here means a fourth cannot
// quietly appear.
//
// Returns NULL when the department has no IAO. That is deliberate: an empty
// owner is visibly unfinished, a plausible wrong name is not. Callers should
// surface the gap rather than substitute someone.
async function departmentIao(departmentId) {
  if (!departmentId) return null;
  const { rows } = await query(
    `SELECT id FROM users
      WHERE department_id = $1 AND role = 'information_asset_owner' AND is_active = TRUE
      ORDER BY full_name
      LIMIT 1`,
    [departmentId],
  );
  return rows[0]?.id ?? null;
}

// The department's Information Asset Manager, same rules.
async function departmentIam(departmentId) {
  if (!departmentId) return null;
  const { rows } = await query(
    `SELECT id FROM users
      WHERE department_id = $1 AND role = 'information_asset_manager' AND is_active = TRUE
      ORDER BY full_name
      LIMIT 1`,
    [departmentId],
  );
  return rows[0]?.id ?? null;
}

module.exports = { departmentIao, departmentIam };
