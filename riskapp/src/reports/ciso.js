'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The CISO's reports (docs/reporting-ciso.md), the budget story end to end:
//
//   C2 — what the business has agreed: for every risk at or above the action
//        threshold, the chain validated → treatment decided → agreed by the
//        business → in hand. "Agreed" is a minuted SWG decision on the risk (or
//        on an action for it), or an acceptance or accepted action by the risk
//        owner. The CISO validating it alone does not count: that is the
//        security function agreeing with itself (owner, 2026-11-03).
//   C1 — where the money goes furthest: each objective not in place where it
//        counters risks at or above the threshold, with the risk points putting
//        it in place would remove (the risk's judged residual for it, through
//        derive_summary_score(), the register's own arithmetic), the effort in
//        systems and, where a cost is estimated (v170), points per unit spent.
//   C5 — shared risk, joint cases: systems used by more than one department,
//        threats behind high risks in several departments, and fixes from C1
//        that answer risks in more than one.
//
// Derived on read; nothing stored.

const { query } = require('../db/pool');
const { RISKS_SQL } = require('./riskRows');

const TOP_FIXES = 25;
const TOP_SHARED = 15;

// When the business recorded its view of a risk: a decision minuted against the
// risk itself, or against a security action raised for it. Newest first.
const MINUTED_SQL = `
  SELECT DISTINCT ON (x.risk_id)
         x.risk_id, m.id AS meeting_id, m.meeting_date, m.minutes_issued_at,
         ai.decision_text, ai.entity_type,
         EXISTS (SELECT 1 FROM meeting_attendees ma JOIN users u ON u.id = ma.user_id
                  WHERE ma.meeting_id = m.id AND ma.present
                    AND u.department_id = s.department_id
                    AND u.role IN ('information_asset_owner', 'information_asset_manager')) AS department_present
    FROM (SELECT r.id AS risk_id, r.id AS entity_id, 'risk' AS kind FROM risks r WHERE r.is_active
          UNION ALL
          SELECT sar.risk_id, sar.action_id, 'security_action' FROM security_action_risks sar) x
    JOIN meeting_agenda_items ai ON ai.entity_id = x.entity_id AND ai.entity_type = x.kind
                                AND ai.decision_text IS NOT NULL AND btrim(ai.decision_text) <> ''
    JOIN working_group_meetings m ON m.id = ai.meeting_id
    JOIN risks r ON r.id = x.risk_id
    JOIN systems s ON s.id = r.system_id
   ORDER BY x.risk_id, m.meeting_date DESC`;

// The risk owner's own act: an acceptance in force, or an accepted action, by
// one of the people v_department_risk_owner names for the risk's department.
const OWNER_ACTS_SQL = `
  SELECT r.id AS risk_id,
         (SELECT json_build_object('kind', 'acceptance', 'at', e.accepted_at, 'by', u.full_name)
            FROM exceptions e JOIN users u ON u.id = e.accepted_by
           WHERE e.risk_id = r.id AND e.status = 'active' AND e.accepted_by = ANY (o.owner_user_ids)
           LIMIT 1) AS acceptance,
         (SELECT json_build_object('kind', 'action', 'at', a.accepted_at, 'by', u.full_name, 'action_id', a.id)
            FROM security_action_risks sar JOIN security_actions a ON a.id = sar.action_id
            JOIN users u ON u.id = a.accepted_by
           WHERE sar.risk_id = r.id AND a.accepted_by = ANY (o.owner_user_ids)
           ORDER BY a.accepted_at DESC LIMIT 1) AS accepted_action
    FROM risks r
    JOIN systems s ON s.id = r.system_id
    JOIN v_department_risk_owner o ON o.department_id = s.department_id
   WHERE r.is_active`;

// What is in hand for a risk: an accepted open action, or an acceptance in force.
const IN_HAND_SQL = `
  SELECT r.id AS risk_id,
         (SELECT json_build_object('action_id', a.id, 'title', a.title, 'accepted_at', a.accepted_at, 'by', u.full_name)
            FROM security_action_risks sar JOIN security_actions a ON a.id = sar.action_id
            LEFT JOIN users u ON u.id = a.accepted_by
           WHERE sar.risk_id = r.id AND a.accepted_at IS NOT NULL
             AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')
           ORDER BY a.accepted_at DESC LIMIT 1) AS action,
         (SELECT json_build_object('exception_id', e.id, 'accepted_at', e.accepted_at, 'by', u.full_name,
                                   'role', e.accepted_role, 'expires_at', e.expires_at)
            FROM exceptions e LEFT JOIN users u ON u.id = e.accepted_by
           WHERE e.risk_id = r.id AND e.status = 'active' LIMIT 1) AS acceptance
    FROM risks r WHERE r.is_active`;

