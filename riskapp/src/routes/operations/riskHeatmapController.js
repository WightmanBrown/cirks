'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

/**
 * GET /api/v1/operations/risk-heatmap
 *
 * Returns the data needed to render a 5×5 probability/impact heat map.
 *
 * For CISO and risk_analyst: all active risks.
 * For information_asset_manager and information_asset_owner: risks scoped to their
 * department only (looked up from users.department_id).
 *
 * Each risk is reduced to its worst-case position:
 *   - max_probability: MAX(probability_c, probability_i, probability_a)
 *   - max_impact:      MAX(impact_c, impact_i, impact_a)
 *
 * Response:
 *   200 { risks: [{ risk_id, max_probability, max_impact }] }
 *   403 if role is not permitted
 *   500 on unexpected error
 */

const GLOBAL_ROLES     = new Set(['ciso', 'risk_analyst', 'meeting_secretary', 'soc_analyst', 'security_architect']);
const DEPARTMENT_ROLES = new Set(['information_asset_manager', 'information_asset_owner']);

async function getRiskHeatmap(req, res, next) {
  try {
    const { role, id: userId } = req.user;

    if (GLOBAL_ROLES.has(role)) {
      const result = await query(
        `SELECT
           r.id AS risk_id,
           GREATEST(r.probability_c, r.probability_i, r.probability_a) AS max_probability,
           GREATEST(sys.impact_c, sys.impact_i, sys.impact_a)          AS max_impact
         FROM risks r
         JOIN systems sys ON sys.id = r.system_id
         WHERE r.is_active = TRUE`,
        []
      );

      return res.json({ risks: result.rows });
    }

    if (DEPARTMENT_ROLES.has(role)) {
      const userRes = await query(
        `SELECT department_id FROM users WHERE id = $1`,
        [userId]
      );

      const deptId = userRes.rows[0]?.department_id;

      if (!deptId) {
        return res.json({ risks: [] });
      }

      const result = await query(
        `SELECT
           r.id AS risk_id,
           GREATEST(r.probability_c, r.probability_i, r.probability_a) AS max_probability,
           GREATEST(sys.impact_c, sys.impact_i, sys.impact_a)          AS max_impact
         FROM risks r
         JOIN systems sys ON sys.id = r.system_id
         WHERE r.is_active = TRUE
           AND sys.department_id = $1`,
        [deptId]
      );

      return res.json({ risks: result.rows });
    }

    // Role not permitted for this endpoint.
    return res.status(403).json({ error: 'Forbidden.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getRiskHeatmap };
