'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The Information Asset Manager's reports — My systems and the system report
// (docs/reporting-iam.md, owner's decisions 2026-11-04). "My systems" is the
// department's systems (decision 2): `managed_by_user_id` names an IAM on only
// 19 of 57 systems on Misty Isles, so it narrows the list, never defines it.
//   M1  every system at a glance             listSystems()
//   M9  the person's own record              listSystems()
//   M10 who relies on my systems              listSystems()
//   M2  the system: risks, assets, who is affected     computeSystem()
//   M3  security actions helping it
//   M4  compliance with each standard, on this system
//   M5  value of what was spent, and what to spend next
//   M7  risk reduction over time
//   M8  the decision record
// Derived on read; the monthly capture keeps each system's counts (decision 4).

const { query } = require('../db/pool');
const { RISKS_SQL } = require('./riskRows');
const { costFor, FIX_ROWS_SQL } = require('./ciso');
const { changesSql, heatMap, riskRow, answerOf } = require('./department');
const { canAcceptRiskAtScore } = require('../auth/acceptanceAuthority');

const DEFINITION_VER = 1;
const RECORD_DAYS = 365;
const OPEN = `a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')`;
const systemKey = (id) => `system.headline:${id}`;

// ── Compliance on a system (M4) ──────────────────────────────────────────────
// A standard requirement applies on a system when at least one of its mapped
// objectives is recorded there. It is met here only when EVERY mapped objective
// that applies here is in place (v161's rule, on one system): those recorded on
// the system by their status there, those delivered once for the organisation
// by the Statement of Applicability. Excluded requirements do not count.
const COMPLIANCE_SQL = `
  SELECT sys.id AS system_id, s.code, s.name AS standard_name, sc.id AS requirement_id, sc.ref_code, sc.title AS requirement,
         c.id AS control_id, c.title AS objective, vr.framework_ref AS objective_ref,
         CASE WHEN x.status IS NOT NULL THEN x.status::text
              WHEN c.delivery = 'organisation' THEN
                CASE WHEN vci.implementation_status = 'implemented' THEN 'operational' ELSE 'missing' END
         END AS status_here,
         (x.status IS NOT NULL) AS recorded_here
    FROM systems sys
    JOIN standards s           ON s.is_enabled
    JOIN standard_controls sc  ON sc.standard_id = s.id
    JOIN control_mappings cm   ON cm.standard_control_id = sc.id
    JOIN controls c            ON c.id = cm.control_id
    LEFT JOIN system_controls x ON x.system_id = sys.id AND x.control_id = c.id
    LEFT JOIN v_control_implementation vci ON vci.control_id = c.id
    LEFT JOIN v_control_reference vr ON vr.control_id = c.id
   WHERE sys.id = ANY($1::uuid[])
     AND NOT EXISTS (SELECT 1 FROM standard_requirement_exclusions e WHERE e.standard_control_id = sc.id)`;

function complianceBySystem(rows) {
  const out = new Map();   // system_id -> code -> { name, requirements: Map }
  for (const r of rows) {
    if (!out.has(r.system_id)) out.set(r.system_id, new Map());
    const stds = out.get(r.system_id);
    if (!stds.has(r.code)) stds.set(r.code, { code: r.code, name: r.standard_name, requirements: new Map() });
    const reqs = stds.get(r.code).requirements;
    if (!reqs.has(r.requirement_id)) {
      reqs.set(r.requirement_id, { id: r.requirement_id, ref: r.ref_code, title: r.requirement, recorded: false, objectives: [] });
    }
    const q = reqs.get(r.requirement_id);
    if (r.recorded_here) q.recorded = true;
    if (r.status_here && r.status_here !== 'not_applicable') {
      q.objectives.push({ control_id: r.control_id, title: r.objective, ref: r.objective_ref, status: r.status_here });
    }
  }
  const result = new Map();
  for (const [systemId, stds] of out) {
    result.set(systemId, [...stds.values()].map((st) => {
      const reqs = [...st.requirements.values()]
        .filter((q) => q.recorded && q.objectives.length)
        .map((q) => {
          const inPlace = q.objectives.filter((o) => o.status === 'operational').length;
          const someWay = q.objectives.some((o) => o.status === 'degraded');
          const state = inPlace === q.objectives.length ? 'met' : inPlace || someWay ? 'partial' : 'gap';
          return { ...q, state, shortfalls: q.objectives.filter((o) => o.status !== 'operational') };
        })
        .sort((a, b) => String(a.ref).localeCompare(String(b.ref), undefined, { numeric: true }));
      return {
        code: st.code, name: st.name, applies: reqs.length,
        met: reqs.filter((q) => q.state === 'met').length,
        partial: reqs.filter((q) => q.state === 'partial').length,
        gap: reqs.filter((q) => q.state === 'gap').length,
        requirements: reqs,
      };
    }).filter((st) => st.applies > 0));
  }
  return result;
}

