'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Admin audit-log viewer — read-only window onto the `audit_log` table
 * (Layer 1 of the three-layer audit strategy: governance mutations written
 * inside stored functions + a few controllers).
 *
 * Mounted under the admin router (routes/admin/index.js), which applies
 * `authenticate` + `requireCapability('admin.manage')` to every sub-route.
 *
 *   GET /admin/audit?entity_type=&action=&user=&q=&from=&to=&limit=&offset=
 *     → { rows, total, limit, offset, filters: { entity_types, actions } }
 *
 * Read-only by design — audit_log is append-only; there is no write route.
 */

const { Router } = require('express');
const { query }  = require('../../db/pool');

const router = Router();

const MAX_LIMIT     = 200;
const DEFAULT_LIMIT = 50;

router.get('/', async (req, res, next) => {
  try {
    const { entity_type, action, user, q, from, to } = req.query;

    const limit  = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    // Build the WHERE clause from whichever filters are supplied. `p()` pushes a
    // bind value and returns its $N placeholder, so a value can be reused.
    const where  = [];
    const params = [];
    const p = (val) => { params.push(val); return `$${params.length}`; };

    if (entity_type) where.push(`entity_type = ${p(entity_type)}`);
    if (action)      where.push(`action = ${p(action)}::audit_action`);
    if (user) {
      const ph = p(`%${user}%`);
      where.push(`(user_name ILIKE ${ph} OR user_role::text ILIKE ${ph})`);
    }
    if (q) {
      const ph = p(`%${q}%`);
      where.push(`(human_narrative ILIKE ${ph} OR entity_label ILIKE ${ph})`);
    }
    if (from) where.push(`created_at >= ${p(from)}::date`);
    if (to)   where.push(`created_at < (${p(to)}::date + interval '1 day')`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM audit_log ${whereSql}`,
      params
    );
    const total = countRows[0].total;

    const { rows } = await query(
      `SELECT id, created_at, user_id, user_name, user_role, effective_role,
              acting_as_note, entity_type, entity_id, entity_label, action,
              field_name, old_value, new_value, changes, human_narrative,
              ip_address, user_agent
         FROM audit_log
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    // Distinct values actually present, to populate the filter dropdowns.
    const { rows: etRows } = await query(
      `SELECT DISTINCT entity_type FROM audit_log WHERE entity_type IS NOT NULL ORDER BY entity_type`
    );
    const { rows: acRows } = await query(
      `SELECT DISTINCT action::text AS action FROM audit_log ORDER BY action`
    );

    res.json({
      rows,
      total,
      limit,
      offset,
      filters: {
        entity_types: etRows.map(r => r.entity_type),
        actions:      acRows.map(r => r.action),
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
