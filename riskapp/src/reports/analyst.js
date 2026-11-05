'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The Risk Analyst's reports (docs/reporting-analyst.md, owner's decisions
// 2026-11-04). "Mine" is what CIRKS records under the person's name: risks they
// identified, judgements they set, actions they created, items they own
// (decision 2). The CISO and admin see the same page for the team (every
// analyst) or for one analyst.
//   R1 what to work on next           R2 my security actions
//   R3 the quality of what I created  R7 my record, the difference I made
//   R6 where control changes bring the greatest benefit (the CISO's C1)
//   R8 where to build relationships, by department
// R5, where unknown risk is hiding, is computeUnknown(): the CISO's C3, one
// report for both roles (decision 5). R4, the what-if, is not built (decision 4).

const { query } = require('../db/pool');
const { RISKS_SQL } = require('./riskRows');
const { computeCiso } = require('./ciso');
const { answerOf } = require('./department');

const DEFINITION_VER = 1;
const RECORD_DAYS = 365;
const TOP = 10;
const OPEN = `a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')`;

// A score from probabilities and impacts per dimension, through the risk
// trigger's own function. $p / $i are SQL expressions with a {d} placeholder.
const score = (p, i) => `derive_summary_score(${['c', 'i', 'a'].map((d) =>
  `GREATEST(1, LEAST(25, COALESCE(${i.replace(/\{d\}/g, d)}, 1) * COALESCE(${p.replace(/\{d\}/g, d)}, 1)))::smallint`).join(', ')})`;

// Objective-on-risk pairs where the objective counters the risk's threat on
// its system and nobody has judged what it achieves there.
const UNJUDGED_SQL = `
  SELECT r.id AS risk_id, r.risk_score AS score, r.identified_by, s.id AS system_id, s.name AS system_name,
         s.department_id, t.name AS threat_name, COUNT(*)::int AS objectives
    FROM risks r
    JOIN systems s          ON s.id = r.system_id
    JOIN threats t          ON t.id = r.threat_id
    JOIN system_controls sc ON sc.system_id = r.system_id AND sc.status::text <> 'not_applicable'
    JOIN control_threats ct ON ct.control_id = sc.control_id AND ct.threat_id = r.threat_id
    LEFT JOIN risk_control_probability p ON p.risk_id = r.id AND p.control_id = sc.control_id
   WHERE r.is_active AND p.risk_id IS NULL
   GROUP BY r.id, r.risk_score, r.identified_by, s.id, s.name, s.department_id, t.name`;

// ── R5: where unknown risk is hiding (the CISO's C3) ─────────────────────────
async function computeUnknown() {
  const [{ rows: [cfg] }, { rows: unassessed }, { rows: noThreats }, { rows: unjudged }, { rows: noAssets },
         { rows: ratings }, { rows: unrated }, { rows: scope }, { rows: review }, { rows: pending }, { rows: depts }] = await Promise.all([
    query(`SELECT mandatory_action_score FROM org_config LIMIT 1`),
    query(`SELECT s.id AS system_id, s.name AS system_name, s.department_id, t.id AS threat_id, t.name AS threat_name, st.added_at
             FROM system_threats st JOIN systems s ON s.id = st.system_id AND s.is_active JOIN threats t ON t.id = st.threat_id
            WHERE NOT EXISTS (SELECT 1 FROM risks r WHERE r.system_id = st.system_id AND r.threat_id = st.threat_id)
            ORDER BY st.added_at`),
    query(`SELECT s.id AS system_id, s.name AS system_name, s.department_id FROM systems s
            WHERE s.is_active AND NOT EXISTS (SELECT 1 FROM system_threats st WHERE st.system_id = s.id) ORDER BY s.name`),
    query(`${UNJUDGED_SQL} ORDER BY r.risk_score DESC, COUNT(*) DESC`),
    query(`SELECT s.id AS system_id, s.name AS system_name, s.department_id,
                  (SELECT COUNT(*) FROM risks r WHERE r.system_id = s.id AND r.is_active)::int AS risks
             FROM systems s WHERE s.is_active AND NOT EXISTS (SELECT 1 FROM system_assets sa WHERE sa.system_id = s.id)
            ORDER BY s.name`),
    query(`SELECT asset_id, asset_name, department_id, missing_count FROM v_asset_rating_findings ORDER BY asset_name`),
    query(`SELECT c.id AS control_id, c.title, vr.framework_ref AS ref
             FROM controls c JOIN soa_entries se ON se.control_id = c.id AND se.applicable
             LEFT JOIN v_control_reference vr ON vr.control_id = c.id
            WHERE c.effectiveness IS NULL ORDER BY vr.framework_ref NULLS LAST, c.title`),
    query(`SELECT id AS component_id, name, component_type::text AS component_type FROM control_components
            WHERE instantiation IS NULL ORDER BY name`),
    query(`SELECT r.id AS risk_id, r.risk_score AS score, r.review_date, s.name AS system_name, s.department_id, t.name AS threat_name
             FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
            WHERE r.is_active AND r.review_date < CURRENT_DATE ORDER BY r.review_date`),
    query(`SELECT r.id AS risk_id, r.risk_score AS score, s.name AS system_name, s.department_id, t.name AS threat_name
             FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
            WHERE r.is_active AND r.validation_status::text = 'pending' ORDER BY r.risk_score DESC`),
    query(`SELECT d.id, d.name, o.owner_names FROM departments d LEFT JOIN v_department_risk_owner o ON o.department_id = d.id`),
  ]);
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const withDept = (rows) => rows.map((r) => ({ ...r, department_name: deptName.get(r.department_id) || null }));
  const group = (key, label, rows, who) => ({ key, label, count: rows.length, who, rows: withDept(rows).slice(0, 25) });
  const action = cfg.mandatory_action_score;
  return {
    generated_at: new Date().toISOString(),
    thresholds: { action },
    groups: [
      group('unjudged', 'Objectives whose effect on a risk nobody has judged', unjudged,
        'A risk analyst: judge the residual on the risk’s page'),
      group('unassessed', 'Threats identified on a system but not assessed', unassessed,
        'A risk analyst: assess the risk'),
      group('no_threats', 'Systems with no threat identified', noThreats,
        'A risk analyst, with the system’s IAM'),
      group('no_assets', 'Systems holding no information asset, so their impact is unknown', noAssets,
        'The department’s IAM: record the information it holds'),
      group('ratings', 'Information assets not rated against every mandatory impact table', ratings,
        'The department’s IAO or IAM'),
      group('unrated_controls', 'Applicable control objectives with no effectiveness rating', unrated,
        'A risk analyst or the CISO: rate the control'),
      group('component_scope', 'Components whose scope (once for the organisation, or per system) is not stated', scope,
        'Whoever looks after the component library'),
      group('review', 'Risks past their review date', review, 'A risk analyst: review the risk'),
      group('pending', 'Risks waiting for validation', pending, 'The CISO: validate or return'),
    ],
    high_unjudged: unjudged.filter((u) => u.score >= action).length,
  };
}

// ── R7: what CIRKS records under a person's name ─────────────────────────────
async function analystRecord(userIds) {
  const since = `now() - interval '${RECORD_DAYS} days'`;
  const { rows: [r] } = await query(`
    WITH h AS (
      SELECT ${score('h.prev_probability_{d}', 'COALESCE(h.prev_residual_imp_{d}, s.impact_{d})')} AS before,
             ${score('h.new_probability_{d}', 'COALESCE(h.new_residual_imp_{d}, s.impact_{d})')} AS after
        FROM risk_residual_history h JOIN risks x ON x.id = h.risk_id JOIN systems s ON s.id = x.system_id
       WHERE h.changed_by = ANY($1::uuid[]) AND h.changed_at >= ${since}
         AND num_nulls(h.prev_probability_c, h.prev_probability_i, h.prev_probability_a) < 3)
    SELECT
      (SELECT COUNT(*) FROM risks WHERE identified_by = ANY($1::uuid[]) AND is_active)::int                  AS risks_identified,
      (SELECT COUNT(*) FROM risks WHERE identified_by = ANY($1::uuid[]) AND created_at >= ${since})::int    AS risks_identified_recent,
      (SELECT COUNT(*) FROM risk_control_probability WHERE set_by = ANY($1::uuid[]) AND set_at >= ${since})::int AS judgements_set,
      (SELECT COUNT(*) FROM h WHERE after < before)::int                                                     AS scores_lowered,
      (SELECT COALESCE(SUM(before - after), 0) FROM h WHERE after < before)::int                             AS points_removed,
      (SELECT COUNT(*) FROM h WHERE after > before)::int                                                     AS scores_raised,
      (SELECT COUNT(*) FROM security_actions WHERE created_by = ANY($1::uuid[]) AND created_at >= ${since})::int AS actions_built,
      (SELECT COUNT(*) FROM security_actions WHERE created_by = ANY($1::uuid[]) AND completed_at >= ${since})::int AS actions_completed,
      (SELECT COUNT(*) FROM security_actions WHERE created_by = ANY($1::uuid[]) AND created_at >= ${since}
          AND COALESCE(subject_type::text, 'risk') <> 'risk')::int                                          AS findings_acted,
      (SELECT COUNT(*) FROM meeting_attendees ma JOIN working_group_meetings m ON m.id = ma.meeting_id
        WHERE ma.user_id = ANY($1::uuid[]) AND ma.present AND m.meeting_date >= (${since})::date)::int       AS meetings_attended`,
  [userIds]);
  return { days: RECORD_DAYS, ...r };
}

// ── The page ─────────────────────────────────────────────────────────────────
async function computeAnalyst(userIds, who) {
  const [{ rows: [cfg] }, { rows: allRisks }] = await Promise.all([
    query(`SELECT mandatory_action_score FROM org_config LIMIT 1`),
    query(RISKS_SQL),
  ]);
  const action = cfg.mandatory_action_score;
  const mine = new Set(userIds);

  const [{ rows: ident }, { rows: returned }, { rows: unjudged }, { rows: items }, { rows: actions },
         { rows: everReturned }, { rows: noAsset }, { rows: [findings] }, { rows: [consistency] }, { rows: depts },
         { rows: deptUnknown }, { rows: dependsOn }] = await Promise.all([
    query(`SELECT r.id, r.identified_by, r.validation_status::text AS validation_status, r.validation_notes, r.review_date,
                  (r.review_date < CURRENT_DATE) AS past_review,
                  r.updated_at, r.created_at FROM risks r WHERE r.is_active AND r.identified_by = ANY($1::uuid[])`, [userIds]),
    query(`SELECT a.entity_id AS risk_id, a.created_at, a.human_narrative FROM audit_log a
            WHERE a.action::text = 'return_risk' ORDER BY a.created_at DESC`),
    query(UNJUDGED_SQL),
    query(`SELECT i.id, i.status::text AS status, a.id AS action_id, a.title, s.name AS system_name, COALESCE(cc.name, c.title) AS element,
                  a.target_date, (a.target_date IS NOT NULL AND a.target_date < CURRENT_DATE) AS overdue
             FROM security_action_items i JOIN security_actions a ON a.id = i.action_id AND ${OPEN}
             LEFT JOIN systems s ON s.id = i.system_id
             LEFT JOIN control_components cc ON cc.id = i.component_id LEFT JOIN controls c ON c.id = i.control_id
            WHERE i.owner_user_id = ANY($1::uuid[]) AND i.withdrawn_at IS NULL AND i.status::text NOT IN ('completed', 'withdrawn')
            ORDER BY a.target_date NULLS LAST`, [userIds]),
    query(`SELECT a.id, a.title, a.status::text AS status, a.target_date, a.accepted_at, a.completed_at,
                  (a.target_date IS NOT NULL AND a.target_date < CURRENT_DATE AND ${OPEN}) AS overdue,
                  (SELECT COUNT(*) FROM security_action_items i WHERE i.action_id = a.id AND i.withdrawn_at IS NULL)::int AS items,
                  (SELECT COUNT(*) FROM security_action_items i WHERE i.action_id = a.id AND i.status::text = 'completed')::int AS items_done,
                  COALESCE((SELECT SUM(GREATEST(0, sar.baseline_risk_score - r.risk_score)) FROM security_action_risks sar
                             JOIN risks r ON r.id = sar.risk_id WHERE sar.action_id = a.id AND sar.baseline_risk_score IS NOT NULL), 0)::int AS points_removed,
                  COALESCE((SELECT json_agg(json_build_object('risk_id', r.id, 'score', r.risk_score, 'system_name', s.name, 'threat_name', t.name))
                             FROM security_action_risks sar JOIN risks r ON r.id = sar.risk_id JOIN systems s ON s.id = r.system_id
                             JOIN threats t ON t.id = r.threat_id WHERE sar.action_id = a.id), '[]') AS risks
             FROM security_actions a WHERE a.created_by = ANY($1::uuid[])
            ORDER BY (${OPEN}) DESC, a.target_date NULLS LAST, a.created_at DESC`, [userIds]),
    query(`SELECT DISTINCT entity_id AS risk_id FROM audit_log WHERE action::text = 'return_risk'`),
    query(`SELECT r.id AS risk_id FROM risks r JOIN systems s ON s.id = r.system_id
            WHERE r.is_active AND NOT EXISTS (SELECT 1 FROM system_assets sa WHERE sa.system_id = s.id)`),
    query(`SELECT (SELECT COUNT(*) FROM v_asset_rating_findings)::int AS asset_rating,
                  (SELECT COUNT(*) FROM v_system_component_findings)::int AS component_record,
                  (SELECT COUNT(*) FROM v_document_review_findings)::int AS document_review,
                  (SELECT COUNT(*) FROM v_supplier_assurance_findings)::int AS supplier_assurance,
                  (SELECT COUNT(*) FROM v_objective_solution_findings)::int AS objective_solution`),
    query(`SELECT (SELECT COUNT(*) FROM v_soa_findings)::int AS soa_findings,
                  (SELECT COUNT(*) FROM control_components WHERE instantiation IS NULL)::int AS component_scope,
                  (SELECT COUNT(*) FROM v_objective_solution_findings)::int AS objective_solution`),
    query(`SELECT d.id, d.name, o.owner_names,
                  (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name) FROM users u
                    WHERE u.department_id = d.id AND u.is_active AND u.role = 'information_asset_manager') AS iam_names
             FROM departments d LEFT JOIN v_department_risk_owner o ON o.department_id = d.id ORDER BY d.name`),
    query(`SELECT s.department_id,
                  COUNT(*) FILTER (WHERE x.kind = 'unassessed')::int AS unassessed,
                  COUNT(*) FILTER (WHERE x.kind = 'no_threats')::int AS no_threats,
                  COUNT(*) FILTER (WHERE x.kind = 'no_assets')::int AS no_assets
             FROM (SELECT st.system_id, 'unassessed' AS kind FROM system_threats st
                    WHERE NOT EXISTS (SELECT 1 FROM risks r WHERE r.system_id = st.system_id AND r.threat_id = st.threat_id)
                   UNION ALL SELECT s.id, 'no_threats' FROM systems s WHERE NOT EXISTS (SELECT 1 FROM system_threats st WHERE st.system_id = s.id)
                   UNION ALL SELECT s.id, 'no_assets' FROM systems s WHERE NOT EXISTS (SELECT 1 FROM system_assets sa WHERE sa.system_id = s.id)) x
             JOIN systems s ON s.id = x.system_id AND s.is_active
            GROUP BY s.department_id`),
    query(`SELECT bs.department_id, COUNT(DISTINCT s.id)::int AS n FROM business_service_systems bss
             JOIN business_services bs ON bs.id = bss.service_id AND bs.is_active
             JOIN systems s ON s.id = bss.system_id AND s.department_id IS DISTINCT FROM bs.department_id
            GROUP BY bs.department_id`),
  ]);

  const riskById = new Map(allRisks.map((r) => [r.id, r]));
  const label = (id) => { const r = riskById.get(id); return r ? `${r.system_name} — ${r.threat_name}` : null; };
  const myIds = new Set(ident.map((r) => r.id));
  const mineRisks = allRisks.filter((r) => myIds.has(r.id));
  const lastReturn = new Map();
  for (const x of returned) if (!lastReturn.has(x.risk_id)) lastReturn.set(x.risk_id, x);
  const everSet = new Set(everReturned.map((x) => x.risk_id));
  const noAssetSet = new Set(noAsset.map((x) => x.risk_id));

  // ── R1: what to work on next, highest risk first ─────────────────────────
  const row = (id, why, extra = {}) => ({ risk_id: id, label: label(id), score: riskById.get(id)?.score ?? null, why, link: `/risks/${id}`, ...extra });
  const byScore = (a, b) => (b.score ?? 0) - (a.score ?? 0);
  const work = [
    { key: 'returned', label: 'Returned to you for rework', rows: ident.filter((r) => r.validation_status === 'returned')
        .map((r) => row(r.id, r.validation_notes || lastReturn.get(r.id)?.human_narrative || 'returned by the CISO')).sort(byScore) },
    { key: 'pending', label: 'Waiting for the CISO to validate', rows: ident.filter((r) => r.validation_status === 'pending')
        .map((r) => row(r.id, 'pending validation')).sort(byScore) },
    { key: 'review', label: 'Past their review date', rows: ident.filter((r) => r.past_review)
        .map((r) => row(r.id, `review was due ${new Date(r.review_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`)).sort(byScore) },
    { key: 'unjudged', label: `Risks scoring ${action} or more with an objective nobody has judged`,
      rows: unjudged.filter((u) => mine.has(u.identified_by) && u.score >= action)
        .map((u) => row(u.risk_id, `${u.objectives} objective${u.objectives === 1 ? '' : 's'} not judged`)).sort(byScore) },
    { key: 'items', label: 'Your open action items', rows: items.map((i) => ({ label: `${i.element} on ${i.system_name}`, why: i.title,
        overdue: i.overdue, link: null })) },
  ].map((g) => ({ ...g, count: g.rows.length, rows: g.rows.slice(0, TOP) }));
  const findingsTotal = Object.values(findings).reduce((n, v) => n + v, 0);

  // ── R3: the quality of what I created ────────────────────────────────────
  const unjudgedMine = unjudged.filter((u) => mine.has(u.identified_by));
  const unjudgedRiskSet = new Set(unjudgedMine.map((u) => u.risk_id));
  const validated = ident.filter((r) => r.validation_status === 'validated');
  const quality = {
    risks: ident.length,
    completeness: {
      fully_judged: ident.filter((r) => !unjudgedRiskSet.has(r.id)).length,
      objectives_unjudged: unjudgedMine.reduce((n, u) => n + u.objectives, 0),
      impact_known: ident.filter((r) => !noAssetSet.has(r.id)).length,
    },
    acceptance: {
      validated: validated.length,
      first_time: validated.filter((r) => !everSet.has(r.id)).length,
      returned_now: ident.filter((r) => r.validation_status === 'returned').length,
      pending: ident.filter((r) => r.validation_status === 'pending').length,
    },
    timeliness: {
      past_review: work.find((g) => g.key === 'review').count,
      median_days_since_assessed: (() => {
        const ages = ident.map((r) => Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 864e5)).sort((a, b) => a - b);
        return ages.length ? ages[Math.floor(ages.length / 2)] : null;
      })(),
    },
    consistency,
  };

  // ── R6: the CISO's ranking ───────────────────────────────────────────────
  const ciso = await computeCiso();

  // ── R8: where to build relationships, by department ──────────────────────
  const unk = new Map(deptUnknown.map((d) => [d.department_id, d]));
  const dep = new Map(dependsOn.map((d) => [d.department_id, d.n]));
  const unjudgedByDept = new Map();
  for (const u of unjudged) unjudgedByDept.set(u.department_id, (unjudgedByDept.get(u.department_id) || 0) + 1);
  const relationships = depts.map((d) => {
    const rs = allRisks.filter((r) => r.department_id === d.id);
    const at = rs.filter((r) => r.score >= action);
    const u = unk.get(d.id) || { unassessed: 0, no_threats: 0, no_assets: 0 };
    return {
      department_id: d.id, department_name: d.name, owner_names: d.owner_names, iam_names: d.iam_names,
      risks: rs.length, at_or_above_action: at.length, unanswered: at.filter((r) => answerOf(r) === 'nothing').length,
      unknown: u.unassessed + u.no_threats + u.no_assets + (unjudgedByDept.get(d.id) || 0),
      shared_systems_used: dep.get(d.id) || 0,
    };
  }).sort((a, b) => (b.unanswered + b.unknown) - (a.unanswered + a.unknown) || a.department_name.localeCompare(b.department_name));

  return {
    generated_at: new Date().toISOString(),
    definition_ver: DEFINITION_VER,
    who,
    thresholds: { action },
    headline: {
      risks_identified: ident.length,
      // Each risk once, though it may be in several groups (pending and past review).
      to_do: new Set([...ident.filter((r) => ['returned', 'pending'].includes(r.validation_status) || r.past_review).map((r) => r.id),
        ...unjudged.filter((u) => mine.has(u.identified_by) && u.score >= action).map((u) => u.risk_id)]).size,
      first_time: quality.acceptance.first_time, validated: quality.acceptance.validated,
      at_or_above_action: mineRisks.filter((r) => r.score >= action).length,
    },
    work,
    findings: { ...findings, total: findingsTotal },
    actions: actions.map((a) => ({ ...a, open: !['completed', 'cancelled', 'verified', 'rejected'].includes(a.status) })),
    quality,
    record: await analystRecord(userIds),
    benefit: { fixes: ciso.investment.fixes.slice(0, 5), unjudged: ciso.investment.unjudged },
    relationships,
  };
}

module.exports = { computeAnalyst, computeUnknown, analystRecord, DEFINITION_VER };