// ── M1, M9, M10 ──────────────────────────────────────────────────────────────
async function listSystems(departmentId, userId) {
  const [{ rows: [cfg] }, { rows: [dept] }, { rows: systems }, { rows: allRisks }] = await Promise.all([
    query(`SELECT mandatory_action_score, exception_accept_owner_max FROM org_config LIMIT 1`),
    query(`SELECT d.id, d.name, o.owner_names FROM departments d
             LEFT JOIN v_department_risk_owner o ON o.department_id = d.id WHERE d.id = $1`, [departmentId]),
    query(`SELECT s.id, s.name, s.is_security_system, s.managed_by_user_id, mu.full_name AS managed_by_name
             FROM systems s LEFT JOIN users mu ON mu.id = s.managed_by_user_id
            WHERE s.department_id = $1 AND s.is_active ORDER BY s.name`, [departmentId]),
    query(RISKS_SQL),
  ]);
  if (!dept) return null;
  const action = cfg.mandatory_action_score;
  const ids = systems.map((s) => s.id);

  const [{ rows: objectives }, { rows: records }, { rows: actions }, { rows: compliance },
         { rows: snapshots }, { rows: reliedOn }, { rows: [dependsOn] }] = await Promise.all([
    query(`SELECT system_id, status::text AS status, COUNT(*)::int AS n FROM system_controls
            WHERE system_id = ANY($1::uuid[]) AND status::text <> 'not_applicable' GROUP BY 1, 2`, [ids]),
    query(`SELECT system_id, missing_count FROM v_system_component_findings WHERE system_id = ANY($1::uuid[])`, [ids]),
    query(`SELECT sys_id AS system_id, COUNT(DISTINCT a.id)::int AS n FROM (
             SELECT i.system_id AS sys_id, i.action_id FROM security_action_items i WHERE i.withdrawn_at IS NULL
             UNION SELECT r.system_id, sar.action_id FROM security_action_risks sar JOIN risks r ON r.id = sar.risk_id) x
             JOIN security_actions a ON a.id = x.action_id AND ${OPEN}
            WHERE sys_id = ANY($1::uuid[]) GROUP BY 1`, [ids]),
    query(COMPLIANCE_SQL, [ids]),
    // The latest capture before this month, for the direction of travel.
    query(`SELECT DISTINCT ON (metric_key) metric_key, period, summary FROM metric_snapshots
            WHERE metric_key = ANY($1::text[]) AND period < to_char(now(), 'YYYY-MM')
            ORDER BY metric_key, period DESC`, [ids.map(systemKey)]),
    // Other departments' services that use this department's systems (M10).
    query(`SELECT bss.system_id, s.name AS system_name, d.id AS department_id, d.name AS department_name,
                  array_agg(DISTINCT bs.name ORDER BY bs.name) AS services, o.owner_names
             FROM business_service_systems bss
             JOIN business_services bs ON bs.id = bss.service_id AND bs.is_active
             JOIN systems s ON s.id = bss.system_id
             JOIN departments d ON d.id = bs.department_id
             LEFT JOIN v_department_risk_owner o ON o.department_id = d.id
            WHERE s.department_id = $1 AND bs.department_id IS DISTINCT FROM $1
            GROUP BY bss.system_id, s.name, d.id, d.name, o.owner_names
            ORDER BY s.name, d.name`, [departmentId]),
    query(`SELECT COUNT(DISTINCT s.id)::int AS n FROM business_service_systems bss
             JOIN business_services bs ON bs.id = bss.service_id AND bs.is_active AND bs.department_id = $1
             JOIN systems s ON s.id = bss.system_id AND s.department_id IS DISTINCT FROM $1`, [departmentId]),
  ]);

  const byStatus = new Map();
  for (const o of objectives) {
    if (!byStatus.has(o.system_id)) byStatus.set(o.system_id, { operational: 0, degraded: 0, missing: 0 });
    const b = byStatus.get(o.system_id);
    if (o.status in b) b[o.status] += o.n; else b.missing += o.n;
  }
  const recordOf = new Map(records.map((r) => [r.system_id, r.missing_count]));
  const actionsOf = new Map(actions.map((a) => [a.system_id, a.n]));
  const complianceOf = complianceBySystem(compliance);
  const lastOf = new Map(snapshots.map((s) => [s.metric_key, s]));

  const rows = systems.map((s) => {
    const rs = allRisks.filter((r) => r.system_id === s.id);
    const at = rs.filter((r) => r.score >= action);
    const last = lastOf.get(systemKey(s.id));
    return {
      system_id: s.id, system_name: s.name, is_security_system: s.is_security_system,
      managed_by_name: s.managed_by_name, managed_by_me: s.managed_by_user_id === userId,
      risks: rs.length, max_score: rs.length ? Math.max(...rs.map((r) => r.score)) : null,
      at_or_above_action: at.length, answered: at.filter((r) => answerOf(r) !== 'nothing').length,
      objectives: byStatus.get(s.id) || { operational: 0, degraded: 0, missing: 0 },
      record_complete: !recordOf.has(s.id), record_missing: recordOf.get(s.id) || 0,
      open_actions: actionsOf.get(s.id) || 0,
      compliance: (complianceOf.get(s.id) || []).map(({ code, name, applies, met, partial, gap }) => ({ code, name, applies, met, partial, gap })),
      since: last ? { period: last.period, at_or_above_action: last.summary.at_or_above_action } : null,
    };
  }).sort((a, b) => (b.at_or_above_action - b.answered) - (a.at_or_above_action - a.answered)
    || (b.max_score ?? 0) - (a.max_score ?? 0) || a.system_name.localeCompare(b.system_name));

  return {
    generated_at: new Date().toISOString(),
    definition_ver: DEFINITION_VER,
    department: dept,
    thresholds: { action, owner_max: cfg.exception_accept_owner_max },
    systems: rows,
    shared: { relied_on: reliedOn, depends_on: dependsOn.n },
    record: await myRecord(userId),
  };
}

