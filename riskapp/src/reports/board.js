'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The board summary (docs/reporting-siro.md, report 9): the few figures a board
// reads at a glance — exposure against the thresholds, a heat map now and after
// committed work, compliance with each standard, control coverage, quality and
// efficiency, and each department in one line. Derived on read. The monthly
// capture (src/jobs/metricCapture.js) stores `headline()` of this, so the same
// definitions draw the trend.
//
// Every figure carries its denominator; nothing here is a stored percentage.

const { query } = require('../db/pool');
const { RISKS_SQL } = require('./riskRows');
const { fetchSoaRows, resolveView } = require('../routes/soa');

// Bump when a definition below changes, so a trend never joins two meanings.
const DEFINITION_VER = 1;

// The headline tiles: the figures a tolerance can be set for (v169). Each key
// names a field of `exposure`; all four are counts where lower is better.
const TILES = [
  { key: 'exposure.at_or_above_action', direction: 'lower_better' },
  { key: 'exposure.above_owner_max', direction: 'lower_better' },
  { key: 'exposure.decided_not_delivered', direction: 'lower_better' },
  { key: 'exposure.acceptances_expired', direction: 'lower_better' },
];

// Red, amber or green against a tolerance a person set — null when none is set.
function rate(value, t) {
  if (!t || value == null) return null;
  const g = Number(t.green_max), a = Number(t.amber_max);
  if (t.direction === 'higher_better') return value >= g ? 'green' : value >= a ? 'amber' : 'red';
  return value <= g ? 'green' : value <= a ? 'amber' : 'red';
}

// The cell a risk sits in: the dimension that gives its score (probability ×
// impact), on a 5 × 5 grid. Target uses the committed work's probability where
// it is lower than today's.
function heatCell(r, target = false) {
  let best = null;
  for (const d of ['c', 'i', 'a']) {
    const now = r[`probability_${d}`];
    const tgt = r[`tgt_p_${d}`];
    const p = target && tgt != null ? Math.min(tgt, now) : now;
    const i = r[`impact_${d}`];
    if (p == null || i == null) continue;
    const score = p * i;
    if (!best || score > best.score || (score === best.score && i > best.impact)) best = { probability: p, impact: i, score };
  }
  return best;
}

function heatMap(risks, target) {
  // grid[impact - 1][probability - 1] = count
  const grid = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (const r of risks) {
    const c = heatCell(r, target);
    if (!c) continue;
    grid[Math.min(5, Math.max(1, c.impact)) - 1][Math.min(5, Math.max(1, c.probability)) - 1] += 1;
  }
  return grid;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function computeBoard() {
  const [{ rows: [cfg] }, { rows: risks }, { rows: stds }, { rows: soa }, { rows: coverage },
         { rows: effectiveness }, { rows: [findings] }, { rows: items }, { rows: actions },
         { rows: reduction }, { rows: deptAssets }, { rows: deptFindings }, { rows: [acceptance] },
         { rows: tolerances }] = await Promise.all([
    query(`SELECT mandatory_action_score, exception_accept_owner_max FROM org_config LIMIT 1`),
    query(RISKS_SQL),
    // Every standard switched on under Objectives & Standards (owner,
    // 2026-11-03), whether or not its requirements are loaded yet.
    query(`SELECT s.code, s.name, COUNT(sc.id)::int AS n
             FROM standards s LEFT JOIN standard_controls sc ON sc.standard_id = s.id
            WHERE s.is_enabled
            GROUP BY s.code, s.name, s.sort_index ORDER BY s.sort_index, s.name`),
    // The Statement of Applicability, one row per control objective.
    query(`SELECT COUNT(*) FILTER (WHERE se.control_id IS NULL)::int                         AS not_decided,
                  COUNT(*) FILTER (WHERE se.control_id IS NOT NULL AND NOT se.applicable)::int AS not_applicable,
                  COUNT(*) FILTER (WHERE se.applicable AND vci.implementation_status = 'implemented')::int AS implemented,
                  COUNT(*) FILTER (WHERE se.applicable AND vci.implementation_status IN ('partial', 'planned'))::int AS under_way,
                  COUNT(*) FILTER (WHERE se.applicable AND COALESCE(vci.implementation_status, 'not_implemented') = 'not_implemented')::int AS not_implemented
             FROM controls c
             LEFT JOIN soa_entries se ON se.control_id = c.id
             LEFT JOIN v_control_implementation vci ON vci.control_id = c.id`),
    // Control objectives on systems: what is in place where it is meant to be.
    query(`SELECT status::text AS status, COUNT(*)::int AS n FROM system_controls
            WHERE status::text <> 'not_applicable' GROUP BY 1`),
    query(`SELECT effectiveness, COUNT(*)::int AS n
             FROM controls c JOIN soa_entries se ON se.control_id = c.id AND se.applicable
            GROUP BY 1`),
    query(`SELECT (SELECT COUNT(*) FROM v_objective_solution_findings)::int  AS objective_without_solution,
                  (SELECT COUNT(*) FROM v_system_component_findings)::int    AS component_record,
                  (SELECT COUNT(*) FROM v_document_review_findings)::int     AS document_review,
                  (SELECT COUNT(*) FROM v_asset_rating_findings)::int        AS asset_rating,
                  (SELECT COUNT(*) FROM v_supplier_assurance_findings)::int  AS supplier_assurance`),
    query(`SELECT status::text AS status, COUNT(*)::int AS n FROM security_action_items GROUP BY 1`),
    query(`SELECT status::text AS status, accepted_at, completed_at, target_date FROM security_actions`),
    // Risk removed by completed actions: each risk's score when its action was
    // accepted, against today's.
    query(`SELECT sar.baseline_risk_score AS before, r.risk_score AS now
             FROM security_action_risks sar
             JOIN security_actions a ON a.id = sar.action_id AND a.status = 'completed'
             JOIN risks r ON r.id = sar.risk_id
            WHERE sar.baseline_risk_score IS NOT NULL`),
    query(`SELECT department_id, COUNT(*)::int AS assets FROM information_assets
            WHERE is_active GROUP BY 1`),
    query(`SELECT department_id, SUM(n)::int AS n FROM (
             SELECT department_id, COUNT(*) AS n FROM v_asset_rating_findings GROUP BY 1
             UNION ALL
             SELECT s.department_id, COUNT(*) FROM v_system_component_findings f JOIN systems s ON s.id = f.system_id GROUP BY 1
             UNION ALL
             SELECT department_id, COUNT(*) FROM v_supplier_assurance_findings GROUP BY 1) x
            GROUP BY 1`),
    query(`SELECT (SELECT COUNT(*) FROM exceptions WHERE status = 'active' AND risk_id IS NOT NULL)::int AS active,
                  (SELECT COUNT(*) FROM v_escalated_exceptions WHERE risk_id IS NOT NULL)::int      AS expired`),
    query(`SELECT t.metric_key, t.direction, t.green_max::float AS green_max, t.amber_max::float AS amber_max,
                  t.reason, t.set_at, u.full_name AS set_by_name
             FROM metric_tolerances t LEFT JOIN users u ON u.id = t.set_by`),
  ]);

  const action = cfg.mandatory_action_score;
  const ownerMax = cfg.exception_accept_owner_max;
  const at = (s) => s != null && s >= action;
  const above = (s) => s != null && s > ownerMax;
  const targetOf = (r) => r.target_score ?? r.score;

  // ── Exposure ────────────────────────────────────────────────────────────
  const unanswered = risks.filter((r) => at(r.score) && !r.has_open_action && !r.has_active_exception);
  const exposure = {
    total: risks.length,
    at_or_above_action: risks.filter((r) => at(r.score)).length,
    above_owner_max: risks.filter((r) => above(r.score)).length,
    target_at_or_above_action: risks.filter((r) => at(targetOf(r))).length,
    target_above_owner_max: risks.filter((r) => above(targetOf(r))).length,
    // Of those at or above the threshold: answered by an action, by an
    // acceptance, or by nothing.
    answered_by_action: risks.filter((r) => at(r.score) && r.has_open_action).length,
    answered_by_acceptance: risks.filter((r) => at(r.score) && !r.has_open_action && r.has_active_exception).length,
    unanswered: unanswered.length,
    decided_not_delivered: unanswered.filter((r) => r.treatment_decision && r.treatment_decision !== 'accept').length,
    acceptances: acceptance.active,
    acceptances_expired: acceptance.expired,
  };

  // ── Compliance: each enabled standard's requirements, by the SoA's own
  // derivation. One with no requirements loaded is listed as such (`loaded:
  // false`), never as 0% — nothing can be measured against it yet.
  const compliance = [];
  for (const s of stds) {
    if (s.n === 0) {
      compliance.push({ code: s.code, name: s.name, loaded: false, requirements: 0, covered: 0, partial: 0, gap: 0, excluded: 0 });
      continue;
    }
    const rows = await fetchSoaRows(await resolveView(s.code));
    const tally = { covered: 0, partial: 0, gap: 0, excluded: 0 };
    for (const r of rows) tally[r.requirement_state] = (tally[r.requirement_state] || 0) + 1;
    compliance.push({ code: s.code, name: s.name, loaded: true, requirements: rows.length, ...tally });
  }

  // ── Controls ────────────────────────────────────────────────────────────
  const statusCount = (k) => coverage.filter((c) => c.status === k).reduce((a, c) => a + c.n, 0);
  const controls = {
    soa: soa[0],
    // On the systems: an objective is in place, in place but degraded, or not in place.
    on_systems: {
      operational: statusCount('operational'),
      degraded: statusCount('degraded'),
      missing: coverage.filter((c) => !['operational', 'degraded'].includes(c.status)).reduce((a, c) => a + c.n, 0),
    },
    // Quality: how well the applicable objectives are judged to work (1–5).
    effectiveness: [1, 2, 3, 4, 5].map((v) => effectiveness.find((e) => e.effectiveness === v)?.n || 0),
    effectiveness_not_rated: effectiveness.find((e) => e.effectiveness == null)?.n || 0,
    findings,
  };

  // ── Security actions: delivery and effect ───────────────────────────────
  const itemCount = (k) => items.filter((i) => i.status === k).reduce((a, i) => a + i.n, 0);
  const open = actions.filter((a) => !['completed', 'cancelled', 'verified', 'rejected'].includes(a.status));
  const days = actions.filter((a) => a.status === 'completed' && a.accepted_at && a.completed_at)
    .map((a) => Math.round((new Date(a.completed_at) - new Date(a.accepted_at)) / 864e5));
  const today = new Date().toISOString().slice(0, 10);
  const efficiency = {
    items_completed: itemCount('completed'),
    items_withdrawn: itemCount('withdrawn'),
    items_open: items.filter((i) => !['completed', 'withdrawn'].includes(i.status)).reduce((a, i) => a + i.n, 0),
    actions_open: open.length,
    actions_overdue: open.filter((a) => a.target_date && String(a.target_date).slice(0, 10) < today).length,
    actions_completed: actions.filter((a) => a.status === 'completed').length,
    median_days_to_complete: median(days),
    risk_points_removed: reduction.reduce((a, r) => a + Math.max(0, r.before - r.now), 0),
    risks_reduced: reduction.filter((r) => r.now < r.before).length,
  };

  // ── Departments, one line each ──────────────────────────────────────────
  const depts = new Map();
  for (const r of risks) {
    const k = r.department_id || 'none';
    if (!depts.has(k)) {
      depts.set(k, { department_id: r.department_id, department_name: r.department_name || 'No department',
                     owner_names: r.owner_names, risks: 0, at_or_above_action: 0, above_owner_max: 0, unanswered: 0 });
    }
    const d = depts.get(k);
    d.risks += 1;
    if (at(r.score)) d.at_or_above_action += 1;
    if (above(r.score)) d.above_owner_max += 1;
    if (unanswered.includes(r)) d.unanswered += 1;
  }
  for (const d of depts.values()) {
    d.assets = deptAssets.find((a) => a.department_id === d.department_id)?.assets || 0;
    d.findings = deptFindings.find((f) => f.department_id === d.department_id)?.n || 0;
  }

  // ── The tiles, each rated against its tolerance where one is set ─────────
  const tiles = TILES.map(({ key, direction }) => {
    const value = exposure[key.split('.')[1]];
    const tolerance = tolerances.find((t) => t.metric_key === key) || null;
    return { key, direction, value, tolerance, rag: rate(value, tolerance) };
  });

  return {
    generated_at: new Date().toISOString(),
    definition_ver: DEFINITION_VER,
    tiles,
    thresholds: { action, owner_max: ownerMax },
    exposure,
    heat_map: { current: heatMap(risks, false), target: heatMap(risks, true) },
    compliance,
    controls,
    efficiency,
    departments: [...depts.values()]
      .sort((a, b) => b.at_or_above_action - a.at_or_above_action || a.department_name.localeCompare(b.department_name)),
  };
}

// What the monthly capture keeps: the board's headline counts, each with its
// denominator, so the trend is drawn from the same definitions as the page.
function headline(b) {
  return {
    thresholds: b.thresholds,
    exposure: b.exposure,
    // The tolerances in force this month, so its colours can be redrawn later.
    tiles: b.tiles.map(({ key, value, tolerance, rag }) =>
      ({ key, value, rag, tolerance: tolerance && { direction: tolerance.direction, green_max: tolerance.green_max, amber_max: tolerance.amber_max } })),
    compliance: b.compliance.map(({ code, name, loaded, requirements, covered, partial, gap, excluded }) =>
      ({ code, name, loaded, requirements, covered, partial, gap, excluded })),
    soa: b.controls.soa,
    on_systems: b.controls.on_systems,
    findings: b.controls.findings,
    efficiency: b.efficiency,
  };
}

module.exports = { computeBoard, headline, heatCell, rate, TILES, DEFINITION_VER };
