// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// riskapp/src/routes/operations/riskHeatmapDetailController.js
'use strict';

const { query } = require('../../db/pool');
const { isDepartmentIsolationEnabled } = require('../../auth/permissions');

/**
 * Shared controller for:
 *   GET /api/v1/operations/risk-heatmap/current  — validated risks
 *   GET /api/v1/operations/risk-heatmap/future   — pending + returned risks
 *
 * Both endpoints return the same response shape:
 *   { count: number, risks: Array<RiskDetail> }
 *
 * RiskDetail fields:
 *   risk_id, system_name, asset_name, threat_name, department
 *   prob_c, prob_i, prob_a          — analyst-set probability per CIA dimension
 *   impact_c, impact_i, impact_a    — asset CIA impact ratings (1–5)
 *   mitigation_title                — title of the highest-priority active action, or null
 *   mitigation_status               — 'in_progress' | 'planned' | 'deferred' | null
 *
 * Mitigation priority (per risk, one row via LATERAL):
 *   in_progress (1) > planned (2) > deferred (3)
 *   completed and cancelled actions are excluded from this pick.
 *
 * Role scoping:
 *   Global roles  (ciso, risk_analyst, meeting_secretary) — all risks
 *   IAM + IAO     (dept-scoped roles)                      — own department only
 *   Other roles                                            — 403
 *
 * IAO was previously identity-scoped (own assigned risks); it now reads its
 * whole department like IAM — the dept-head accountability model. See memory
 * project_access_scoping.
 */

// Mitigation priority expression — lower number = higher priority
const MITIGATION_PRIORITY = `
  CASE sa.status
    WHEN 'in_progress' THEN 1
    WHEN 'planned'     THEN 2
    WHEN 'deferred'    THEN 3
    ELSE                    4
  END
`;

/**
 * Build the core SELECT for a given validation_status filter.
 *
 * @param {string}      statusClause  SQL fragment for the WHERE status condition
 * @param {string|null} deptClause    e.g. 'AND ia.department_id = $1', or ''
 */
function buildSQL(statusClause, deptClause = '') {
  return `
    SELECT
      r.id                  AS risk_id,
      r.system_id           AS system_id,
      sys.name              AS system_name,
      ia.name               AS asset_name,
      t.name                AS threat_name,
      d.name                AS department,
      sys.department_id     AS department_id,
      dro.owner_names       AS owner_name,
      dro.is_siro_fallback  AS owner_is_siro_fallback,
      r.validation_status   AS validation_status,
      r.validation_notes    AS validation_notes,
      r.probability_c                               AS prob_c,
      r.probability_i                               AS prob_i,
      r.probability_a                               AS prob_a,
      COALESCE(r.inherent_probability_c, r.probability_c) AS inherent_prob_c,
      COALESCE(r.inherent_probability_i, r.probability_i) AS inherent_prob_i,
      COALESCE(r.inherent_probability_a, r.probability_a) AS inherent_prob_a,
      sys.impact_c                                  AS impact_c,
      sys.impact_i                                  AS impact_i,
      sys.impact_a                                  AS impact_a,
      sys.impact_c                                  AS residual_impact_c,
      sys.impact_i                                  AS residual_impact_i,
      sys.impact_a                                  AS residual_impact_a,
      best_action.title     AS mitigation_title,
      best_action.status    AS mitigation_status,
      COALESCE(pdcd.preventive, 0) AS pdcd_preventive,
      COALESCE(pdcd.detective, 0) AS pdcd_detective,
      COALESCE(pdcd.corrective, 0) AS pdcd_corrective,
      COALESCE(pdcd.deterrent, 0) AS pdcd_deterrent,
      -- NB the CASE guards are load-bearing: LEAST() ignores NULL arguments, so
      -- without them a risk with no open items would report a "target" equal to
      -- its current probability instead of the '—' the summary page expects.
      CASE WHEN combined_target.tgt_p_c IS NULL THEN NULL
           ELSE LEAST(combined_target.tgt_p_c, r.probability_c) END AS tgt_p_c,
      CASE WHEN combined_target.tgt_p_i IS NULL THEN NULL
           ELSE LEAST(combined_target.tgt_p_i, r.probability_i) END AS tgt_p_i,
      CASE WHEN combined_target.tgt_p_a IS NULL THEN NULL
           ELSE LEAST(combined_target.tgt_p_a, r.probability_a) END AS tgt_p_a,
      -- Work is planned whose effect nobody has judged: the register says so
      -- instead of showing a bare dash.
      COALESCE(combined_target.objectives_to_be_in_place, 0) AS tgt_objectives,
      COALESCE(combined_target.objectives_judged, 0)         AS tgt_objectives_judged,
      -- Impact is derived from the system (Option A); an action only lowers the
      -- probability, so the target impact is always the system's C/I/A.
      sys.impact_c AS tgt_imp_c,
      sys.impact_i AS tgt_imp_i,
      sys.impact_a AS tgt_imp_a
    FROM risks r
    JOIN systems sys            ON sys.id = r.system_id
    JOIN departments d          ON d.id   = sys.department_id
    JOIN threats t              ON t.id   = r.threat_id
    LEFT JOIN information_assets ia ON ia.id = r.asset_id
    LEFT JOIN v_department_risk_owner dro ON dro.department_id = sys.department_id
    LEFT JOIN LATERAL (
      SELECT sa.title, sa.status
        FROM security_action_risks sar
        JOIN security_actions sa ON sa.id = sar.action_id
       WHERE sar.risk_id = r.id
         AND sa.status NOT IN ('completed', 'cancelled')
       ORDER BY ${MITIGATION_PRIORITY} ASC
       LIMIT 1
    ) best_action ON TRUE
    -- Target probability, DERIVED (v154): the judged residuals of the objectives
    -- this risk's open component items will bring into place. It was the MIN of
    -- the open CONTROL items' typed targets; control items are retired. Combining
    -- with the current probability happens in the outer SELECT: work can only
    -- ever lower a dimension, never raise it.
    LEFT JOIN v_risk_target_probability combined_target ON combined_target.risk_id = r.id
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN c.control_type = 'preventive' THEN 1 ELSE 0 END)::int AS preventive,
        SUM(CASE WHEN c.control_type = 'detective'  THEN 1 ELSE 0 END)::int AS detective,
        SUM(CASE WHEN c.control_type = 'corrective' THEN 1 ELSE 0 END)::int AS corrective,
        SUM(CASE WHEN c.control_type = 'deterrent'  THEN 1 ELSE 0 END)::int AS deterrent
        FROM v_control_presence sc
        JOIN control_threats ct ON ct.control_id = sc.control_id AND ct.threat_id = r.threat_id
        JOIN controls c ON c.id = sc.control_id
       WHERE sc.system_id = r.system_id AND sc.status <> 'not_applicable'
    ) pdcd ON TRUE
    WHERE r.is_active = TRUE
      AND ${statusClause}
      ${deptClause}
    ORDER BY sys.name, ia.name NULLS LAST
  `;
}