// ── M9: what this person has done, from what CIRKS records with a name ───────
// Personal objectives are not stored (decision 6): this is the evidence they are
// measured against. Complete only as far as the audit trail is (H-15).
async function myRecord(userId) {
  const since = `now() - interval '${RECORD_DAYS} days'`;
  const [{ rows: items }, { rows: [counts] }] = await Promise.all([
    query(`SELECT i.id, i.completed_at, a.title AS action_title, s.name AS system_name,
                  COALESCE(cc.name, c.title) AS element,
                  CASE WHEN a.accepted_at IS NULL THEN NULL
                       ELSE GREATEST(0, EXTRACT(day FROM i.completed_at - a.accepted_at))::int END AS days_taken
             FROM security_action_items i
             JOIN security_actions a ON a.id = i.action_id
             LEFT JOIN systems s ON s.id = i.system_id
             LEFT JOIN control_components cc ON cc.id = i.component_id
             LEFT JOIN controls c ON c.id = i.control_id
            WHERE i.completed_by = $1 AND i.completed_at >= ${since}
            ORDER BY i.completed_at DESC`, [userId]),
    query(`SELECT
             (SELECT COUNT(*) FROM security_action_items WHERE owner_user_id = $1 AND withdrawn_at IS NULL
                AND status::text NOT IN ('completed', 'withdrawn'))::int                         AS items_open,
             (SELECT COUNT(*) FROM risk_residual_history WHERE changed_by = $1 AND changed_at >= ${since})::int AS score_changes,
             (SELECT COUNT(*) FROM asset_impact_ratings WHERE rated_by = $1 AND rated_at >= ${since})::int      AS assets_rated,
             (SELECT COUNT(*) FROM security_actions WHERE created_by = $1 AND created_at >= ${since})::int     AS actions_raised,
             (SELECT COUNT(*) FROM meeting_attendees ma JOIN working_group_meetings m ON m.id = ma.meeting_id
               WHERE ma.user_id = $1 AND ma.present AND m.meeting_date >= (${since})::date)::int              AS meetings_attended,
             (SELECT COUNT(*) FROM audit_log WHERE user_id = $1 AND created_at >= ${since})::int               AS recorded_changes`, [userId]),
  ]);
  const taken = items.map((i) => i.days_taken).filter((d) => d != null).sort((a, b) => a - b);
  return {
    days: RECORD_DAYS,
    items_completed: items.length,
    median_days_to_complete: taken.length ? taken[Math.floor(taken.length / 2)] : null,
    completed: items.slice(0, 25),
    ...counts,
  };
}

// ── M2–M5, M7, M8: one system ────────────────────────────────────────────────
const ACTIONS_SQL = `
  SELECT a.id, a.title, a.status::text AS status, a.target_date, a.accepted_at, a.completed_at,
         u.full_name AS owner_name,
         (a.target_date IS NOT NULL AND a.target_date < CURRENT_DATE AND ${OPEN}) AS overdue,
         COALESCE((SELECT json_agg(json_build_object('id', i.id, 'status', i.status::text, 'system_name', s.name,
                    'here', i.system_id = $1, 'element', COALESCE(cc.name, c.title), 'owner_name', iu.full_name)
                    ORDER BY (i.system_id = $1) DESC, s.name)
                     FROM security_action_items i
                     LEFT JOIN systems s ON s.id = i.system_id
                     LEFT JOIN control_components cc ON cc.id = i.component_id
                     LEFT JOIN controls c ON c.id = i.control_id
                     LEFT JOIN users iu ON iu.id = i.owner_user_id
                    WHERE i.action_id = a.id AND i.withdrawn_at IS NULL), '[]') AS items,
         COALESCE((SELECT json_agg(json_build_object('risk_id', r.id, 'score', r.risk_score, 'threat_name', t.name,
                    'baseline', sar.baseline_risk_score) ORDER BY r.risk_score DESC)
                     FROM security_action_risks sar JOIN risks r ON r.id = sar.risk_id AND r.system_id = $1
                     JOIN threats t ON t.id = r.threat_id
                    WHERE sar.action_id = a.id), '[]') AS risks
    FROM security_actions a
    LEFT JOIN users u ON u.id = a.primary_owner_user_id
   WHERE EXISTS (SELECT 1 FROM security_action_items i WHERE i.action_id = a.id AND i.system_id = $1 AND i.withdrawn_at IS NULL)
      OR EXISTS (SELECT 1 FROM security_action_risks sar JOIN risks r ON r.id = sar.risk_id
                  WHERE sar.action_id = a.id AND r.system_id = $1)
   ORDER BY (${OPEN}) DESC, a.target_date NULLS LAST, a.created_at DESC`;

