'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

const VALID_STATUSES = new Set(['planned', 'in_progress', 'completed', 'deferred', 'cancelled']);

/**
 * GET /api/v1/governance/sap/actions
 *
 * Returns all security actions with joined owner and plan data.
 * Optional query param:
 *   ?status=overdue              — target_date past and not done/cancelled
 *   ?status=planned|in_progress|completed|deferred|cancelled
 *
 * Response:
 *   200 { actions: [...] }
 *   400 on invalid status value
 *   500 on unexpected error
 */
async function getSecurityActions(req, res, next) {
  const { status } = req.query;

  if (status && status !== 'overdue' && !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `Invalid status filter: ${status}` });
  }

  try {
    let whereClause = '';
    const params = [];

    if (status === 'overdue') {
      whereClause = `WHERE sa.target_date < CURRENT_DATE
                       AND sa.status NOT IN ('completed', 'cancelled')`;
    } else if (status) {
      params.push(status);
      whereClause = `WHERE sa.status = $1`;
    }

    const result = await query(
      `SELECT
         sa.id,
         sa.title,
         sa.description,
         sa.status,
         sa.treatment_type,
         sa.target_date,
         sa.completed_at,
         (SELECT n.note FROM security_action_notes n
            WHERE n.action_id = sa.id ORDER BY n.created_at DESC LIMIT 1) AS progress_notes,
         sa.requires_siro_signoff,
         sa.siro_signoff_at,
         u.full_name                                              AS owner_name,
         sap.title                                               AS plan_title,
         (sa.target_date < CURRENT_DATE
           AND sa.status NOT IN ('completed', 'cancelled'))      AS is_overdue,
         (SELECT sar.risk_id FROM security_action_risks sar
           WHERE sar.action_id = sa.id
           ORDER BY sar.created_at LIMIT 1)                      AS risk_id
       FROM security_actions sa
       JOIN security_action_plans sap ON sap.id = sa.plan_id
       JOIN users u                   ON u.id   = sa.primary_owner_user_id
       ${whereClause}
       ORDER BY
         (sa.target_date < CURRENT_DATE
           AND sa.status NOT IN ('completed', 'cancelled')) DESC,
         sa.target_date ASC NULLS LAST,
         sa.created_at  DESC`,
      params
    );

    res.json({ actions: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSecurityActions };
