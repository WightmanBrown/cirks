'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const bcrypt       = require('bcrypt');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { query }    = require('../../db/pool');

const SALT_ROUNDS = 12;
// See the note beside the length checks below (H-17 / v112).
const MAX_PASSWORD_LENGTH = 128;

const router = Router();
router.use(authenticate);
router.use(requireCapability('admin.manage'));

// RBAC configuration API (read/edit the capability matrix, SoD rules, isolation).
router.use('/rbac', require('./rbac'));

// Data export (CSV/TSV) — access-control + account-management datasets.
router.use('/export', require('./export'));

// Read-only audit-log viewer (the append-only audit_log table).
router.use('/audit', require('./audit'));

// Machine API keys (SOC enrichment — Stage 3): mint / list / revoke.
router.use('/api-keys', require('./apiKeys'));

/**
 * GET /admin/setup-status
 *
 * Returns a checklist of system prerequisites so an admin can see at a glance
 * what needs to be configured before the platform is usable. Designed to
 * handle the "fresh install / empty database" state gracefully.
 *
 * Response:
 *   { items: Array<SetupItem> }
 *
 * SetupItem:
 *   { key, label, description, ok, count, action_path, action_label }
 */
router.get('/setup-status', async (req, res, next) => {
  try {
    const [
      deptResult,
      impactResult,
      threatResult,
      userResult,
      cycleResult,
      controlsResult,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM departments`),
      query(`SELECT COUNT(*)::int AS count FROM impact_tables WHERE published_at IS NOT NULL`),
      query(`SELECT COUNT(*)::int AS count FROM threats WHERE is_active = TRUE`),
      query(`SELECT COUNT(*)::int AS count FROM users WHERE is_active = TRUE AND role != 'admin'`),
      query(`SELECT COUNT(*)::int AS count FROM review_cycles WHERE status IN ('active', 'under_review')`),
      query(`SELECT COUNT(*)::int AS count FROM controls`),
    ]);

    const dept    = deptResult.rows[0].count;
    const impact  = impactResult.rows[0].count;
    const threats = threatResult.rows[0].count;
    const users   = userResult.rows[0].count;
    const cycles  = cycleResult.rows[0].count;
    const controls = controlsResult.rows[0].count;

    res.json({
      items: [
        {
          key:          'departments',
          label:        'Departments',
          description:  'At least one department is required before users, services, and systems can be created.',
          ok:           dept > 0,
          count:        dept,
          action_path:  '/wizard/department',
          action_label: 'Set up departments',
        },
        {
          key:          'impact_tables',
          label:        'Published impact table',
          description:  'A published impact table provides the CIA rating scale used across the platform.',
          ok:           impact > 0,
          count:        impact,
          action_path:  '/impact-tables',
          action_label: 'Create impact table',
        },
        {
          key:          'threats',
          label:        'Threat catalogue',
          description:  'Threats must exist before risks can be registered against systems.',
          ok:           threats > 0,
          count:        threats,
          action_path:  '/threats',
          action_label: 'Add threats',
        },
        {
          key:          'control_sets',
          label:        'Objectives & standards',
          description:  'Import the native control catalogue and the standard reference sets (ISO/CIS/NIST) you report against.',
          ok:           controls > 0,
          count:        controls,
          action_path:  '/setup/control-sets',
          action_label: 'Import control sets',
        },
        {
          key:          'users',
          label:        'Non-admin users',
          description:  'At least one analyst, CISO, or IAO user should be configured.',
          ok:           users > 0,
          count:        users,
          action_path:  null,
          action_label: null,
        },
        {
          key:          'review_cycle',
          label:        'Active review cycle',
          description:  'An active SWG review cycle is needed to formally adopt proposed security actions. Analysts can still propose actions without one.',
          ok:           cycles > 0,
          count:        cycles,
          action_path:  '/siro/cycles',
          action_label: 'Open a cycle',
        },
      ],
    });
  } catch (err) {
    next(err);
  }
});

// ─── Valid roles ──────────────────────────────────────────────────────────────

const VALID_ROLES = new Set([
  'admin',
  'ciso',
  'risk_analyst',
  'information_asset_manager',
  'information_asset_owner',
  'security_consultant',
  'siro',
  'meeting_secretary',
  'soc_analyst',
  'security_architect',
]);

/**
 * GET /admin/users
 *
 * Full user list for the admin management panel. Includes all users (active
 * and inactive), their department name, and any additional roles granted via
 * the user_roles table.
 *
 * Response: Array<UserRecord>
 * UserRecord: { id, email, full_name, role, is_active, last_login_at,
 *               department_name, additional_roles }
 */
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.is_active,
        u.last_login_at,
        u.department_id,
        d.name AS department_name,
        COALESCE(
          JSON_AGG(ur.role::text ORDER BY ur.granted_at) FILTER (WHERE ur.role IS NOT NULL),
          '[]'::json
        ) AS additional_roles
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN user_roles  ur ON ur.user_id = u.id
      GROUP BY u.id, d.name
      ORDER BY u.is_active DESC, u.full_name
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * Records that still point at `userId` (owner / manager / assignee) but whose
 * department no longer matches the user's current department — i.e. left behind
 * when the user moved department. Surfaced so the new owning department can pick
 * them up; we never silently rewrite the pointers (see memory
 * project_access_scoping). Department for risks/actions is the owning system's.
 */
async function findOrphanedRecords(userId) {
  const { rows } = await query(
    `WITH me AS (SELECT department_id FROM users WHERE id = $1)
     SELECT 'asset'  AS entity, ia.id::text AS id, ia.name AS label, d.name AS department_name
       FROM information_assets ia
       LEFT JOIN departments d ON d.id = ia.department_id
      WHERE ia.is_active
        AND (ia.owner_user_id = $1 OR ia.managed_by_user_id = $1)
        AND ia.department_id IS DISTINCT FROM (SELECT department_id FROM me)
     UNION ALL
     SELECT 'system', s.id::text, s.name, d.name
       FROM systems s
       LEFT JOIN departments d ON d.id = s.department_id
      WHERE s.is_active
        AND (s.owner_user_id = $1 OR s.managed_by_user_id = $1)
        AND s.department_id IS DISTINCT FROM (SELECT department_id FROM me)
     -- Risks are deliberately absent (v108). A risk belongs to the DEPARTMENT
     -- that owns its system, so a person changing department leaves no dangling
     -- risk behind: the department still owns it and its next IAO picks it up.
     -- Only rows that name a PERSON can be orphaned.
     UNION ALL
     SELECT 'action', sa.id::text, sa.title, NULL::text
       FROM security_actions sa
      WHERE sa.primary_owner_user_id = $1
        AND sa.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')
        AND NOT EXISTS (
          SELECT 1 FROM security_action_risks sar
          JOIN risks r2   ON r2.id   = sar.risk_id
          JOIN systems s2 ON s2.id   = r2.system_id
          WHERE sar.action_id = sa.id
            AND s2.department_id IS NOT DISTINCT FROM (SELECT department_id FROM me)
        )
     ORDER BY entity, label`,
    [userId]
  );

  const counts = rows.reduce((acc, r) => { acc[r.entity] = (acc[r.entity] || 0) + 1; return acc; }, {});
  return { total: rows.length, counts, records: rows };
}

/**
 * PATCH /admin/users/:id
 *
 * Updates a user's primary role and/or active status.
 * Admin cannot modify their own account via this endpoint (prevents accidental
 * self-lock-out; use the DB directly for that).
 *
 * Body (all optional, at least one required):
 *   { role?: user_role, is_active?: boolean }
 *
 * Response: { id, email, full_name, role, is_active }
 */
router.patch('/users/:id', async (req, res, next) => {
  try {
    const { id }     = req.params;
    const actorId    = req.user.id;

    const { role, is_active, full_name, department_id } = req.body;

    // Your own role, department and active flag are privileges — changing them
    // here would let an admin grant themselves something, so they stay refused.
    // Your own NAME is not a privilege, so it may be corrected (owner, 2026-09-29).
    if (id === actorId
        && (role !== undefined || is_active !== undefined || department_id !== undefined)) {
      return res.status(400).json({ error: 'Cannot modify your own role, department or active status from this panel.' });
    }

    const updates = {};
    if (role !== undefined) {
      if (!VALID_ROLES.has(role)) {
        return res.status(400).json({ error: `Invalid role: ${role}` });
      }
      updates.role = role;
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active must be a boolean.' });
      }
      updates.is_active = is_active;
    }
    if (full_name !== undefined) {
      if (typeof full_name !== 'string' || !full_name.trim()) {
        return res.status(400).json({ error: 'full_name must be a non-empty string.' });
      }
      updates.full_name = full_name.trim();
    }
    if (department_id !== undefined) {
      if (department_id !== null) {
        const { rows: d } = await query('SELECT 1 FROM departments WHERE id = $1', [department_id]);
        if (!d.length) return res.status(400).json({ error: 'Unknown department.' });
      }
      updates.department_id = department_id; // null = unassign
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    // Build a safe parameterised SET clause
    const keys   = Object.keys(updates);
    const values = Object.values(updates);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    values.push(id);                          // last placeholder for WHERE

    const { rows } = await query(
      `UPDATE users
          SET ${setClauses}, updated_at = now()
        WHERE id = $${values.length}
        RETURNING id, email, full_name, role, is_active, department_id`,
      values,
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // After a department move, surface records still pointing at this user that
    // now sit outside their new department, so the new owning department can
    // reassign them. Pointers are left untouched (no silent mutation).
    const out = rows[0];
    if (department_id !== undefined) {
      out.needs_reassignment = await findOrphanedRecords(id);
    }

    res.json(out);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/users/:id/orphaned-records — records still owned/assigned to this
 * user that sit outside their current department (the reassignment worklist).
 */
router.get('/users/:id/orphaned-records', async (req, res, next) => {
  try {
    const result = await findOrphanedRecords(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/users/:id/roles — grant an additional (secondary) role to a user.
 * Body: { role }. The user can then switch into it. granted_by is recorded; the
 * SoD role.grant rule (if enabled) blocks self-grants at the DB level.
 */
router.post('/users/:id/roles', async (req, res, next) => {
  try {
    const { id }   = req.params;
    const { role } = req.body;
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot modify your own roles from this panel.' });
    if (!VALID_ROLES.has(role)) return res.status(400).json({ error: `Invalid role: ${role}` });

    const { rows: u } = await query('SELECT role FROM users WHERE id = $1', [id]);
    if (!u.length) return res.status(404).json({ error: 'User not found.' });
    if (u[0].role === role) return res.status(400).json({ error: "That is already the user's primary role." });

    await query(
      `INSERT INTO user_roles (user_id, role, granted_by)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2)`,
      [id, role, req.user.id],
    );
    res.status(201).json(await additionalRoles(id));
  } catch (err) { next(err); }
});

/**
 * DELETE /admin/users/:id/roles/:role — revoke an additional role.
 */
router.delete('/users/:id/roles/:role', async (req, res, next) => {
  try {
    const { id, role } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot modify your own roles from this panel.' });
    await query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2', [id, role]);
    res.json(await additionalRoles(id));
  } catch (err) { next(err); }
});

async function additionalRoles(userId) {
  const { rows } = await query(
    `SELECT COALESCE(JSON_AGG(role::text ORDER BY granted_at) FILTER (WHERE role IS NOT NULL), '[]'::json) AS additional_roles
     FROM user_roles WHERE user_id = $1`,
    [userId],
  );
  return { id: userId, additional_roles: rows[0].additional_roles };
}

/**
 * POST /admin/users — create a new account.
 * Body: { email, full_name, role, department_id?, password }
 */
router.post('/users', async (req, res, next) => {
  try {
    const { email, full_name, role, department_id, password } = req.body;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
    if (!full_name || !full_name.trim()) return res.status(400).json({ error: 'full_name is required.' });
    if (!VALID_ROLES.has(role)) return res.status(400).json({ error: `Invalid role: ${role}` });
    // Upper bound added with v112 (H-17). The password check now runs in the
    // database via pgcrypto, whose crypt() implements $2a$ while node-bcrypt
    // writes $2b$. They are the same algorithm and agree for every password
    // under 256 bytes; the prefixes differ only over a length-handling bug that
    // $2b$ fixed. Capping well below that boundary means the two can never
    // disagree — a password that node could set but the database could not
    // verify would lock the account out. 128 is far more than anyone types and
    // far less than 256. (bcrypt itself only consumes the first 72 bytes.)
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD_LENGTH) return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` });
    if (department_id) {
      const { rows: d } = await query('SELECT 1 FROM departments WHERE id = $1', [department_id]);
      if (!d.length) return res.status(400).json({ error: 'Unknown department.' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    let rows;
    try {
      ({ rows } = await query(
        `INSERT INTO users (email, full_name, password_hash, role, department_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, full_name, role, department_id, is_active`,
        [email.trim().toLowerCase(), full_name.trim(), password_hash, role, department_id || null],
      ));
    } catch (dbErr) {
      if ((dbErr.message || '').includes('users_email_key')) {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw dbErr;
    }
    res.status(201).json({ ...rows[0], additional_roles: [] });
  } catch (err) { next(err); }
});

/**
 * POST /admin/users/:id/reset-password — set a new password.
 * Body: { password }
 */
router.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = req.body;
    // Upper bound added with v112 (H-17). The password check now runs in the
    // database via pgcrypto, whose crypt() implements $2a$ while node-bcrypt
    // writes $2b$. They are the same algorithm and agree for every password
    // under 256 bytes; the prefixes differ only over a length-handling bug that
    // $2b$ fixed. Capping well below that boundary means the two can never
    // disagree — a password that node could set but the database could not
    // verify would lock the account out. 128 is far more than anyone types and
    // far less than 256. (bcrypt itself only consumes the first 72 bytes.)
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (password.length > MAX_PASSWORD_LENGTH) return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` });
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rowCount } = await query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
      [password_hash, req.params.id],
    );
    if (!rowCount) return res.status(404).json({ error: 'User not found.' });
    res.json({ id: req.params.id, ok: true });
  } catch (err) { next(err); }
});

/**
 * POST /admin/users/:id/reset-totp — clear the user's TOTP enrolment so they can
 * log in with their password and re-enrol a fresh authenticator.
 */
router.post('/users/:id/reset-totp', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, updated_at = now() WHERE id = $1',
      [req.params.id],
    );
    if (!rowCount) return res.status(404).json({ error: 'User not found.' });
    res.json({ id: req.params.id, totp_enabled: false });
  } catch (err) { next(err); }
});

module.exports = router;