// Every decision on the system's risks, with who made it and, for a minuted
// one, whether the department's IAO or IAM was in the room (M8).
const MINUTES_SQL = `
  SELECT x.risk_id, ai.id AS item_id, m.id AS meeting_id, m.meeting_date, m.minutes_issued_at, ai.decision_text,
         ai.decision_recorded_at, ru.full_name AS recorded_by_name, ai.entity_type,
         COALESCE((SELECT json_agg(u.full_name ORDER BY u.full_name) FROM meeting_attendees ma JOIN users u ON u.id = ma.user_id
                    WHERE ma.meeting_id = m.id AND ma.present AND u.department_id = s.department_id
                      AND u.role IN ('information_asset_owner', 'information_asset_manager')), '[]') AS department_present
    FROM (SELECT r.id AS risk_id, r.id AS entity_id, 'risk' AS kind FROM risks r WHERE r.system_id = $1 AND r.is_active
          UNION ALL
          SELECT sar.risk_id, sar.action_id, 'security_action' FROM security_action_risks sar
            JOIN risks r ON r.id = sar.risk_id AND r.system_id = $1 AND r.is_active) x
    JOIN meeting_agenda_items ai ON ai.entity_id = x.entity_id AND ai.entity_type = x.kind
                                AND ai.decision_text IS NOT NULL AND btrim(ai.decision_text) <> ''
    JOIN working_group_meetings m ON m.id = ai.meeting_id
    JOIN risks r ON r.id = x.risk_id
    JOIN systems s ON s.id = r.system_id
    LEFT JOIN users ru ON ru.id = ai.decision_recorded_by`;

