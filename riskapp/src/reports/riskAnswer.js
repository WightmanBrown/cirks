'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The risk answer (docs/insights-drilldown.md): four short answers about one
// risk, the ones a reader brings to it from a report.
//
//   score    — how bad is it: the score now and after committed work, and the
//              dimension that sets it.
//   why      — why this score: the objectives against this threat on this
//              system by state, which of them set the probability on that
//              dimension (or that nothing in place lowers it), how many in place
//              nobody has judged, and the one fix that would lower it most.
//   work     — what is being done: its security actions and their items.
//   decision — who decided what: validation, treatment, the risk owner, whether
//              the business agreed it (the CISO report's rule), any acceptance.
//
// Every figure comes from the rule that already makes it: the register's
// score, fn_rcp_recompute_risk's MIN over deployed controls, the CISO report's
// agreement and fix arithmetic. Derived on read; nothing stored.

const { query } = require('../db/pool');
const { RISKS_SQL, OPEN_ACTION } = require('./riskRows');
const { agreementState, FIX_ROWS_SQL, MINUTED_SQL, OWNER_ACTS_SQL, IN_HAND_SQL } = require('./ciso');

const DIMS = ['c', 'i', 'a'];
const one = (sql) => `SELECT * FROM (${sql}) q WHERE q.risk_id = $1`;

// Each objective against the threat, its state on the system and what it
// contributes to each dimension's probability now — the same CASE as
// fn_rcp_recompute_risk: operational gives its judged value (the threat's own
// when unjudged), degraded one rung worse, anything else nothing.
const OBJECTIVES_SQL = `
  SELECT c.id AS control_id, c.title, vr.framework_ref,
         COALESCE(sc.status, 'not_recorded') AS status,
         (p.risk_id IS NOT NULL) AS judged,
         t.probability_c AS t_c, t.probability_i AS t_i, t.probability_a AS t_a,
         CASE sc.status WHEN 'operational' THEN COALESCE(p.probability_c, t.probability_c)
                        WHEN 'degraded' THEN LEAST(t.probability_c, COALESCE(p.probability_c, t.probability_c) + 1) END AS now_c,
         CASE sc.status WHEN 'operational' THEN COALESCE(p.probability_i, t.probability_i)
                        WHEN 'degraded' THEN LEAST(t.probability_i, COALESCE(p.probability_i, t.probability_i) + 1) END AS now_i,
         CASE sc.status WHEN 'operational' THEN COALESCE(p.probability_a, t.probability_a)
                        WHEN 'degraded' THEN LEAST(t.probability_a, COALESCE(p.probability_a, t.probability_a) + 1) END AS now_a
    FROM risks r
    JOIN threats t          ON t.id = r.threat_id
    JOIN control_threats ct ON ct.threat_id = r.threat_id
    JOIN controls c         ON c.id = ct.control_id
    LEFT JOIN v_control_presence sc      ON sc.system_id = r.system_id AND sc.control_id = c.id
    LEFT JOIN v_control_reference vr     ON vr.control_id = c.id
    LEFT JOIN risk_control_probability p ON p.risk_id = r.id AND p.control_id = c.id
   WHERE r.id = $1
   ORDER BY c.title`;

const ACTIONS_SQL = `
  SELECT a.id, a.title, a.status, a.target_date, a.accepted_at, u.full_name AS owner_name,
         (a.target_date < CURRENT_DATE AND ${OPEN_ACTION}) AS overdue,
         count(i.id) FILTER (WHERE i.withdrawn_at IS NULL)::int AS items,
         count(i.id) FILTER (WHERE i.status = 'completed')::int AS items_done
    FROM security_action_risks sar
    JOIN security_actions a ON a.id = sar.action_id
    LEFT JOIN users u ON u.id = a.primary_owner_user_id
    LEFT JOIN security_action_items i ON i.action_id = a.id
   WHERE sar.risk_id = $1 AND a.status <> 'cancelled'
   GROUP BY a.id, u.full_name
   ORDER BY (${OPEN_ACTION}) DESC, a.created_at DESC`;

async function riskAnswer(riskId) {
  const { rows: [r] } = await query(`${one(RISKS_SQL.replace('SELECT * FROM r', 'SELECT r.*, r.id AS risk_id FROM r'))}`, [riskId]);
  if (!r) return null;
  const [{ rows: [extra] }, { rows: [cfg] }, { rows: objectives }, { rows: fixes }, { rows: actions },
         { rows: [minuted] }, { rows: [ownerActs] }, { rows: [inHand] }] = await Promise.all([
    query(`SELECT validation_status, risk_c, risk_i, risk_a FROM risks WHERE id = $1`, [riskId]),
    query(`SELECT mandatory_action_score, exception_accept_owner_max FROM org_config LIMIT 1`),
    query(OBJECTIVES_SQL, [riskId]),
    query(`SELECT * FROM (${FIX_ROWS_SQL}) f WHERE f.risk_id = $2`, [0, riskId]),
    query(ACTIONS_SQL, [riskId]),
    query(one(MINUTED_SQL), [riskId]),
    query(one(OWNER_ACTS_SQL), [riskId]),
    query(one(IN_HAND_SQL), [riskId]),
  ]);

  // ── How bad ────────────────────────────────────────────────────────────────
  const dimScore = { c: extra.risk_c, i: extra.risk_i, a: extra.risk_a };
  const top = Math.max(...DIMS.map((d) => dimScore[d] || 0));
  const driving = DIMS.filter((d) => dimScore[d] === top);
  const probability = { c: r.probability_c, i: r.probability_i, a: r.probability_a };
  const impact = { c: r.impact_c, i: r.impact_i, a: r.impact_a };

  // ── Why ────────────────────────────────────────────────────────────────────
  const counts = { total: objectives.length, operational: 0, degraded: 0, missing: 0, unknown: 0, not_applicable: 0, not_recorded: 0 };
  for (const o of objectives) counts[o.status in counts ? o.status : 'unknown'] += 1;
  const inPlace = objectives.filter((o) => o.status === 'operational' || o.status === 'degraded');
  const ref = (o) => ({ control_id: o.control_id, ref: o.framework_ref, title: o.title, status: o.status, judged: o.judged });
  // For the dimension that sets the score: the threat's own likelihood, and the
  // objectives whose contribution is the current probability. When none lowers
  // it below the threat's own, the score is the threat's likelihood unopposed.
  const d = driving[0];
  const threatOwn = objectives[0]?.[`t_${d}`] ?? probability[d];
  const setters = probability[d] < threatOwn
    ? inPlace.filter((o) => o[`now_${d}`] === probability[d]).map(ref)
    : [];
  const fix = fixes
    .filter((f) => f.score_if_fixed != null && f.score_if_fixed < r.score)
    .sort((a, b) => a.score_if_fixed - b.score_if_fixed || a.title.localeCompare(b.title))[0] || null;
  const unjudgedFixes = fixes.filter((f) => f.score_if_fixed == null).length;

  // ── What is being done ─────────────────────────────────────────────────────
  const open = actions.filter((a) => !['completed', 'verified', 'rejected', 'deferred'].includes(a.status));

  // ── Who decided ────────────────────────────────────────────────────────────
  const ownerAct = ownerActs?.acceptance || ownerActs?.accepted_action || null;
  const validated = extra.validation_status === 'validated';

  return {
    risk_id: r.id, system_id: r.system_id, system_name: r.system_name, threat_name: r.threat_name,
    department_id: r.department_id, department_name: r.department_name,
    score: {
      now: r.score, target: r.target_score, probability, impact, driving,
      threat_probability: threatOwn,
    },
    why: {
      counts,
      setting: { dimension: d, probability: probability[d], threat_probability: threatOwn, by: setters },
      in_place_unjudged: inPlace.filter((o) => !o.judged).length,
      // In place and judged, yet leaving the setting dimension at the threat's own
      // likelihood: "more of the same will not move it".
      in_place_no_effect: inPlace.filter((o) => o.judged && o[`now_${d}`] >= threatOwn).length,
      best_fix: fix ? { control_id: fix.control_id, ref: fix.framework_ref, title: fix.title,
                        status: fix.status_here, score_if_fixed: fix.score_if_fixed } : null,
      fixes_unjudged: unjudgedFixes,
      not_in_place: objectives.filter((o) => !['operational', 'degraded', 'not_applicable'].includes(o.status)).map(ref),
    },
    work: {
      actions: actions.map((a) => ({
        id: a.id, title: a.title, status: a.status, target_date: a.target_date, accepted: !!a.accepted_at,
        owner_name: a.owner_name, overdue: !!a.overdue, items: a.items, items_done: a.items_done,
      })),
      open: open.length,
      overdue: open.filter((a) => a.overdue).length,
    },
    decision: {
      validation_status: extra.validation_status,
      treatment_decision: r.treatment_decision,
      owner_names: r.owner_names, owner_is_siro_fallback: r.owner_is_siro_fallback,
      agreement: agreementState({ validated, treatment_decision: r.treatment_decision, minuted, ownerAct }),
      minuted: minuted ? { meeting_id: minuted.meeting_id, meeting_date: minuted.meeting_date,
                           decision_text: minuted.decision_text, about: minuted.entity_type } : null,
      owner_act: ownerAct,
      acceptance: inHand?.acceptance || null,
      action_threshold: cfg.mandatory_action_score,
      owner_max: cfg.exception_accept_owner_max,
    },
  };
}

module.exports = { riskAnswer };
