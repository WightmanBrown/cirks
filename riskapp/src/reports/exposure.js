'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Where the risk sits, a question part (docs/insights-drilldown.md step 3): the
// question page behind the board's heat maps and the SIRO's exposure. Which
// departments carry the most, which systems concentrate it, which threats
// recur, which risks sit in a square, and what committed work will move them.
//
// The risks are the register's (RISKS_SQL), placed on the grid exactly as the
// board places them (heatCell: the dimension with the highest likelihood ×
// impact). Narrowed by department, by a square, or to a minimum score.
// Derived on read; nothing stored.

const { query } = require('../db/pool');
const { RISKS_SQL } = require('./riskRows');
const { heatCell } = require('./board');

function group(rows, keyOf, nameOf, action, extra = () => ({})) {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(r) || 'none';
    if (!m.has(k)) m.set(k, { id: keyOf(r) || null, name: nameOf(r), risks: 0, at_or_above_action: 0, top_score: 0,
                              points: 0, with_target: 0, brought_below_action: 0, ...extra(r) });
    const g = m.get(k);
    g.risks += 1;
    g.points += r.score;
    g.top_score = Math.max(g.top_score, r.score);
    if (r.score >= action) g.at_or_above_action += 1;
    if (r.target_score != null && r.target_score < r.score) {
      g.with_target += 1;
      if (r.score >= action && r.target_score < action) g.brought_below_action += 1;
    }
  }
  // Most at or above the threshold first, then the most risk points.
  return [...m.values()].sort((a, b) => b.at_or_above_action - a.at_or_above_action || b.points - a.points || a.name.localeCompare(b.name));
}

async function computeExposure(departmentId = null, { cell = null, min = null, only = null } = {}) {
  const [{ rows: [cfg] }, { rows: all }, { rows: threats }] = await Promise.all([
    query('SELECT mandatory_action_score, exception_accept_owner_max FROM org_config LIMIT 1'),
    query(RISKS_SQL),
    query('SELECT r.id, r.threat_id FROM risks r WHERE r.is_active'),
  ]);
  const action = cfg.mandatory_action_score;
  const threatOf = new Map(threats.map((t) => [t.id, t.threat_id]));
  const scoped = all.filter((r) => !departmentId || r.department_id === departmentId);
  // The grid is always the whole scope, so a square can be chosen from it.
  const grid = [1, 2, 3, 4, 5].map(() => [0, 0, 0, 0, 0]);
  for (const r of scoped) {
    const c = heatCell(r);
    if (c) grid[c.impact - 1][c.probability - 1] += 1;
  }
  const rows = scoped.filter((r) => {
    if (min != null && r.score < min) return false;
    // The board's "decided, with nothing carrying it out": at or above the
    // threshold, a treatment other than accept decided, no action and no acceptance.
    if (only === 'decided_not_delivered'
        && !(r.score >= action && r.treatment_decision && r.treatment_decision !== 'accept' && !r.has_open_action && !r.has_active_exception)) return false;
    if (cell) {
      const c = heatCell(r);
      if (!c || c.impact !== cell.impact || c.probability !== cell.likelihood) return false;
    }
    return true;
  }).sort((a, b) => b.score - a.score || a.system_name.localeCompare(b.system_name));

  return {
    thresholds: { action, owner_max: cfg.exception_accept_owner_max },
    department_id: departmentId,
    filter: { cell, min, only },
    grid,
    total: rows.length,
    at_or_above_action: rows.filter((r) => r.score >= action).length,
    with_target: rows.filter((r) => r.target_score != null && r.target_score < r.score).length,
    by_department: group(rows, (r) => r.department_id, (r) => r.department_name || 'No department', action),
    by_system: group(rows, (r) => r.system_id, (r) => r.system_name, action, (r) => ({ department_name: r.department_name })),
    by_threat: group(rows, (r) => threatOf.get(r.id), (r) => r.threat_name, action),
    risks: rows.map((r) => ({
      risk_id: r.id, system_id: r.system_id, system_name: r.system_name, threat_name: r.threat_name,
      department_id: r.department_id, department_name: r.department_name,
      score: r.score, target_score: r.target_score, treatment_decision: r.treatment_decision,
      has_open_action: r.has_open_action, has_active_exception: r.has_active_exception,
    })),
  };
}

module.exports = { computeExposure };