async function computeSystem(systemId) {
  const [{ rows: [cfg] }, { rows: [sys] }, { rows: allRisks }] = await Promise.all([
    query(`SELECT mandatory_action_score, exception_accept_analyst_max, exception_accept_owner_max, setup_phase_active
             FROM org_config LIMIT 1`),
    query(`SELECT s.id, s.name, s.description, s.department_id, d.name AS department_name, s.is_security_system,
                  mu.full_name AS managed_by_name, o.owner_names, s.impact_c, s.impact_i, s.impact_a
             FROM systems s LEFT JOIN departments d ON d.id = s.department_id
             LEFT JOIN users mu ON mu.id = s.managed_by_user_id
             LEFT JOIN v_department_risk_owner o ON o.department_id = s.department_id
            WHERE s.id = $1`, [systemId]),
    query(RISKS_SQL),
  ]);
  if (!sys) return null;
  const action = cfg.mandatory_action_score;
  const ownerMax = cfg.exception_accept_owner_max;
  const risks = allRisks.filter((r) => r.system_id === systemId);

  const [{ rows: assets }, { rows: services }, { rows: threats }, { rows: actions }, { rows: compliance },
         { rows: fixes }, { rows: solutions }, { rows: changes }, { rows: snapshots }, { rows: minutes },
         { rows: validations }, { rows: acceptances }, { rows: accepted }, { rows: views }, { rows: peopleNamed },
         { rows: openItems }] = await Promise.all([
    query(`SELECT ia.id AS asset_id, ia.name AS asset_name, d.name AS department_name, ou.full_name AS owner_name,
                  ia.confidentiality, ia.integrity, ia.availability,
                  COALESCE((SELECT json_agg(json_build_object('table', it.name, 'level', air.rated_level,
                             'statement', lv.statement, 'reputational', it.is_reputational) ORDER BY air.rated_level DESC NULLS LAST, it.name)
                              FROM asset_impact_ratings air JOIN impact_tables it ON it.id = air.impact_table_id
                              LEFT JOIN impact_table_bil_levels lv ON lv.impact_table_id = it.id AND lv.level = air.rated_level
                             WHERE air.asset_id = ia.id), '[]') AS ratings
             FROM system_assets sa JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active
             LEFT JOIN departments d ON d.id = ia.department_id
             LEFT JOIN users ou ON ou.id = ia.owner_user_id
            WHERE sa.system_id = $1 ORDER BY ia.name`, [systemId]),
    query(`SELECT bs.id AS service_id, bs.name AS service_name, d.name AS department_name,
                  bs.department_id = $2 AS ours
             FROM business_service_systems bss JOIN business_services bs ON bs.id = bss.service_id AND bs.is_active
             LEFT JOIN departments d ON d.id = bs.department_id
            WHERE bss.system_id = $1 ORDER BY (bs.department_id = $2) DESC, d.name, bs.name`, [systemId, sys.department_id]),
    query(`SELECT r.id AS risk_id, t.description FROM risks r JOIN threats t ON t.id = r.threat_id
            WHERE r.system_id = $1 AND r.is_active`, [systemId]),
    query(ACTIONS_SQL, [systemId]),
    query(COMPLIANCE_SQL, [[systemId]]),
    // Every objective not in place here that counters a risk on this system,
    // whatever its score: the IAM funds the system, not only its worst risks.
    query(`SELECT * FROM (${FIX_ROWS_SQL}) f WHERE f.system_id = $2`, [1, systemId]),
    query(`SELECT u.control_id, c.title AS objective, vr.framework_ref AS objective_ref, p.id AS pattern_id, p.name,
                  p.cost_one_off::float AS cost_one_off, p.cost_annual::float AS cost_annual, p.cost_basis,
                  p.effort_hours_month::float AS effort_hours_month, p.effort_basis,
                  sc.status::text AS status
             FROM v_system_solutions_in_use u
             JOIN delivery_patterns p ON p.id = u.pattern_id
             JOIN controls c ON c.id = u.control_id
             LEFT JOIN v_control_reference vr ON vr.control_id = c.id
             LEFT JOIN system_controls sc ON sc.system_id = u.system_id AND sc.control_id = u.control_id
            WHERE u.system_id = $1 ORDER BY p.name, vr.framework_ref`, [systemId]),
    query(changesSql('s.id'), [systemId, String(RECORD_DAYS)]),
    query(`SELECT period, summary FROM metric_snapshots WHERE metric_key = $1 ORDER BY period`, [systemKey(systemId)]),
    query(MINUTES_SQL, [systemId]),
    query(`SELECT r.id AS risk_id, r.validated_at, vu.full_name AS validated_by_name, r.treatment_decision::text AS treatment_decision
             FROM risks r LEFT JOIN users vu ON vu.id = r.validated_by
            WHERE r.system_id = $1 AND r.is_active`, [systemId]),
    query(`SELECT e.id, e.risk_id, e.status::text AS status, e.accepted_at, e.expires_at, e.accepted_role::text AS accepted_role,
                  e.justification, u.full_name AS accepted_by_name, r.risk_score AS score
             FROM exceptions e JOIN risks r ON r.id = e.risk_id AND r.system_id = $1 AND r.is_active
             LEFT JOIN users u ON u.id = e.accepted_by
            ORDER BY e.accepted_at DESC`, [systemId]),
    query(`SELECT DISTINCT a.id AS action_id, a.title, a.accepted_at, u.full_name AS accepted_by_name, sar.risk_id
             FROM security_action_risks sar JOIN risks r ON r.id = sar.risk_id AND r.system_id = $1 AND r.is_active
             JOIN security_actions a ON a.id = sar.action_id AND a.accepted_at IS NOT NULL
             LEFT JOIN users u ON u.id = a.accepted_by`, [systemId]),
    // Recorded views on those decisions (v173, decision 5).
    query(`SELECT v.id, v.risk_id, v.decision_kind, v.decision_ref, v.body, v.written_at, v.written_role,
                  u.full_name AS written_by_name
             FROM risk_decision_views v JOIN users u ON u.id = v.written_by
             JOIN risks r ON r.id = v.risk_id AND r.system_id = $1
            ORDER BY v.written_at`, [systemId]),
    // M6: the people the system's record names, and the open work by person.
    query(`SELECT cc.id AS component_id, cc.name FROM system_components sc
             JOIN control_components cc ON cc.id = sc.component_id AND cc.component_type = 'people'
            WHERE sc.system_id = $1 ORDER BY cc.name`, [systemId]),
    query(`SELECT COALESCE(u.full_name, 'No owner') AS owner_name, COUNT(*)::int AS items
             FROM security_action_items i
             JOIN security_actions a ON a.id = i.action_id AND ${OPEN}
             LEFT JOIN users u ON u.id = i.owner_user_id
            WHERE i.system_id = $1 AND i.withdrawn_at IS NULL AND i.status::text NOT IN ('completed', 'withdrawn')
            GROUP BY 1 ORDER BY 2 DESC, 1`, [systemId]),
  ]);

  const describe = new Map(threats.map((t) => [t.risk_id, t.description]));
  const label = new Map(risks.map((r) => [r.id, r.threat_name]));

  // ── M5: value made and to come ───────────────────────────────────────────
  const made = [];
  for (const a of actions.filter((x) => ['completed', 'verified'].includes(x.status))) {
    for (const r of a.risks) {
      if (r.baseline != null) made.push({ action_id: a.id, title: a.title, completed_at: a.completed_at, risk_id: r.risk_id,
        threat_name: r.threat_name, before: r.baseline, now: r.score, removed: Math.max(0, r.baseline - r.score) });
    }
  }
  const next = new Map();
  for (const f of fixes) {
    if (!next.has(f.control_id)) next.set(f.control_id, { control_id: f.control_id, title: f.title, reference: f.framework_ref, risks: 0, judged: 0, points: 0, below: 0 });
    const n = next.get(f.control_id);
    n.risks += 1;
    if (f.score_if_fixed != null) {
      n.judged += 1;
      n.points += Math.max(0, f.score - f.score_if_fixed);
      if (f.score >= action && f.score_if_fixed < action) n.below += 1;
    }
  }
  const { rows: candidates } = next.size ? await query(
    `SELECT o.control_id, p.id, p.name, p.cost_one_off::float AS cost_one_off, p.cost_annual::float AS cost_annual, p.cost_basis
       FROM delivery_pattern_objectives o JOIN delivery_patterns p ON p.id = o.pattern_id
      WHERE o.control_id = ANY($1::uuid[])`, [[...next.keys()]]) : { rows: [] };
  const toFund = [...next.values()].map((n) => {
    const options = candidates.filter((c) => c.control_id === n.control_id)
      .map((c) => ({ solution_id: c.id, name: c.name, cost: costFor(c, 1) }));
    const priced = options.filter((o) => o.cost && o.cost.one_off != null).sort((a, b) => a.cost.one_off - b.cost.one_off);
    const cost = priced[0]?.cost || null;
    return { ...n, solutions: options, cost, from: options.length > 1 && !!cost,
      points_per_thousand: cost && cost.one_off ? Math.round((n.points / (cost.one_off / 1000)) * 100) / 100 : null };
  }).sort((a, b) => b.points - a.points || b.risks - a.risks || a.title.localeCompare(b.title));

  // ── M8: the decision record, newest first ─────────────────────────────────
  const decisions = [];
  for (const v of validations) {
    if (v.validated_at) decisions.push({ risk_id: v.risk_id, kind: 'validated', at: v.validated_at, by: v.validated_by_name,
      words: v.treatment_decision ? `treatment ${v.treatment_decision}` : null });
  }
  for (const m of minutes) {
    decisions.push({ risk_id: m.risk_id, kind: 'minuted', at: m.decision_recorded_at || m.meeting_date, by: m.recorded_by_name,
      words: m.decision_text, ref: m.item_id, meeting_id: m.meeting_id, meeting_date: m.meeting_date,
      on: m.entity_type === 'security_action' ? 'its security action' : 'the risk', department_present: m.department_present });
  }
  for (const e of acceptances) {
    decisions.push({ risk_id: e.risk_id, kind: 'accepted', ref: e.id, at: e.accepted_at, by: e.accepted_by_name, role: e.accepted_role,
      words: e.justification, status: e.status, expires_at: e.expires_at,
      within_authority_now: canAcceptRiskAtScore(e.score, e.accepted_role, cfg.exception_accept_analyst_max, ownerMax, cfg.setup_phase_active) });
  }
  for (const a of accepted) {
    decisions.push({ risk_id: a.risk_id, kind: 'action_accepted', ref: a.action_id, at: a.accepted_at, by: a.accepted_by_name, words: a.title, action_id: a.action_id });
  }
  decisions.sort((a, b) => new Date(b.at) - new Date(a.at));
  const viewKey = (risk, kind, ref) => `${risk}|${kind}|${ref || ''}`;
  const viewsOn = new Map();
  for (const v of views) {
    const k = viewKey(v.risk_id, v.decision_kind, v.decision_ref);
    if (!viewsOn.has(k)) viewsOn.set(k, []);
    viewsOn.get(k).push(v);
  }
  for (const d of decisions) {
    d.threat_name = label.get(d.risk_id);
    d.ref = d.ref || null;
    d.views = viewsOn.get(viewKey(d.risk_id, d.kind, d.ref)) || [];
  }

  // ── M6: people needed to run it ───────────────────────────────────────────
  // The estimated effort of each solution in use here (v173), once per
  // solution: per system, it is this system's; for the organisation, it is
  // shared by every system it serves and shown apart, never added in.
  const bySolution = new Map(solutions.map((x) => [x.pattern_id, x]));
  const effort = [...bySolution.values()].map((x) => ({
    solution_id: x.pattern_id, name: x.name, hours: x.effort_hours_month, basis: x.effort_basis,
  }));
  const people = {
    solutions: effort,
    hours_here: Math.round(effort.filter((e) => e.basis === 'per_system').reduce((n, e) => n + e.hours, 0) * 10) / 10,
    shared: effort.filter((e) => e.basis === 'organisation'),
    not_known: effort.filter((e) => e.basis == null).length,
    named: peopleNamed,
    open_items: openItems,
  };

  const cs = complianceBySystem(compliance).get(systemId) || [];

  return {
    generated_at: new Date().toISOString(),
    definition_ver: DEFINITION_VER,
    system: sys,
    thresholds: { action, owner_max: ownerMax },
    headline: systemHeadline(risks, action, ownerMax),
    heat_map: { current: heatMap(risks, false), target: heatMap(risks, true) },
    risks: risks.map((r) => ({ ...riskRow(r, action, ownerMax), explanation: describe.get(r.id) || null }))
      .sort((a, b) => b.score - a.score),
    assets,
    services,
    actions: actions.map((a) => ({ ...a, open: !['completed', 'cancelled', 'verified', 'rejected'].includes(a.status) })),
    compliance: cs,
    value: { made, removed: made.reduce((n, m) => n + m.removed, 0), in_place: solutions, to_fund: toFund },
    improvement: { trend: snapshots, changes: changes.map((c) => ({ ...c, direction: c.after < c.before ? 'down' : 'up' })), days: RECORD_DAYS },
    decisions,
    people,
  };
}