// Per objective not in place where it counters an active risk at or above the
// threshold: the risk's score if that objective alone were put in place (its
// judged residual, never above today's probability), NULL where nobody has
// judged it. Gains are per objective and do not add across objectives: the
// register takes the lowest probability over deployed controls.
const FIX_ROWS_SQL = `
  SELECT c.id AS control_id, c.title, vr.framework_ref, c.delivery,
         r.id AS risk_id, r.risk_score AS score, r.system_id, s.department_id,
         sc.status AS status_here,
         CASE WHEN p.control_id IS NULL THEN NULL ELSE derive_summary_score(
           GREATEST(1, LEAST(25, COALESCE(s.impact_c, 1) * LEAST(COALESCE(p.probability_c, r.probability_c), r.probability_c)))::smallint,
           GREATEST(1, LEAST(25, COALESCE(s.impact_i, 1) * LEAST(COALESCE(p.probability_i, r.probability_i), r.probability_i)))::smallint,
           GREATEST(1, LEAST(25, COALESCE(s.impact_a, 1) * LEAST(COALESCE(p.probability_a, r.probability_a), r.probability_a)))::smallint)
         END AS score_if_fixed
    FROM risks r
    JOIN systems s          ON s.id = r.system_id
    JOIN control_threats ct ON ct.threat_id = r.threat_id
    JOIN controls c         ON c.id = ct.control_id
    JOIN system_controls sc ON sc.system_id = r.system_id AND sc.control_id = c.id
                           AND sc.status NOT IN ('operational', 'not_applicable')
    LEFT JOIN v_control_reference vr     ON vr.control_id = c.id
    LEFT JOIN risk_control_probability p ON p.risk_id = r.id AND p.control_id = c.id
   WHERE r.is_active AND r.risk_score >= $1`;

// The solution that would deliver each objective on each system: the one in use
// there, else every solution in the library that delivers the objective.
const SOLUTIONS_SQL = `
  SELECT p.id, p.name, p.kind, p.cost_one_off::float AS cost_one_off, p.cost_annual::float AS cost_annual,
         p.cost_basis, o.control_id
    FROM delivery_patterns p
    JOIN delivery_pattern_objectives o ON o.pattern_id = p.id`;
const IN_USE_SQL = `SELECT system_id, control_id, pattern_id FROM v_system_solutions_in_use`;

// Systems used by business services of more than one department.
const SHARED_SYSTEMS_SQL = `
  SELECT s.id AS system_id, s.name AS system_name, s.department_id AS owning_department_id,
         json_agg(DISTINCT jsonb_build_object('id', d.id, 'name', d.name)) AS departments,
         count(DISTINCT b.department_id)::int AS department_count
    FROM business_service_systems bss
    JOIN business_services b ON b.id = bss.service_id
    JOIN departments d       ON d.id = b.department_id
    JOIN systems s           ON s.id = bss.system_id
   GROUP BY s.id, s.name, s.department_id
  HAVING count(DISTINCT b.department_id) > 1`;

// The cost of putting a solution in place on n systems — null when not known.
function costFor(solution, systems) {
  if (!solution || !solution.cost_basis) return null;
  const times = solution.cost_basis === 'per_system' ? systems : 1;
  return {
    one_off: solution.cost_one_off == null ? null : solution.cost_one_off * times,
    annual:  solution.cost_annual == null ? null : solution.cost_annual * times,
    basis: solution.cost_basis,
  };
}

async function computeCiso() {
  const [{ rows: [cfg] }, { rows: risks }] = await Promise.all([
    query('SELECT mandatory_action_score FROM org_config LIMIT 1'),
    query(RISKS_SQL),
  ]);
  const action = cfg.mandatory_action_score;
  const [{ rows: minuted }, { rows: ownerActs }, { rows: inHand }, { rows: fixRows },
         { rows: solutions }, { rows: inUse }, { rows: shared }] = await Promise.all([
    query(MINUTED_SQL), query(OWNER_ACTS_SQL), query(IN_HAND_SQL), query(FIX_ROWS_SQL, [action]),
    query(SOLUTIONS_SQL), query(IN_USE_SQL), query(SHARED_SYSTEMS_SQL),
  ]);
  const { rows: validation } = await query(
    `SELECT id, validation_status, validated_at FROM risks WHERE is_active`);

  const byId = (rows) => new Map(rows.map((r) => [r.risk_id ?? r.id, r]));
  const minutedBy = byId(minuted), ownerBy = byId(ownerActs), handBy = byId(inHand), validBy = byId(validation);
  const high = risks.filter((r) => r.score >= action);
  const riskById = new Map(risks.map((r) => [r.id, r]));

  // ── C2: what the business has agreed ─────────────────────────────────────
  const agreement = high.map((r) => {
    const v = validBy.get(r.id);
    const m = minutedBy.get(r.id);
    const o = ownerBy.get(r.id);
    const h = handBy.get(r.id);
    const ownerAct = o?.acceptance || o?.accepted_action || null;
    const validated = v?.validation_status === 'validated';
    const decided = validated && !!r.treatment_decision;
    const agreed = !!m || !!ownerAct;
    return {
      risk_id: r.id, system_id: r.system_id, system_name: r.system_name, threat_name: r.threat_name,
      department_id: r.department_id, department_name: r.department_name,
      owner_names: r.owner_names, owner_is_siro_fallback: r.owner_is_siro_fallback,
      score: r.score, target_score: r.target_score,
      validated, validation_status: v?.validation_status || null,
      treatment_decision: r.treatment_decision,
      minuted: m ? { meeting_id: m.meeting_id, meeting_date: m.meeting_date, decision_text: m.decision_text,
                     about: m.entity_type, minutes_issued: !!m.minutes_issued_at,
                     department_present: m.department_present } : null,
      owner_act: ownerAct,
      in_hand: h?.action ? { kind: 'action', ...h.action } : h?.acceptance ? { kind: 'acceptance', ...h.acceptance } : null,
      // agreed → decided, not agreed → not decided. Agreement without a decision
      // still reads as agreed: the business has spoken, the register lags.
      state: agreed ? 'agreed' : decided ? 'decided_not_agreed' : 'not_decided',
    };
  }).sort((a, b) => b.score - a.score || a.system_name.localeCompare(b.system_name));
  const agreedIds = new Set(agreement.filter((a) => a.state === 'agreed').map((a) => a.risk_id));

  // ── C1: where the money goes furthest ────────────────────────────────────
  const libraryFor = new Map();
  for (const s of solutions) {
    if (!libraryFor.has(s.control_id)) libraryFor.set(s.control_id, []);
    libraryFor.get(s.control_id).push(s);
  }
  const solutionById = new Map(solutions.map((s) => [s.id, s]));
  const inUseAt = new Map(inUse.map((u) => [`${u.system_id}|${u.control_id}`, u.pattern_id]));

  const fixes = new Map();
  for (const row of fixRows) {
    if (!fixes.has(row.control_id)) {
      fixes.set(row.control_id, { control_id: row.control_id, title: row.title, reference: row.framework_ref,
        risks: new Map(), systems: new Set(), departments: new Set(), solutions: new Set(), unsolved: 0 });
    }
    const f = fixes.get(row.control_id);
    if (!f.risks.has(row.risk_id)) f.risks.set(row.risk_id, row);
    if (!f.systems.has(row.system_id)) {
      f.systems.add(row.system_id);
      const here = inUseAt.get(`${row.system_id}|${row.control_id}`);
      if (here) f.solutions.add(here);
      else if (libraryFor.has(row.control_id)) for (const s of libraryFor.get(row.control_id)) f.solutions.add(s.id);
      else f.unsolved += 1;
    }
    if (row.department_id) f.departments.add(row.department_id);
  }

  const deptName = new Map(risks.map((r) => [r.department_id, r.department_name]));
  const investment = [...fixes.values()].map((f) => {
    const rs = [...f.risks.values()];
    const judged = rs.filter((r) => r.score_if_fixed != null);
    const points = judged.reduce((n, r) => n + Math.max(0, r.score - r.score_if_fixed), 0);
    const below = judged.filter((r) => r.score_if_fixed < action).length;
    const sols = [...f.solutions].map((id) => solutionById.get(id)).filter(Boolean);
    // Each candidate solution priced for the systems that need it. With one
    // candidate that is the cost; with several, the cheapest known one-off is
    // the cost "from", and the choice is the CISO's.
    const options = sols.map((s) => ({ solution_id: s.id, name: s.name, cost: costFor(s, f.systems.size) }));
    const priced = f.unsolved ? [] : options.filter((o) => o.cost && o.cost.one_off != null)
      .sort((a, b) => a.cost.one_off - b.cost.one_off);
    const cost = f.unsolved ? null
      : options.length === 1 ? options[0].cost
      : priced.length ? { ...priced[0].cost, from: true, solution: priced[0].name } : null;
    return {
      control_id: f.control_id, title: f.title, reference: f.reference,
      risks: rs.length, risks_judged: judged.length,
      risks_agreed: rs.filter((r) => agreedIds.has(r.risk_id)).length,
      risks_with_work: rs.filter((r) => riskById.get(r.risk_id)?.has_open_action).length,
      points_removed: points,
      risks_brought_below_action: below,
      systems: f.systems.size,
      points_per_system: f.systems.size ? Math.round((points / f.systems.size) * 10) / 10 : 0,
      departments: [...f.departments].map((id) => ({ id, name: deptName.get(id) || 'No department' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      solutions: options,
      // Why the cost cannot be given, when it cannot.
      cost, cost_unknown_because: cost ? null
        : f.unsolved ? 'no security solution delivers it on every system'
        : sols.length > 1 ? 'no cost is estimated for any of the solutions that could deliver it'
        : 'no cost is estimated for its solution',
      points_per_thousand: cost && cost.one_off ? Math.round((points / (cost.one_off / 1000)) * 100) / 100 : null,
    };
  }).sort((a, b) => b.points_removed - a.points_removed || b.risks - a.risks || a.title.localeCompare(b.title));

  // ── C5: shared risk, joint cases ─────────────────────────────────────────
  const highBySystem = new Map();
  for (const r of high) {
    if (!highBySystem.has(r.system_id)) highBySystem.set(r.system_id, []);
    highBySystem.get(r.system_id).push(r);
  }
  const sharedSystems = shared.map((s) => {
    const rs = highBySystem.get(s.system_id) || [];
    return {
      system_id: s.system_id, system_name: s.system_name,
      departments: [...s.departments].sort((a, b) => a.name.localeCompare(b.name)),
      department_count: s.department_count,
      risks_at_or_above_action: rs.length,
      max_score: rs.reduce((m, r) => Math.max(m, r.score), 0) || null,
    };
  }).sort((a, b) => b.risks_at_or_above_action - a.risks_at_or_above_action
    || b.department_count - a.department_count || a.system_name.localeCompare(b.system_name));

  const threats = new Map();
  for (const r of high) {
    const k = r.threat_name || 'Unnamed threat';
    if (!threats.has(k)) threats.set(k, { threat_name: k, risks: 0, departments: new Map(), max_score: 0 });
    const t = threats.get(k);
    t.risks += 1;
    t.max_score = Math.max(t.max_score, r.score);
    if (r.department_id) t.departments.set(r.department_id, r.department_name);
  }
  const commonThreats = [...threats.values()].filter((t) => t.departments.size > 1)
    .map((t) => ({ threat_name: t.threat_name, risks: t.risks, max_score: t.max_score,
                   departments: [...t.departments].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.departments.length - a.departments.length || b.risks - a.risks || a.threat_name.localeCompare(b.threat_name));

  const count = (state) => agreement.filter((a) => a.state === state).length;
  return {
    generated_at: new Date().toISOString(),
    thresholds: { action },
    headline: {
      at_or_above_action: high.length,
      agreed: count('agreed'),
      shared_systems_at_risk: sharedSystems.filter((s) => s.risks_at_or_above_action > 0).length,
      joint_fixes: investment.filter((f) => f.departments.length > 1).length,
    },
    agreement: {
      total: agreement.length,
      agreed: count('agreed'),
      decided_not_agreed: count('decided_not_agreed'),
      not_decided: count('not_decided'),
      risks: agreement,
    },
    investment: {
      objectives: investment.length,
      costed: investment.filter((f) => f.cost).length,
      // Ranked: the fixes with a judged gain. Those whose effect nobody has
      // judged are counted, not ranked — a zero there means "not known".
      fixes: investment.filter((f) => f.points_removed > 0).slice(0, TOP_FIXES),
      unjudged: investment.filter((f) => f.points_removed === 0).length,
    },
    shared: {
      systems: sharedSystems.slice(0, TOP_SHARED),
      systems_total: sharedSystems.length,
      threats: commonThreats.slice(0, TOP_SHARED),
      joint_fixes: investment.filter((f) => f.departments.length > 1).slice(0, TOP_SHARED),
    },
  };
}

module.exports = { computeCiso, costFor, FIX_ROWS_SQL };
