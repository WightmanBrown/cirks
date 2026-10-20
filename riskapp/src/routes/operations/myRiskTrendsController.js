'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * GET /operations/my-risk-trends
 *
 * Returns trend counts for risks owned by the requesting user, measured
 * against the date of the last issued SWG meeting (or the beginning of time
 * when no meeting has been issued yet — all risks count as "new" in that case).
 *
 * Counts:
 *   new_count        — active risks created after last SWG
 *   increased_count  — pre-existing active risks whose max risk score worsened
 *                      since last SWG (derived from risk_residual_history)
 *   reduced_count    — pre-existing active risks whose max risk score improved
 *   eliminated_count — risks deactivated after last SWG BECAUSE THE EXPOSURE
 *                      ENDED. Risks retired as 'raised_in_error' are excluded:
 *                      a typo is not an achievement (v100). Rows retired before
 *                      v100 carry a NULL reason and still count, so existing MI
 *                      is preserved rather than silently rewritten.
 *   last_swg_date    — ISO date of the reference meeting (or null)
 *
 * The "score" used for increased/reduced is MAX(probability_dim × impact_dim)
 * across the three CIA dimensions.  If a risk has no history entries after the
 * last SWG its score is treated as unchanged (counts as neither increased nor
 * reduced).
 *
 * Role: information_asset_owner. "Mine" is derived (v108): the risks on systems
 * in a department where the caller is the accountable owner — its IAO, or the
 * SIRO where that department has none. A SIRO therefore sees the risks of every
 * unstaffed department, which is exactly what the fallback means.
 */

const { query } = require('../../db/pool');

async function getMyRiskTrends(req, res, next) {
  try {
    const userId = req.user.id;

    const { rows } = await query(`
      WITH last_swg AS (
        SELECT
          MAX(meeting_date)                          AS dt,
          to_char(MAX(meeting_date), 'YYYY-MM-DD')  AS dt_str
        FROM working_group_meetings
        WHERE minutes_issued_at IS NOT NULL
      ),

      -- All risks belonging to this user (active or recently deactivated)
      my_risks AS (
        SELECT
          r.id,
          r.created_at,
          r.updated_at,
          r.is_active,
          r.retired_reason,
          -- Current max score = the stored risk_score (impact derived from the
          -- system's assets × probability; Option A — no per-risk residual_impact).
          COALESCE(r.risk_score, 0) AS current_score
        FROM risks r
        JOIN systems sys ON sys.id = r.system_id
        JOIN v_department_risk_owner dro ON dro.department_id = sys.department_id
        WHERE $1 = ANY (dro.owner_user_ids)
      ),

      -- For each risk, recover the score it held just before the last SWG.
      -- Strategy: take the prev_* values from the earliest history entry that
      -- was recorded AFTER last_swg_date.  If there are no post-SWG entries
      -- the score is unchanged (treat as equal to current → not increased/reduced).
      score_at_swg AS (
        SELECT
          mr.id,
          mr.created_at,
          mr.updated_at,
          mr.is_active,
          mr.retired_reason,
          mr.current_score,
          COALESCE(
            (
              SELECT GREATEST(
                COALESCE(h.prev_probability_c, 0) * COALESCE(h.prev_residual_imp_c, 0),
                COALESCE(h.prev_probability_i, 0) * COALESCE(h.prev_residual_imp_i, 0),
                COALESCE(h.prev_probability_a, 0) * COALESCE(h.prev_residual_imp_a, 0)
              )
              FROM risk_residual_history h
              WHERE h.risk_id = mr.id
                AND h.changed_at > (SELECT COALESCE(dt, '1970-01-01'::date) FROM last_swg)
              ORDER BY h.changed_at ASC
              LIMIT 1
            ),
            mr.current_score   -- no post-SWG history → treat as unchanged
          ) AS score_before_swg
        FROM my_risks mr
      )

      SELECT
        (SELECT dt_str FROM last_swg)                          AS last_swg_date,

        COUNT(*) FILTER (
          WHERE is_active
            AND created_at > (SELECT COALESCE(dt, '1970-01-01'::date) FROM last_swg)
        )::int                                                 AS new_count,

        COUNT(*) FILTER (
          WHERE NOT is_active
            AND retired_reason IS DISTINCT FROM 'raised_in_error'
            AND updated_at > (SELECT COALESCE(dt, '1970-01-01'::date) FROM last_swg)
        )::int                                                 AS eliminated_count,

        COUNT(*) FILTER (
          WHERE is_active
            AND created_at <= (SELECT COALESCE(dt, '1970-01-01'::date) FROM last_swg)
            AND current_score > score_before_swg
        )::int                                                 AS increased_count,

        COUNT(*) FILTER (
          WHERE is_active
            AND created_at <= (SELECT COALESCE(dt, '1970-01-01'::date) FROM last_swg)
            AND current_score < score_before_swg
        )::int                                                 AS reduced_count

      FROM score_at_swg
    `, [userId]);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyRiskTrends };
