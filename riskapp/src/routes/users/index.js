'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { query }    = require('../../db/pool');
const { capabilitiesForRole } = require('../../auth/permissions');

const router = Router();
router.use(authenticate);

// GET /users/me/capabilities — the resolved capability set for the caller's active
// role, plus the org's department-isolation flag and the caller's home department.
// The frontend uses this to drive nav + route visibility (replacing hardcoded role
// lists). Any authenticated user may read their own capabilities.
router.get('/me/capabilities', async (req, res, next) => {
  try {
    const [caps, ctx] = await Promise.all([
      capabilitiesForRole(req.user.role),
      query(
        `SELECT (SELECT department_isolation FROM org_config LIMIT 1) AS department_isolation,
                u.department_id
         FROM users u WHERE u.id = $1`,
        [req.user.id]
      ),
    ]);
    res.json({
      role: req.user.role,
      department_id: ctx.rows[0]?.department_id ?? null,
      department_isolation: ctx.rows[0]?.department_isolation ?? false,
      capabilities: caps,
    });
  } catch (err) { next(err); }
});

const canView = requireCapability('users.read');

// GET /users — active user list for owner dropdowns. Includes department + role
// so callers can show "name — department — role" and default a risk owner to the
// system's IAO (the active information_asset_owner of the system's department).
router.get('/', canView, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.role,
              u.department_id, d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.is_active = TRUE
        ORDER BY u.full_name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Dashboard layout (per-user UI preference) ──────────────────────────────────
// Stores react-grid-layout positions keyed by breakpoint. Only position/order
// is persisted; widget heights are auto-fit to content on the client.

// Validate the layout payload: { <breakpoint>: [ { i, x, y, w }, ... ], ... }
function isValidLayout(layout) {
  if (layout === null) return true;                       // null = reset to default
  if (typeof layout !== 'object' || Array.isArray(layout)) return false;

  for (const items of Object.values(layout)) {
    if (!Array.isArray(items)) return false;
    for (const it of items) {
      if (typeof it !== 'object' || it === null) return false;
      if (typeof it.i !== 'string') return false;
      for (const k of ['x', 'y', 'w']) {
        if (!Number.isInteger(it[k]) || it[k] < 0) return false;
      }
    }
  }
  return true;
}

// GET /users/me/dashboard-layout → { layout: <jsonb|null> }
router.get('/me/dashboard-layout', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT dashboard_layout FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ layout: rows[0]?.dashboard_layout ?? null });
  } catch (err) { next(err); }
});

// PUT /users/me/dashboard-layout  body: { layout: <object|null> }
router.put('/me/dashboard-layout', async (req, res, next) => {
  try {
    const { layout } = req.body;
    if (!isValidLayout(layout)) {
      return res.status(400).json({ error: 'Invalid layout payload.' });
    }
    const { rows } = await query(
      `UPDATE users SET dashboard_layout = $1 WHERE id = $2 RETURNING dashboard_layout`,
      [layout === null ? null : JSON.stringify(layout), req.user.id]
    );
    res.json({ layout: rows[0]?.dashboard_layout ?? null });
  } catch (err) { next(err); }
});

// ── View mode preference ───────────────────────────────────────────────────────
// Stores whether the user defaults to 'business' or 'expert' display mode.
// Users can switch per-session on any relevant page; this is their account-
// wide default that pages initialise from.

// GET /users/me/view-mode → { view_mode: 'business' | 'expert' }
router.get('/me/view-mode', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT view_mode FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ view_mode: rows[0]?.view_mode ?? 'business' });
  } catch (err) { next(err); }
});

// PUT /users/me/view-mode  body: { view_mode: 'business' | 'expert' }
router.put('/me/view-mode', async (req, res, next) => {
  try {
    const { view_mode } = req.body;
    if (!['business', 'expert'].includes(view_mode)) {
      return res.status(400).json({ error: "view_mode must be 'business' or 'expert'." });
    }
    await query(
      `UPDATE users SET view_mode = $1 WHERE id = $2`,
      [view_mode, req.user.id]
    );
    res.json({ view_mode });
  } catch (err) { next(err); }
});

module.exports = router;
