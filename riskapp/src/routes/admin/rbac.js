'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Admin RBAC configuration API (Phase 7 of docs/configurable-rbac-plan.md).
// Mounted under /admin, which already requires authentication + admin.manage, so
// every route here is admin-only. Edits call refreshFromDb() so the in-memory
// resolver reflects the change immediately (no restart).

const { Router } = require('express');
const { query, pool } = require('../../db/pool');
const { refreshFromDb } = require('../../auth/permissions');

const router = Router();

const SCOPES = new Set(['all_depts', 'own_dept']);
// Floor mirrored from permissions.js: admin always keeps admin.manage.
const ADMIN_FLOOR = { admin: ['admin.manage'] };

async function isValidRole(role) {
  const { rows } = await query(
    `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'user_role' AND e.enumlabel = $1`,
    [role],
  );
  return rows.length > 0;
}

// GET /admin/rbac — the full editable picture: catalogue, role matrix, SoD, isolation.
router.get('/', async (req, res, next) => {
  try {
    const [caps, perms, roleRows, sod, cfg] = await Promise.all([
      query(`SELECT key, resource, action, dept_scopable, description FROM capabilities ORDER BY resource, action, key`),
      query(`SELECT role, capability_key, scope FROM role_permissions ORDER BY role, capability_key`),
      query(`SELECT enumlabel AS role FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'user_role' ORDER BY e.enumsortorder`),
      query(`SELECT key, description, enabled FROM sod_rules ORDER BY key`),
      query(`SELECT department_isolation FROM org_config LIMIT 1`),
    ]);
    const matrix = {};
    for (const r of perms.rows) (matrix[r.role] ||= []).push({ capability_key: r.capability_key, scope: r.scope });
    res.json({
      roles: roleRows.rows.map((r) => r.role),
      capabilities: caps.rows,
      matrix,
      sod_rules: sod.rows,
      department_isolation: cfg.rows[0]?.department_isolation ?? false,
    });
  } catch (err) { next(err); }
});

// PUT /admin/rbac/role-permissions/:role — replace a role's grants.
// Body: { grants: [{ capability_key, scope }] }
router.put('/role-permissions/:role', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { role } = req.params;
    const grants = Array.isArray(req.body?.grants) ? req.body.grants : null;
    if (!grants) return res.status(400).json({ error: 'grants array is required.' });
    if (!(await isValidRole(role))) return res.status(404).json({ error: `Unknown role: ${role}` });

    // Validate every capability key + scope before writing anything.
    const { rows: capRows } = await query('SELECT key FROM capabilities');
    const validCaps = new Set(capRows.map((c) => c.key));
    for (const g of grants) {
      if (!validCaps.has(g.capability_key)) return res.status(400).json({ error: `Unknown capability: ${g.capability_key}` });
      if (!SCOPES.has(g.scope)) return res.status(400).json({ error: `Invalid scope for ${g.capability_key}: ${g.scope}` });
    }

    // Admin-floor: force-keep the non-removable capabilities for this role.
    const merged = new Map(grants.map((g) => [g.capability_key, g.scope]));
    for (const k of ADMIN_FLOOR[role] ?? []) if (!merged.has(k)) merged.set(k, 'all_depts');

    await client.query('BEGIN');
    await client.query('DELETE FROM role_permissions WHERE role = $1', [role]);
    for (const [capability_key, scope] of merged) {
      await client.query(
        'INSERT INTO role_permissions (role, capability_key, scope) VALUES ($1, $2, $3)',
        [role, capability_key, scope],
      );
    }
    await client.query('COMMIT');

    await refreshFromDb(); // apply live
    res.json({ role, grants: [...merged.entries()].map(([capability_key, scope]) => ({ capability_key, scope })) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /admin/rbac/sod-rules/:key — toggle a separation-of-duties rule.
// Body: { enabled: boolean }. Triggers read sod_rules live, so no resolver refresh.
router.patch('/sod-rules/:key', async (req, res, next) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean.' });
    const { rows } = await query(
      'UPDATE sod_rules SET enabled = $1 WHERE key = $2 RETURNING key, description, enabled',
      [enabled, req.params.key],
    );
    if (!rows.length) return res.status(404).json({ error: `Unknown SoD rule: ${req.params.key}` });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /admin/rbac/department-isolation — flip the org-wide isolation switch.
// Body: { enabled: boolean }
router.patch('/department-isolation', async (req, res, next) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean.' });
    await query('UPDATE org_config SET department_isolation = $1', [enabled]);
    await refreshFromDb(); // apply live
    res.json({ department_isolation: enabled });
  } catch (err) { next(err); }
});

module.exports = router;
