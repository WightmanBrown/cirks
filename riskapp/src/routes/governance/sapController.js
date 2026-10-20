'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

/**
 * GET /api/v1/governance/sap/overdue
 *
 * Returns count of overdue security actions — actions where target_date is in
 * the past and status is not completed or cancelled.
 *
 * Read from security_actions directly — no stored function needed for a count query.
 *
 * Response:
 *   200 { count: number }
 *   500 on unexpected error
 */
async function getOverdueActionCount(req, res, next) {
  try {
    const result = await query(
      `SELECT COUNT(*) AS count
         FROM security_actions
        WHERE target_date < CURRENT_DATE
          AND status NOT IN ('completed', 'cancelled')`,
      []
    );

    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getOverdueActionCount };
