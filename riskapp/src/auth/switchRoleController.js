'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const jwt       = require('jsonwebtoken');
const { query } = require('../db/pool');
const { signAccessToken } = require('./authController');

// ── POST /api/v1/auth/switch-role ─────────────────────────────────────────────
//
// Allows a user to switch their active role to any role they hold.
// Requires a valid access token (authenticate middleware applied in router).
// Issues a new access token carrying the requested role.
// Writes to audit_log — role switches are governance-relevant events.

async function switchRole(req, res, next) {
  const { role: requestedRole } = req.body;

  if (!requestedRole || !requestedRole.trim()) {
    return res.status(400).json({ error: 'role is required.' });
  }

  const userId = req.user.id;

  try {
    // 1. Fetch current user details for token signing and audit.
    const { rows: userRows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role AS primary_role, u.is_active,
              u.department_id,
              d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id = $1`,
      [userId]
    );

    const user = userRows[0];

    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'Not authorised.' });
    }

    // 2. Verify the requested role is held by this user and fetch full roles list.
    const { rows: roleRows } = await query(
      `SELECT role, source FROM v_user_roles
        WHERE user_id = $1
        ORDER BY CASE source WHEN 'primary' THEN 0 ELSE 1 END, role`,
      [userId]
    );

    // Dedupe: a role held as both primary and additional must appear once.
    const roles = [...new Set(roleRows.map(r => r.role))];
    const holdsRole = roleRows.some(r => r.role === requestedRole);

    if (!holdsRole) {
      return res.status(403).json({
        error: `Not authorised to switch to role "${requestedRole}".`,
      });
    }

    // 3. Build switched-role user object and issue new access token.
    const switchedUser = {
      id:    user.id,
      email: user.email,
      role:  requestedRole,
    };

    const newAccessToken = signAccessToken(switchedUser, req.user.family);

    // Record the elevation against THIS SESSION (v105), so the silent
    // 401->refresh restores it instead of quietly returning the user to
    // their primary role fifteen minutes later.
    //
    // Scoped to the refresh-token family, not the user: the role belongs to
    // this session, so signing in on another device does not inherit it.
    //
    // Tokens issued before v105 carry no family; nothing to update, and the
    // switch still works for the life of the access token.
    if (req.user.family) {
      await query(
        `UPDATE refresh_tokens SET active_role = $1
          WHERE family_id = $2 AND revoked_at IS NULL`,
        [requestedRole, req.user.family],
      );
    }

    // 4. Audit — role switches are governance-relevant.
    await query(
      `INSERT INTO audit_log (
         user_id, user_role, user_name,
         entity_type, entity_id, entity_label,
         action, human_narrative
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.id,
        requestedRole,
        user.full_name,
        'users',
        user.id,
        user.email,
        'switch_role',
        `User ${user.full_name} (${user.email}) switched active role from "${req.user.role}" to "${requestedRole}".`,
      ]
    );

    return res.status(200).json({
      access_token: newAccessToken,
      token_type:   'Bearer',
      expires_in:   process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      user: {
        id:              user.id,
        email:           user.email,
        full_name:       user.full_name,
        role:            requestedRole,
        roles,
        department_id:   user.department_id   || null,
        department_name: user.department_name || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { switchRole };