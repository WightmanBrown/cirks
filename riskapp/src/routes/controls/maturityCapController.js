'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// PATCH /controls/:id/maturity-cap — set a control's responsible owner.
//
// The v83 per-deployment maturity CEILING (max_maturity + reason) was retired in
// Stage 3: maturity is now an organisation-wide property of the control, so there is
// nothing per-system to cap. This endpoint keeps only the responsible-owner
// assignment (controls.owner_user_id). Assigning the owner requires controls.write.
// (Route path unchanged for now; the frontend still calls /maturity-cap.)

const { query } = require('../../db/pool');
const { can }   = require('../../auth/permissions');

module.exports = async function setControlOwner(req, res, next) {
  try {
    const { id } = req.params;
    const { owner_user_id } = req.body;

    if (owner_user_id === undefined) {
      return res.status(400).json({ error: 'owner_user_id is required (null to clear).' });
    }
    if (!can(req.user.role, 'controls.write').allowed) {
      return res.status(403).json({ error: 'Assigning the responsible owner requires the controls.write capability.' });
    }

    const ctrlRes = await query(`SELECT id FROM controls WHERE id = $1`, [id]);
    if (!ctrlRes.rows.length) return res.status(404).json({ error: 'Control not found.' });

    const { rows } = await query(
      `UPDATE controls SET owner_user_id = $1, updated_at = now() WHERE id = $2
       RETURNING id, owner_user_id`,
      [owner_user_id || null, id]
    );

    let owner_name = null;
    if (rows[0].owner_user_id) {
      const ur = await query(`SELECT full_name FROM users WHERE id = $1`, [rows[0].owner_user_id]);
      owner_name = ur.rows[0]?.full_name ?? null;
    }

    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, human_narrative)
       VALUES ($1, 'update', 'control', $2, $3)`,
      [req.user.id, id, 'Control responsible owner updated']
    );

    res.json({ control: { ...rows[0], owner_name } });
  } catch (err) { next(err); }
};
