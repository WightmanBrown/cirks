'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
const { query } = require('../../db/pool');

async function getSiroCyclePending(req, res, next) {
  try {
    const result = await query(
      `SELECT COUNT(*) AS count FROM review_cycles WHERE status = 'under_review'`
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) { next(err); }
}

async function getSiroActionPending(req, res, next) {
  try {
    const result = await query(
      `SELECT COUNT(*) AS count FROM security_actions
       WHERE requires_siro_signoff = TRUE
         AND siro_signoff_by IS NULL
         AND status NOT IN ('completed', 'cancelled')`
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) { next(err); }
}

async function getSiroCycles(req, res, next) {
  try {
    const result = await query(
      `WITH new_risks_cte AS (
         SELECT rri.cycle_id, COUNT(*)::int AS new_risks
         FROM risk_review_items rri
         JOIN review_cycles rc ON rc.id = rri.cycle_id
         WHERE NOT EXISTS (
           SELECT 1
           FROM risk_review_items rri_prev
           JOIN review_cycles rc_prev ON rc_prev.id = rri_prev.cycle_id
           WHERE rri_prev.risk_id = rri.risk_id
             AND rc_prev.start_date < rc.start_date
         )
         GROUP BY rri.cycle_id
       ),
       decision_counts AS (
         SELECT
           rri.cycle_id,
           COUNT(CASE WHEN rri.review_decision IN ('treat','transfer','avoid') THEN 1 END)::int AS reduced_risks,
           COUNT(CASE WHEN rri.review_decision = 'escalate'                   THEN 1 END)::int AS increased_risks
         FROM risk_review_items rri
         GROUP BY rri.cycle_id
       ),
       action_counts AS (
         SELECT
           sa.originated_cycle_id                                             AS cycle_id,
           COUNT(*)::int                                                      AS new_actions,
           COUNT(CASE WHEN sa.status = 'completed' THEN 1 END)::int          AS closed_actions
         FROM security_actions sa
         GROUP BY sa.originated_cycle_id
       )
       SELECT
         rc.id,
         rc.name,
         rc.start_date,
         rc.end_date,
         rc.frozen_at,
         u.full_name                           AS frozen_by_name,
         wgm.meeting_date,
         COALESCE(nr.new_risks,       0)       AS new_risks,
         COALESCE(dc.reduced_risks,   0)       AS reduced_risks,
         COALESCE(dc.increased_risks, 0)       AS increased_risks,
         COALESCE(ac.new_actions,     0)       AS new_actions,
         COALESCE(ac.closed_actions,  0)       AS closed_actions
       FROM review_cycles rc
       LEFT JOIN users u                      ON u.id               = rc.frozen_by
       LEFT JOIN working_group_meetings wgm   ON wgm.linked_cycle_id = rc.id
       LEFT JOIN new_risks_cte nr             ON nr.cycle_id         = rc.id
       LEFT JOIN decision_counts dc           ON dc.cycle_id         = rc.id
       LEFT JOIN action_counts ac             ON ac.cycle_id         = rc.id
       WHERE rc.status = 'under_review'
       ORDER BY rc.frozen_at DESC NULLS LAST`
    );
    res.json({ cycles: result.rows });
  } catch (err) { next(err); }
}

async function getSiroCycleDetail(req, res, next) {
  const { id } = req.params;
  try {
    const cycleResult = await query(
      `SELECT
         rc.id, rc.name, rc.status, rc.start_date, rc.end_date,
         rc.frozen_at, rc.approved_at,
         uf.full_name AS frozen_by_name,
         ua.full_name AS approved_by_name,
         wgm.meeting_date
       FROM review_cycles rc
       LEFT JOIN users uf                   ON uf.id = rc.frozen_by
       LEFT JOIN users ua                   ON ua.id = rc.approved_by
       LEFT JOIN working_group_meetings wgm ON wgm.linked_cycle_id = rc.id
       WHERE rc.id = $1`,
      [id]
    );
    if (!cycleResult.rows.length) {
      return res.status(404).json({ error: 'Cycle not found.' });
    }
    const cycle = cycleResult.rows[0];
    if (cycle.status !== 'under_review') {
      return res.status(403).json({ error: 'Cycle is not awaiting SIRO approval.' });
    }

    const risksResult = await query(
      `SELECT
         rri.id,
         rri.review_decision,
         rri.finalised_notes,
         rri.swg_risk_decision,
         r.id           AS risk_id,
         r.risk_score,
         ia.name        AS asset_name,
         t.name         AS threat_name,
         s.name         AS system_name,
         NOT EXISTS (
           SELECT 1 FROM risk_review_items rri2
           JOIN review_cycles rc2 ON rc2.id = rri2.cycle_id
           WHERE rri2.risk_id = rri.risk_id AND rc2.start_date < $2::date
         )              AS is_new
       FROM risk_review_items rri
       JOIN risks r               ON r.id  = rri.risk_id
       JOIN systems s             ON s.id  = r.system_id
       JOIN threats t             ON t.id  = r.threat_id
       LEFT JOIN information_assets ia ON ia.id = r.asset_id
       WHERE rri.cycle_id = $1
       ORDER BY r.risk_score DESC, s.name, t.name`,
      [id, cycle.start_date]
    );

    const actionsResult = await query(
      `SELECT
         sa.id,
         sa.title,
         sa.treatment_type,
         sa.status,
         sa.target_date,
         sa.requires_siro_signoff,
         sa.siro_signoff_by IS NOT NULL                                      AS is_signed_off,
         (sa.target_date < CURRENT_DATE
           AND sa.status NOT IN ('completed','cancelled'))                   AS is_overdue,
         u.full_name                                                         AS owner_name,
         (sa.originated_cycle_id = $1)                                      AS is_new
       FROM security_action_plans sap
       JOIN security_actions sa ON sa.plan_id = sap.id
       JOIN users u             ON u.id       = sa.primary_owner_user_id
       WHERE sap.cycle_id = $1
       ORDER BY sa.status, sa.target_date ASC NULLS LAST`,
      [id]
    );

    const unfinalised_count = risksResult.rows.filter(r => !r.finalised_notes).length;

    res.json({
      cycle,
      risks:             risksResult.rows,
      actions:           actionsResult.rows,
      can_approve:       unfinalised_count === 0,
      unfinalised_count,
    });
  } catch (err) { next(err); }
}

async function approveSiroCycle(req, res, next) {
  const { id } = req.params;
  const userId  = req.user.id;
  try {
    await query(`SELECT approve_review_cycle($1, $2)`, [id, userId]);
    res.json({ ok: true });
  } catch (err) {
    if (err.message && err.message.includes('approve_review_cycle:')) {
      return res.status(422).json({ error: err.message.replace(/^.*approve_review_cycle:\s*/, '') });
    }
    next(err);
  }
}

async function getSiroActions(req, res, next) {
  try {
    const result = await query(
      `SELECT
         sa.id,
         sa.title,
         sa.treatment_type,
         sa.status,
         sa.target_date,
         (sa.target_date < CURRENT_DATE
           AND sa.status NOT IN ('completed', 'cancelled')) AS is_overdue,
         u.full_name                                        AS owner_name,
         sap.title                                         AS plan_title
       FROM security_actions sa
       JOIN security_action_plans sap ON sap.id = sa.plan_id
       JOIN users u                   ON u.id   = sa.primary_owner_user_id
       WHERE sa.requires_siro_signoff = TRUE
         AND sa.siro_signoff_by IS NULL
         AND sa.status NOT IN ('completed', 'cancelled')
       ORDER BY sa.target_date ASC NULLS LAST, sa.created_at DESC`
    );
    res.json({ actions: result.rows });
  } catch (err) { next(err); }
}

// Returns org-wide impact tables published by a non-SIRO actor (e.g. CISO),
// so the SIRO dashboard can surface them as an awareness notification.
async function getSiroPublishedImpactTables(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT it.id, it.name, it.published_at, u.email AS published_by_email, u.role AS published_by_role
       FROM impact_tables it
       JOIN users u ON u.id = it.published_by
       WHERE it.scope = 'organisation'
         AND it.published_at IS NOT NULL
         AND u.role NOT IN ('siro', 'admin')
       ORDER BY it.published_at DESC`
    );
    res.json({ tables: rows });
  } catch (err) { next(err); }
}

module.exports = {
  getSiroCyclePending,
  getSiroActionPending,
  getSiroCycles,
  getSiroCycleDetail,
  approveSiroCycle,
  getSiroActions,
  getSiroPublishedImpactTables,
};
