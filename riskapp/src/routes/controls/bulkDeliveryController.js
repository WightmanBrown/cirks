'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// POST /controls/delivery — set how several controls are delivered (v127).
// Body: { control_ids: [uuid…], delivery: 'organisation' | 'group' | 'system' | null }
// All-or-nothing, audited per control. First-time triage is the use: marking all 31
// NIST governance objectives organisation-wide should be one act, not 31.

const { withActor } = require('../../db/pool');

const DELIVERY = new Set(['organisation', 'group', 'system']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 500;

module.exports = async function bulkDelivery(req, res, next) {
  const { control_ids, delivery } = req.body || {};
  if (!Array.isArray(control_ids) || !control_ids.length || control_ids.length > MAX
      || control_ids.some(id => typeof id !== 'string' || !UUID_RE.test(id))) {
    return res.status(400).json({ error: `control_ids must be 1–${MAX} control objective ids.` });
  }
  if (delivery !== null && !DELIVERY.has(delivery)) {
    return res.status(400).json({ error: 'delivery must be organisation, group or system (or null for not stated).' });
  }
  const ids = [...new Set(control_ids)];
  try {
    const result = await withActor(req.user.id, async (db) => {
      const found = await db.query(`SELECT id, title, delivery FROM controls WHERE id = ANY($1::uuid[])`, [ids]);
      if (found.rows.length !== ids.length) return { status: 404, error: 'One or more control objectives were not found.' };
      const changed = found.rows.filter(r => (r.delivery ?? null) !== delivery);
      if (changed.length) {
        await db.query(`UPDATE controls SET delivery = $2, updated_at = now() WHERE id = ANY($1::uuid[])`,
          [changed.map(r => r.id), delivery]);
        for (const r of changed) {
          await db.query(
            `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, field_name, old_value, new_value, human_narrative)
             VALUES ($1, 'update', 'control_objective', $2, $3, 'delivery', $4, $5, $6)`,
            [req.user.id, r.id, r.title, r.delivery, delivery,
             `Delivery set (bulk, ${ids.length} objectives): ${delivery ?? 'not stated'}`]);
        }
      }
      return { updated: changed.length, unchanged: ids.length - changed.length };
    });
    if (result.status) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (err) { next(err); }
};
