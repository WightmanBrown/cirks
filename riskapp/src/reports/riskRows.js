'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The active-risk query every report reads (src/routes/reports, src/reports).

const OPEN_ACTION = `a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')`;

// One row per active risk, with what every part of the report needs. The
// target score goes through derive_summary_score(), the function the risk
// trigger uses, so it cannot disagree with the register's own arithmetic.
// Target is per dimension the committed work's probability where it is lower
// than today's, else today's (an action only lowers a dimension). There is no
// inherent risk score: CIRKS shows inherent IMPACT, not inherent risk, and no
// risk records an inherent probability.
const RISKS_SQL = `
  WITH r AS (
    SELECT x.id, x.risk_score AS score, x.treatment_decision, x.review_date,
           x.probability_c, x.probability_i, x.probability_a,
           COALESCE(s.impact_c, 1) AS impact_c, COALESCE(s.impact_i, 1) AS impact_i, COALESCE(s.impact_a, 1) AS impact_a,
           t.tgt_p_c, t.tgt_p_i, t.tgt_p_a,
           s.id AS system_id, s.name AS system_name,
           d.id AS department_id, d.name AS department_name,
           th.name AS threat_name,
           CASE WHEN t.risk_id IS NULL OR num_nulls(t.tgt_p_c, t.tgt_p_i, t.tgt_p_a) = 3 THEN NULL
                ELSE derive_summary_score(
                  GREATEST(1, LEAST(25, COALESCE(s.impact_c, 1) * LEAST(COALESCE(t.tgt_p_c, x.probability_c), x.probability_c)))::smallint,
                  GREATEST(1, LEAST(25, COALESCE(s.impact_i, 1) * LEAST(COALESCE(t.tgt_p_i, x.probability_i), x.probability_i)))::smallint,
                  GREATEST(1, LEAST(25, COALESCE(s.impact_a, 1) * LEAST(COALESCE(t.tgt_p_a, x.probability_a), x.probability_a)))::smallint)
           END AS target_score,
           EXISTS (SELECT 1 FROM security_action_risks sar
                     JOIN security_actions a ON a.id = sar.action_id
                    WHERE sar.risk_id = x.id AND ${OPEN_ACTION})          AS has_open_action,
           EXISTS (SELECT 1 FROM exceptions e
                    WHERE e.risk_id = x.id AND e.status = 'active')       AS has_active_exception,
           o.owner_names, COALESCE(o.is_siro_fallback, FALSE)            AS owner_is_siro_fallback
      FROM risks x
      JOIN systems s       ON s.id = x.system_id
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN threats th    ON th.id = x.threat_id
      LEFT JOIN v_risk_target_probability t ON t.risk_id = x.id
      LEFT JOIN v_department_risk_owner o   ON o.department_id = s.department_id
     WHERE x.is_active
  )
  SELECT * FROM r`;

module.exports = { RISKS_SQL, OPEN_ACTION };
