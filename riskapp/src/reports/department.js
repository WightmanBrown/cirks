'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The Information Asset Owner's report — My department (docs/reporting-iao.md,
// owner's decisions 2026-11-04). One department, derived on read:
//   D1 at a glance — risks answered, the grid now and after committed work
//   D2 security actions touching the department, "needs you" first
//   D3 risk from systems outside its control (used by its services, owned
//      elsewhere; read only, with the owning department's IAO named)
//   D4 lower risk, with evidence — the monthly line (per-department capture)
//      and every score change with who and what caused it
//   D5 reputational risk — risks whose impact comes from information rated on
//      the impact tables the organisation marked as reputational (v172)
//   D7 obligations met — a checklist the record keeps for itself
//   D8 what nobody has looked at
// The thresholds are the organisation's risk appetite (v171), never fixed.

const { query } = require('../db/pool');
const { RISKS_SQL } = require('./riskRows');
const { heatCell } = require('./board');
const { canAcceptRiskAtScore } = require('../auth/acceptanceAuthority');

const DEFINITION_VER = 1;
const CHANGES_DAYS = 365;
const DONE_DAYS = 365;
const OPEN = `a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')`;

const departmentKey = (id) => `department.headline:${id}`;

// Systems this department's live services use, with the services that use each.
const USED_SQL = `
  SELECT bss.system_id, array_agg(DISTINCT bs.name ORDER BY bs.name) AS services
    FROM business_service_systems bss
    JOIN business_services bs ON bs.id = bss.service_id AND bs.is_active
   WHERE bs.department_id = $1
   GROUP BY bss.system_id`;

// Actions on the department's risks or findings, or carrying an item a person
// in the department owns, with their items and the risks they will lower.
const ACTIONS_SQL = `
  SELECT a.id, a.title, a.status::text AS status, a.target_date, a.accepted_at, a.completed_at,
         a.subject_type, a.origin, u.full_name AS owner_name,
         (a.target_date IS NOT NULL AND a.target_date < CURRENT_DATE AND ${OPEN}) AS overdue,
         EXISTS (SELECT 1 FROM v_security_action_departments x WHERE x.action_id = a.id AND x.department_id = $1) AS ours,
         COALESCE((SELECT json_agg(json_build_object(
                    'id', i.id, 'status', i.status::text, 'system_name', s.name,
                    'element', COALESCE(cc.name, c.title), 'owner_name', iu.full_name,
                    'owner_in_department', iu.department_id = $1) ORDER BY s.name, COALESCE(cc.name, c.title))
                     FROM security_action_items i
                     LEFT JOIN systems s ON s.id = i.system_id
                     LEFT JOIN control_components cc ON cc.id = i.component_id
                     LEFT JOIN controls c ON c.id = i.control_id
                     LEFT JOIN users iu ON iu.id = i.owner_user_id
                    WHERE i.action_id = a.id AND i.withdrawn_at IS NULL), '[]') AS items,
         COALESCE((SELECT json_agg(json_build_object('risk_id', r.id, 'score', r.risk_score,
                    'system_name', s.name, 'threat_name', t.name) ORDER BY r.risk_score DESC)
                     FROM security_action_risks sar
                     JOIN risks r ON r.id = sar.risk_id
                     JOIN systems s ON s.id = r.system_id
                     JOIN threats t ON t.id = r.threat_id
                    WHERE sar.action_id = a.id), '[]') AS risks
    FROM security_actions a
    LEFT JOIN users u ON u.id = a.primary_owner_user_id
   WHERE EXISTS (SELECT 1 FROM v_security_action_departments x WHERE x.action_id = a.id AND x.department_id = $1)
      OR EXISTS (SELECT 1 FROM security_action_items i JOIN users iu ON iu.id = i.owner_user_id
                  WHERE i.action_id = a.id AND iu.department_id = $1 AND i.withdrawn_at IS NULL)
   ORDER BY a.target_date NULLS LAST, a.created_at`;

// Every change to the score of a risk in scope in the last year — on the
// department's systems (`s.department_id`) or on one system (`s.id`): the score
// before and after (through derive_summary_score, the risk trigger's own
// function), who made it, and the action behind it.
const changesSql = (scope) => `
  WITH h AS (
    SELECT h.id, h.risk_id, h.changed_at, h.source::text AS source, h.notes,
           cu.full_name AS changed_by_name, a.title AS action_title,
           s.name AS system_name, t.name AS threat_name,
           CASE WHEN num_nulls(h.prev_probability_c, h.prev_probability_i, h.prev_probability_a) = 3 THEN NULL
                ELSE derive_summary_score(
                  GREATEST(1, LEAST(25, COALESCE(h.prev_residual_imp_c, s.impact_c, 1) * COALESCE(h.prev_probability_c, 1)))::smallint,
                  GREATEST(1, LEAST(25, COALESCE(h.prev_residual_imp_i, s.impact_i, 1) * COALESCE(h.prev_probability_i, 1)))::smallint,
                  GREATEST(1, LEAST(25, COALESCE(h.prev_residual_imp_a, s.impact_a, 1) * COALESCE(h.prev_probability_a, 1)))::smallint)
           END AS before,
           derive_summary_score(
             GREATEST(1, LEAST(25, COALESCE(h.new_residual_imp_c, s.impact_c, 1) * COALESCE(h.new_probability_c, 1)))::smallint,
             GREATEST(1, LEAST(25, COALESCE(h.new_residual_imp_i, s.impact_i, 1) * COALESCE(h.new_probability_i, 1)))::smallint,
             GREATEST(1, LEAST(25, COALESCE(h.new_residual_imp_a, s.impact_a, 1) * COALESCE(h.new_probability_a, 1)))::smallint) AS after
      FROM risk_residual_history h
      JOIN risks r   ON r.id = h.risk_id
      JOIN systems s ON s.id = r.system_id AND ${scope} = $1
      JOIN threats t ON t.id = r.threat_id
      LEFT JOIN users cu ON cu.id = h.changed_by
      LEFT JOIN security_actions a ON a.id = h.source_action_id
     WHERE h.changed_at >= now() - ($2 || ' days')::interval)
  SELECT * FROM h WHERE before IS DISTINCT FROM after ORDER BY changed_at DESC`;
const CHANGES_SQL = changesSql('s.department_id');

// Information on each system rated on an impact table the organisation counts
// as reputational, at the level it is rated.
const REPUTATION_SQL = `
  SELECT sa.system_id, ia.name AS asset_name, it.name AS table_name, air.rated_level AS level
    FROM system_assets sa
    JOIN information_assets ia    ON ia.id = sa.asset_id AND ia.is_active
    JOIN asset_impact_ratings air ON air.asset_id = ia.id
    JOIN impact_tables it         ON it.id = air.impact_table_id AND it.is_reputational
   WHERE sa.system_id = ANY($1::uuid[])
   ORDER BY air.rated_level DESC NULLS LAST, ia.name`;

const answerOf = (r) => (r.has_open_action ? 'treated' : r.has_active_exception ? 'accepted' : 'nothing');

function riskRow(r, action, ownerMax) {
  return {
    risk_id: r.id, system_id: r.system_id, system_name: r.system_name, threat_name: r.threat_name,
    score: r.score, target_score: r.target_score, at_or_above_action: r.score >= action,
    above_owner_max: r.score > ownerMax, answer: answerOf(r), treatment_decision: r.treatment_decision,
  };
}

function heatMap(risks, target) {
  const grid = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (const r of risks) {
    const c = heatCell(r, target);
    if (c) grid[Math.min(5, Math.max(1, c.impact)) - 1][Math.min(5, Math.max(1, c.probability)) - 1] += 1;
  }
  return grid;
}

// The counts kept each month, for this department's trend line (decision 3).
function departmentHeadline(risks, action, ownerMax) {
  const at = risks.filter((r) => r.score >= action);
  return {
    risks: risks.length,
    at_or_above_action: at.length,
    above_owner_max: risks.filter((r) => r.score > ownerMax).length,
    unanswered: at.filter((r) => !r.has_open_action && !r.has_active_exception).length,
  };
}

async function computeDepartment(departmentId) {
  const [{ rows: [cfg] }, { rows: [dept] }, { rows: allRisks }, { rows: used }] = await Promise.all([
    query(`SELECT mandatory_action_score, exception_accept_analyst_max, exception_accept_owner_max, setup_phase_active
             FROM org_config LIMIT 1`),
    query(`SELECT d.id, d.name, o.owner_names, COALESCE(o.is_siro_fallback, FALSE) AS owner_is_siro_fallback
             FROM departments d LEFT JOIN v_department_risk_owner o ON o.department_id = d.id
            WHERE d.id = $1`, [departmentId]),
    query(RISKS_SQL),
    query(USED_SQL, [departmentId]),
  ]);
  if (!dept) return null;
  const action = cfg.mandatory_action_score;
  const ownerMax = cfg.exception_accept_owner_max;

  const risks = allRisks.filter((r) => r.department_id === departmentId);
  const servicesOn = new Map(used.map((u) => [u.system_id, u.services]));
  const sharedRisks = allRisks.filter((r) => servicesOn.has(r.system_id) && r.department_id !== departmentId);
  const at = risks.filter((r) => r.score >= action);

  const [{ rows: actions }, { rows: changes }, { rows: snapshots }, { rows: reputation },
         { rows: [tables] }, { rows: unassessed }, { rows: noThreats }, { rows: assetsOff },
         { rows: assetsUnrated }, { rows: ratingFindings }, { rows: componentFindings },
         { rows: [systemCount] }, { rows: [assetCount] }, { rows: [threatCount] }, { rows: exceptions },
         { rows: expired }, { rows: supplierFindings }, { rows: [supplierCount] }, { rows: unvalidated }] = await Promise.all([
    query(ACTIONS_SQL, [departmentId]),
    query(CHANGES_SQL, [departmentId, String(CHANGES_DAYS)]),
    query(`SELECT period, summary FROM metric_snapshots WHERE metric_key = $1 ORDER BY period`, [departmentKey(departmentId)]),
    query(REPUTATION_SQL, [[...new Set([...risks, ...sharedRisks].map((r) => r.system_id))]]),
    query(`SELECT COUNT(*) FILTER (WHERE is_reputational)::int AS reputational,
                  COALESCE(json_agg(name ORDER BY name) FILTER (WHERE is_reputational), '[]') AS names
             FROM impact_tables`),
    query(`SELECT s.id AS system_id, s.name AS system_name, t.id AS threat_id, t.name AS threat_name, st.added_at
             FROM system_threats st JOIN systems s ON s.id = st.system_id AND s.department_id = $1 AND s.is_active
             JOIN threats t ON t.id = st.threat_id
            WHERE NOT EXISTS (SELECT 1 FROM risks r WHERE r.system_id = st.system_id AND r.threat_id = st.threat_id)
            ORDER BY s.name, t.name`, [departmentId]),
    query(`SELECT s.id AS system_id, s.name AS system_name FROM systems s
            WHERE s.department_id = $1 AND s.is_active
              AND NOT EXISTS (SELECT 1 FROM system_threats st WHERE st.system_id = s.id)
            ORDER BY s.name`, [departmentId]),
    query(`SELECT a.id AS asset_id, a.name AS asset_name FROM information_assets a
            WHERE a.department_id = $1 AND a.is_active
              AND NOT EXISTS (SELECT 1 FROM system_assets sa WHERE sa.asset_id = a.id)
            ORDER BY a.name`, [departmentId]),
    query(`SELECT a.id AS asset_id, a.name AS asset_name FROM information_assets a
            WHERE a.department_id = $1 AND a.is_active
              AND NOT EXISTS (SELECT 1 FROM asset_impact_ratings air WHERE air.asset_id = a.id)
            ORDER BY a.name`, [departmentId]),
    query(`SELECT asset_id, asset_name, missing_count, missing_table_names FROM v_asset_rating_findings
            WHERE department_id = $1 ORDER BY asset_name`, [departmentId]),
    query(`SELECT system_id, system_name, missing_count, missing_component_names FROM v_system_component_findings
            WHERE department_id = $1 ORDER BY system_name`, [departmentId]),
    query(`SELECT COUNT(*)::int AS n FROM systems WHERE department_id = $1 AND is_active`, [departmentId]),
    query(`SELECT COUNT(*)::int AS n FROM information_assets WHERE department_id = $1 AND is_active`, [departmentId]),
    query(`SELECT COUNT(*)::int AS n FROM system_threats st JOIN systems s ON s.id = st.system_id
            WHERE s.department_id = $1 AND s.is_active`, [departmentId]),
    query(`SELECT e.id, e.risk_id, e.accepted_role::text AS accepted_role, e.expires_at, r.risk_score AS score,
                  s.name AS system_name, t.name AS threat_name
             FROM exceptions e JOIN risks r ON r.id = e.risk_id AND r.is_active
             JOIN systems s ON s.id = r.system_id AND s.department_id = $1
             JOIN threats t ON t.id = r.threat_id
            WHERE e.status = 'active'`, [departmentId]),
    query(`SELECT exception_id AS id, risk_id, risk_score AS score, system_name, threat_name, expires_at, days_overdue
             FROM v_escalated_exceptions WHERE department_id = $1 AND risk_id IS NOT NULL`, [departmentId]),
    query(`SELECT relationship_id, supplier_id, supplier_name, unmet_count, reason FROM v_supplier_assurance_findings
            WHERE department_id = $1 ORDER BY supplier_name`, [departmentId]),
    query(`SELECT COUNT(*)::int AS n FROM supplier_relationships WHERE department_id = $1 AND status = 'active'`, [departmentId]),
    query(`SELECT r.id AS risk_id, r.risk_score AS score, s.name AS system_name, t.name AS threat_name
             FROM risks r JOIN systems s ON s.id = r.system_id AND s.department_id = $1
             JOIN threats t ON t.id = r.threat_id
            WHERE r.is_active AND r.validated_at IS NULL ORDER BY r.risk_score DESC`, [departmentId]),
  ]);

  // ── D1 at a glance ────────────────────────────────────────────────────────
  const answered = {
    treated: at.filter((r) => answerOf(r) === 'treated').length,
    accepted: at.filter((r) => answerOf(r) === 'accepted').length,
    nothing: at.filter((r) => answerOf(r) === 'nothing').length,
  };

  // ── D7 obligations met ────────────────────────────────────────────────────
  const outside = exceptions.filter((e) => !canAcceptRiskAtScore(e.score, e.accepted_role,
    cfg.exception_accept_analyst_max, ownerMax, cfg.setup_phase_active));
  const unanswered = at.filter((r) => answerOf(r) === 'nothing');
  const obligation = (key, label, total, open) => ({ key, label, total, met: Math.max(0, total - open.length), open });
  const obligations = [
    obligation('assets_rated', 'Every information asset rated against every mandatory impact table',
      assetCount.n, ratingFindings.map((f) => ({ link: `/assets/${f.asset_id}`, label: f.asset_name,
        why: `not rated on ${f.missing_table_names?.join(', ') || `${f.missing_count} mandatory tables`}` }))),
    obligation('component_record', 'Every system’s component record complete',
      systemCount.n, componentFindings.map((f) => ({ link: `/systems/${f.system_id}`, label: f.system_name,
        why: f.missing_count ? `${f.missing_count} component${f.missing_count === 1 ? '' : 's'} not recorded` : 'record incomplete' }))),
    obligation('threats_assessed', 'Every threat identified on your systems assessed',
      threatCount.n, unassessed.map((u) => ({ link: `/systems/${u.system_id}`, label: `${u.system_name} — ${u.threat_name}`, why: 'identified, not assessed' }))),
    obligation('risks_answered', `Every risk scoring ${action} or more being treated or accepted`,
      at.length, unanswered.map((r) => ({ link: `/risks/${r.id}`, label: `${r.system_name} — ${r.threat_name}`, why: `scores ${r.score}; nothing answering it` }))),
    obligation('acceptances_in_date', 'Every acceptance in date and within the accepter’s authority',
      exceptions.length + expired.length, [
        ...expired.map((e) => ({ link: `/risks/${e.risk_id}`, label: `${e.system_name} — ${e.threat_name}`, why: `acceptance expired ${e.days_overdue} days ago` })),
        ...outside.map((e) => ({ link: `/risks/${e.risk_id}`, label: `${e.system_name} — ${e.threat_name}`, why: `scores ${e.score}, above what the accepter may accept` })),
      ]),
    obligation('suppliers_evidenced', 'Every live supplier relationship evidenced',
      supplierCount.n, supplierFindings.map((f) => ({ link: `/suppliers/${f.supplier_id}`, label: f.supplier_name,
        why: f.unmet_count ? `${f.unmet_count} objective${f.unmet_count === 1 ? '' : 's'} not evidenced` : 'not evidenced' }))),
    obligation('risks_validated', 'Every risk validated',
      risks.length, unvalidated.map((r) => ({ link: `/risks/${r.risk_id}`, label: `${r.system_name} — ${r.threat_name}`, why: 'not yet validated' }))),
  ];

  // ── D2 security actions ───────────────────────────────────────────────────
  const open = (a) => !['completed', 'cancelled', 'verified', 'rejected'].includes(a.status);
  const doneSince = Date.now() - DONE_DAYS * 864e5;
  const groupOf = (a) => {
    if (open(a)) return a.status === 'proposed' || a.overdue ? 'needs_you' : 'in_hand';
    if (['completed', 'verified'].includes(a.status) && a.completed_at && new Date(a.completed_at).getTime() >= doneSince) return 'done';
    return null;
  };
  const acts = actions.map((a) => ({ ...a, group: groupOf(a) })).filter((a) => a.group);

  // ── D3 systems outside the department's control ───────────────────────────
  const shared = new Map();
  for (const r of allRisks.filter((x) => servicesOn.has(x.system_id) && x.department_id !== departmentId)) {
    if (!shared.has(r.system_id)) {
      shared.set(r.system_id, { system_id: r.system_id, system_name: r.system_name,
        owner_department_id: r.department_id, owner_department_name: r.department_name, owner_names: r.owner_names,
        services: servicesOn.get(r.system_id), risks: [] });
    }
    shared.get(r.system_id).risks.push(riskRow(r, action, ownerMax));
  }
  const sharedSystems = [...shared.values()].map((s) => {
    const hi = s.risks.filter((r) => r.at_or_above_action);
    return { ...s, risks: hi.sort((a, b) => b.score - a.score), risks_total: s.risks.length,
      at_or_above_action: hi.length, answered: hi.filter((r) => r.answer !== 'nothing').length,
      max_score: Math.max(0, ...s.risks.map((r) => r.score)) };
  }).sort((a, b) => b.at_or_above_action - a.at_or_above_action || b.max_score - a.max_score || a.system_name.localeCompare(b.system_name));

  // ── D5 reputation ─────────────────────────────────────────────────────────
  const repOn = new Map();
  for (const x of reputation) {
    if (!repOn.has(x.system_id)) repOn.set(x.system_id, []);
    repOn.get(x.system_id).push({ asset_name: x.asset_name, table_name: x.table_name, level: x.level });
  }
  const reputational = [...risks.map((r) => ({ r, own: true })), ...sharedRisks.map((r) => ({ r, own: false }))]
    .filter(({ r }) => repOn.has(r.system_id))
    .map(({ r, own }) => ({ ...riskRow(r, action, ownerMax), own, department_name: r.department_name,
      ratings: repOn.get(r.system_id), max_level: Math.max(0, ...repOn.get(r.system_id).map((x) => x.level || 0)) }))
    .sort((a, b) => b.score - a.score || b.max_level - a.max_level);

  return {
    generated_at: new Date().toISOString(),
    definition_ver: DEFINITION_VER,
    department: dept,
    thresholds: { action, owner_max: ownerMax },
    headline: {
      ...departmentHeadline(risks, action, ownerMax),
      answered,
      obligations_met: obligations.filter((o) => o.open.length === 0).length,
      obligations_total: obligations.length,
      shared_at_or_above_action: sharedSystems.reduce((n, s) => n + s.at_or_above_action, 0),
      actions_need_you: acts.filter((a) => a.group === 'needs_you').length,
    },
    heat_map: { current: heatMap(risks, false), target: heatMap(risks, true) },
    risks: risks.map((r) => riskRow(r, action, ownerMax)).sort((a, b) => b.score - a.score),
    obligations,
    actions: acts,
    shared: { systems: sharedSystems, systems_total: sharedSystems.length },
    reputation: { tables_marked: tables.reputational, table_names: tables.names, risks: reputational },
    improvement: {
      trend: snapshots,
      changes: changes.map((c) => ({ ...c, direction: c.after < c.before ? 'down' : 'up' })),
      days: CHANGES_DAYS,
    },
    gaps: { unassessed, systems_without_threats: noThreats, assets_on_no_system: assetsOff, assets_not_rated: assetsUnrated },
  };
}

// For the monthly capture: every department's headline counts from one read.
async function departmentHeadlines() {
  const [{ rows: [cfg] }, { rows: risks }, { rows: depts }] = await Promise.all([
    query(`SELECT mandatory_action_score, exception_accept_owner_max FROM org_config LIMIT 1`),
    query(RISKS_SQL),
    query(`SELECT id FROM departments`),
  ]);
  return depts.map((d) => ({
    metric_key: departmentKey(d.id),
    summary: {
      thresholds: { action: cfg.mandatory_action_score, owner_max: cfg.exception_accept_owner_max },
      ...departmentHeadline(risks.filter((r) => r.department_id === d.id), cfg.mandatory_action_score, cfg.exception_accept_owner_max),
    },
  }));
}

module.exports = { computeDepartment, departmentHeadlines, departmentKey, changesSql, heatMap, riskRow, answerOf, DEFINITION_VER };
