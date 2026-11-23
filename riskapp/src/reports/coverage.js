'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Control coverage on systems, the first question part (docs/insights-drilldown.md
// step 3). The board's ring counts control objectives on systems by state; the
// questions it raises are which objectives, which systems and which departments
// are best and worst covered, and which degraded controls to fix first.
//
// The base is the board's own: system_controls rows that are not ruled not
// applicable. A row is in place (operational), in place but degraded, or not in
// place (anything else). Each row in the answer also says WHY it is low where
// CIRKS can tell, because the two common causes need different people:
//   an objective missing everywhere usually has no security solution to deliver
//   it (the security function's to fix); a system missing everything usually has
//   no pattern stated or an incomplete record (the department's to fix).
//
// Scoped by department when a department is given: only that department's
// systems are counted. Derived on read; nothing stored.

const { query } = require('../db/pool');

const ROWS_SQL = `
  SELECT sc.system_id, sc.control_id, sc.status::text AS status,
         s.name AS system_name, s.department_id, d.name AS department_name,
         s.system_pattern, s.is_security_system,
         c.title, vr.framework_ref, c.delivery,
         EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = c.id) AS has_solution
    FROM system_controls sc
    JOIN systems s  ON s.id = sc.system_id
    JOIN controls c ON c.id = sc.control_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN v_control_reference vr ON vr.control_id = c.id
   WHERE sc.status::text <> 'not_applicable'
     AND ($1::uuid IS NULL OR s.department_id = $1)`;

// Risks at or above the action threshold per system, and the active risks each
// degraded objective counters there (the threat links that make it matter).
const RISKS_SQL = `
  SELECT r.system_id, COUNT(*) FILTER (WHERE r.risk_score >= $1)::int AS high
    FROM risks r WHERE r.is_active GROUP BY r.system_id`;
const DEGRADED_RISKS_SQL = `
  SELECT sc.system_id, sc.control_id,
         COUNT(r.id)::int AS risks, COALESCE(MAX(r.risk_score), 0)::int AS top_score
    FROM system_controls sc
    JOIN control_threats ct ON ct.control_id = sc.control_id
    JOIN risks r ON r.system_id = sc.system_id AND r.threat_id = ct.threat_id AND r.is_active
   WHERE sc.status = 'degraded'
   GROUP BY sc.system_id, sc.control_id`;
const GAPS_SQL = `SELECT system_id, COUNT(*)::int AS gaps FROM v_system_slot_gaps GROUP BY system_id`;

const blank = () => ({ operational: 0, degraded: 0, missing: 0, total: 0 });
function add(t, status) {
  t.total += 1;
  if (status === 'operational') t.operational += 1;
  else if (status === 'degraded') t.degraded += 1;
  else t.missing += 1;
}
// Best first: the share in place, then the fewest not in place (degraded is at
// least there), then the most counted (a full row of 40 beats 3 of 3).
const share = (t) => (t.total ? t.operational / t.total : 0);
const byBest = (a, b) => share(b) - share(a) || a.missing - b.missing || b.total - a.total;

async function computeCoverage(departmentId = null) {
  const [{ rows: [cfg] }] = await Promise.all([query('SELECT mandatory_action_score FROM org_config LIMIT 1')]);
  const [{ rows }, { rows: risks }, { rows: degradedRisks }, { rows: gaps }] = await Promise.all([
    query(ROWS_SQL, [departmentId]), query(RISKS_SQL, [cfg.mandatory_action_score]),
    query(DEGRADED_RISKS_SQL), query(GAPS_SQL),
  ]);
  const highBy = new Map(risks.map((r) => [r.system_id, r.high]));
  const gapsBy = new Map(gaps.map((g) => [g.system_id, g.gaps]));
  const degradedBy = new Map(degradedRisks.map((d) => [`${d.system_id}:${d.control_id}`, d]));

  const totals = blank();
  const objectives = new Map(), systems = new Map(), departments = new Map();
  const degraded = [];
  for (const r of rows) {
    add(totals, r.status);
    if (!objectives.has(r.control_id)) {
      objectives.set(r.control_id, { control_id: r.control_id, ref: r.framework_ref, title: r.title,
        delivery: r.delivery, has_solution: r.has_solution, ...blank() });
    }
    add(objectives.get(r.control_id), r.status);
    if (!systems.has(r.system_id)) {
      systems.set(r.system_id, { system_id: r.system_id, name: r.system_name,
        department_id: r.department_id, department_name: r.department_name,
        system_pattern: r.system_pattern, is_security_system: r.is_security_system,
        record_gaps: gapsBy.get(r.system_id) || 0, risks_at_or_above_action: highBy.get(r.system_id) || 0, ...blank() });
    }
    add(systems.get(r.system_id), r.status);
    const dk = r.department_id || 'none';
    if (!departments.has(dk)) departments.set(dk, { department_id: r.department_id, name: r.department_name || 'No department', systems: new Set(), ...blank() });
    const d = departments.get(dk);
    add(d, r.status); d.systems.add(r.system_id);
    if (r.status === 'degraded') {
      const x = degradedBy.get(`${r.system_id}:${r.control_id}`);
      degraded.push({ system_id: r.system_id, system_name: r.system_name, department_name: r.department_name,
        control_id: r.control_id, ref: r.framework_ref, title: r.title,
        risks: x?.risks || 0, top_score: x?.top_score || 0 });
    }
  }

  // Why it is low, where CIRKS can tell (see the header).
  const objectiveCause = (o) => {
    if (o.operational > 0) return null;
    if (o.degraded > 0) return 'degraded_everywhere';
    return o.has_solution ? 'solution_not_in_place' : 'no_solution';
  };
  const systemCause = (s) => {
    if (s.operational === s.total) return null;
    if (!s.system_pattern && !s.is_security_system) return 'no_pattern';
    if (s.record_gaps > 0) return 'record_incomplete';
    return s.operational === 0 && s.degraded === 0 ? 'nothing_in_place' : null;
  };

  return {
    action_threshold: cfg.mandatory_action_score,
    department_id: departmentId,
    totals,
    objectives: [...objectives.values()].map((o) => ({ ...o, cause: objectiveCause(o) })).sort(byBest),
    systems: [...systems.values()].map((s) => ({ ...s, cause: systemCause(s) })).sort(byBest),
    departments: [...departments.values()].map((d) => ({ ...d, systems: d.systems.size })).sort(byBest),
    // Fix first: the degraded controls standing behind the highest risks.
    degraded: degraded.sort((a, b) => b.top_score - a.top_score || b.risks - a.risks || a.system_name.localeCompare(b.system_name)),
  };
}

module.exports = { computeCoverage };