function systemHeadline(risks, action, ownerMax) {
  const at = risks.filter((r) => r.score >= action);
  return {
    risks: risks.length,
    at_or_above_action: at.length,
    above_owner_max: risks.filter((r) => r.score > ownerMax).length,
    answered: {
      treated: at.filter((r) => answerOf(r) === 'treated').length,
      accepted: at.filter((r) => answerOf(r) === 'accepted').length,
      nothing: at.filter((r) => answerOf(r) === 'nothing').length,
    },
  };
}

// For the monthly capture: every system's headline counts from one read.
async function systemHeadlines() {
  const [{ rows: [cfg] }, { rows: risks }, { rows: systems }] = await Promise.all([
    query(`SELECT mandatory_action_score, exception_accept_owner_max FROM org_config LIMIT 1`),
    query(RISKS_SQL),
    query(`SELECT id FROM systems WHERE is_active`),
  ]);
  return systems.map((s) => {
    const h = systemHeadline(risks.filter((r) => r.system_id === s.id), cfg.mandatory_action_score, cfg.exception_accept_owner_max);
    return { metric_key: systemKey(s.id), summary: {
      thresholds: { action: cfg.mandatory_action_score, owner_max: cfg.exception_accept_owner_max },
      risks: h.risks, at_or_above_action: h.at_or_above_action, above_owner_max: h.above_owner_max, unanswered: h.answered.nothing,
    } };
  });
}

module.exports = { listSystems, computeSystem, systemHeadlines, systemKey, DEFINITION_VER };