// admin included (v109): it already holds risks.read and every other
// cross-department read, so excluding it here made the risk register the one
// thing an administrator could not look at.
const GLOBAL_ROLES = new Set(['admin', 'ciso', 'risk_analyst', 'meeting_secretary', 'soc_analyst', 'security_architect']);
// IAM and IAO are both scoped to their own department's systems.
const DEPT_SCOPED_ROLES = new Set(['information_asset_manager', 'information_asset_owner']);

/**
 * Factory that returns an async Express handler for a given view.
 *
 * @param {'current'|'future'} view
 */
function makeHandler(view) {
  const statusClause = view === 'current'
    ? `r.validation_status = 'validated'`
    : `r.validation_status IN ('pending', 'returned')`;

  return async function handler(req, res, next) {
    try {
      const { role, id: userId } = req.user;

      // Unscoped view: global roles always; dept-scoped roles too when
      // department isolation is off (spreadsheet mode — no dept walls).
      if (GLOBAL_ROLES.has(role) || !isDepartmentIsolationEnabled()) {
        const result = await query(buildSQL(statusClause), []);
        return res.json({ count: result.rows.length, risks: result.rows });
      }

      // IAM + IAO: see all risks in their own department (system-dept scoped).
      if (DEPT_SCOPED_ROLES.has(role)) {
        const userRes = await query(
          `SELECT department_id FROM users WHERE id = $1`,
          [userId]
        );
        const deptId = userRes.rows[0]?.department_id;

        if (!deptId) {
          return res.json({ count: 0, risks: [] });
        }

        const result = await query(
          buildSQL(statusClause, 'AND (sys.department_id = $1 OR sys.is_shared = TRUE)'),
          [deptId]
        );
        return res.json({ count: result.rows.length, risks: result.rows });
      }

      return res.status(403).json({ error: 'Forbidden.' });
    } catch (err) {
      next(err);
    }
  };
}

const getCurrentRisks = makeHandler('current');
const getFutureRisks  = makeHandler('future');

module.exports = { getCurrentRisks, getFutureRisks };
