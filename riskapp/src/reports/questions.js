'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The remaining question parts (docs/insights-drilldown.md step 3): control
// quality, meeting a standard, work in progress, what changed. Each answers a
// question an insight panel raises and counts what that panel counts:
//
//   quality  — the board's Control quality bar: applicable objectives by their
//              judged effectiveness (1–5) or not rated; which are weak or not
//              rated, who rates them, and the risks that lean on them.
//   standard — a board compliance row: the standard's requirements by the
//              SoA's own derivation (fetchSoaRows), with the objectives falling
//              short and the systems they are missing on.
//   work     — the board's Remediation and the team's service: the security
//              actions in hand, who holds the items, what is overdue and the
//              risk points each will remove.
//   changes  — the board trend and a department's improvement: every change to
//              a risk score, with the event that moved it.
//
// Derived on read; nothing stored.

const { query } = require('../db/pool');
const { RISKS_SQL, OPEN_ACTION } = require('./riskRows');
const { changesSql } = require('./department');
const { fetchSoaRows, resolveView } = require('../routes/soa');

const DAY = 86400000;
const action = async () => (await query('SELECT mandatory_action_score FROM org_config LIMIT 1')).rows[0].mandatory_action_score;

// ── Control quality ──────────────────────────────────────────────────────────
// Per applicable objective: its rating, owner, where it is in place, and the
// active risks at or above the threshold on systems where it counters the
// threat and is in place (the risks leaning on it working).
const QUALITY_SQL = `
  SELECT c.id AS control_id, c.title, vr.framework_ref, c.delivery, c.effectiveness, c.rated_at,
         ru.full_name AS rated_by_name, ou.full_name AS owner_name,
         (SELECT COUNT(*) FROM system_controls sc WHERE sc.control_id = c.id AND sc.status IN ('operational', 'degraded'))::int AS systems_in_place,
         (SELECT COUNT(DISTINCT r.id) FROM risks r
            JOIN control_threats ct ON ct.threat_id = r.threat_id AND ct.control_id = c.id
            JOIN system_controls sc ON sc.system_id = r.system_id AND sc.control_id = c.id AND sc.status IN ('operational', 'degraded')
           WHERE r.is_active AND r.risk_score >= $1)::int AS high_risks_leaning
    FROM controls c
    JOIN soa_entries se ON se.control_id = c.id AND se.applicable
    LEFT JOIN v_control_reference vr ON vr.control_id = c.id
    LEFT JOIN users ru ON ru.id = c.rated_by
    LEFT JOIN users ou ON ou.id = COALESCE(se.owner_user_id, c.owner_user_id)`;

async function computeQuality() {
  const threshold = await action();
  const { rows } = await query(QUALITY_SQL, [threshold]);
  const band = (e) => (e == null ? 'not_rated' : e <= 2 ? 'weak' : e === 3 ? 'adequate' : 'strong');
  const objectives = rows.map((r) => ({ ...r, band: band(r.effectiveness) }))
    // The ones to look at first: weak, then not rated, then adequate, then strong;
    // within each, the most high risks leaning on it.
    .sort((a, b) => ['weak', 'not_rated', 'adequate', 'strong'].indexOf(a.band) - ['weak', 'not_rated', 'adequate', 'strong'].indexOf(b.band)
      || b.high_risks_leaning - a.high_risks_leaning || (a.effectiveness ?? 0) - (b.effectiveness ?? 0) || a.title.localeCompare(b.title));
  const count = (k) => objectives.filter((o) => o.band === k).length;
  const owners = new Map();
  for (const o of objectives.filter((x) => x.band === 'weak' || x.band === 'not_rated')) {
    const k = o.owner_name || '';
    if (!owners.has(k)) owners.set(k, { owner_name: o.owner_name, weak: 0, not_rated: 0 });
    owners.get(k)[o.band] += 1;
  }
  return {
    action_threshold: threshold,
    totals: { strong: count('strong'), adequate: count('adequate'), weak: count('weak'), not_rated: count('not_rated'), total: objectives.length },
    objectives,
    owners: [...owners.values()].sort((a, b) => (b.weak + b.not_rated) - (a.weak + a.not_rated)),
  };
}

// ── Meeting a standard ───────────────────────────────────────────────────────
const STATE_ORDER = { gap: 0, partial: 1, covered: 2, excluded: 3 };

async function computeStandard(code) {
  const { rows: [std] } = await query('SELECT code, name, is_enabled FROM standards WHERE code = $1', [code]);
  if (!std) return null;
  const rows = await fetchSoaRows(await resolveView(code));
  const { rows: missingOn } = await query(`
    SELECT sc.control_id, COUNT(*) FILTER (WHERE sc.status NOT IN ('operational', 'degraded', 'not_applicable'))::int AS systems_missing
      FROM system_controls sc GROUP BY sc.control_id`);
  const missingBy = new Map(missingOn.map((m) => [m.control_id, m.systems_missing]));
  // Where each objective's obligation comes from: the identified threats it
  // counters (active risks on systems, through control_threats), and the
  // Statement of Applicability's decision and stated drivers.
  const { rows: sources } = await query(`
    SELECT c.id AS control_id, se.applicable, (se.control_id IS NOT NULL AND se.applicable IS NOT NULL) AS decided,
           COALESCE(se.drivers, '{}') AS drivers,
           (SELECT COUNT(DISTINCT r.id) FROM risks r JOIN control_threats ct ON ct.threat_id = r.threat_id AND ct.control_id = c.id
             WHERE r.is_active)::int AS risks,
           (SELECT array_agg(DISTINCT t.name ORDER BY t.name) FROM risks r JOIN control_threats ct ON ct.threat_id = r.threat_id AND ct.control_id = c.id
              JOIN threats t ON t.id = r.threat_id WHERE r.is_active) AS threats
      FROM controls c LEFT JOIN soa_entries se ON se.control_id = c.id`);
  const sourceBy = new Map(sources.map((x) => [x.control_id, { applicable: x.applicable, decided: x.decided,
    drivers: x.drivers, risks: x.risks, threats: x.threats || [] }]));
  const requirements = rows.map((r) => ({
    id: r.control_id, ref: r.ref, title: r.title, group: r.group, state: r.requirement_state, percent: r.percent,
    shortfalls: (r.shortfalls || []).map((f) => ({ ...f, systems_missing: missingBy.get(f.control_id) || 0, source: sourceBy.get(f.control_id) || null })),
  })).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.percent ?? 0) - (b.percent ?? 0));
  const tally = { covered: 0, partial: 0, gap: 0, excluded: 0 };
  for (const r of requirements) tally[r.state] = (tally[r.state] || 0) + 1;
  // The objectives standing between the standard and being met, most requirements first.
  const short = new Map();
  for (const r of requirements) {
    for (const f of r.shortfalls) {
      if (!short.has(f.control_id)) short.set(f.control_id, { control_id: f.control_id, title: f.title, status: f.status, systems_missing: f.systems_missing, source: f.source, requirements: 0 });
      short.get(f.control_id).requirements += 1;
    }
  }
  return {
    code: std.code, name: std.name, enabled: std.is_enabled, loaded: rows.length > 0,
    totals: { requirements: requirements.length, ...tally },
    requirements,
    objectives: [...short.values()].sort((a, b) => b.requirements - a.requirements || a.title.localeCompare(b.title)),
  };
}

async function listStandards() {
  const { rows } = await query(`SELECT s.code, s.name FROM standards s WHERE s.is_enabled
                                   AND EXISTS (SELECT 1 FROM standard_controls sc WHERE sc.standard_id = s.id)
                                 ORDER BY s.sort_index, s.name`);
  return rows;
}

// ── Work in progress ─────────────────────────────────────────────────────────
async function computeWork(departmentId = null) {
  const threshold = await action();
  const [{ rows: actions }, { rows: items }, { rows: links }, { rows: risks }] = await Promise.all([
    query(`SELECT a.id, a.title, a.status, a.target_date, a.accepted_at, a.subject_type, a.origin,
                  u.full_name AS owner_name,
                  ARRAY(SELECT d.department_id FROM v_security_action_departments d WHERE d.action_id = a.id AND d.department_id IS NOT NULL) AS departments
             FROM security_actions a LEFT JOIN users u ON u.id = a.primary_owner_user_id
            WHERE ${OPEN_ACTION}`),
    query(`SELECT i.action_id, i.status, i.owner_user_id, u.full_name AS owner_name, s.department_id
             FROM security_action_items i
             JOIN security_actions a ON a.id = i.action_id
             LEFT JOIN users u ON u.id = i.owner_user_id
             LEFT JOIN systems s ON s.id = i.system_id
            WHERE ${OPEN_ACTION} AND i.withdrawn_at IS NULL`),
    query('SELECT action_id, risk_id FROM security_action_risks'),
    query(RISKS_SQL),
  ]);
  const riskBy = new Map(risks.map((r) => [r.id, r]));
  const { rows: depts } = await query('SELECT id, name FROM departments');
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const inScope = (a) => !departmentId || a.departments.includes(departmentId);
  const now = Date.now();
  const rows = actions.filter(inScope).map((a) => {
    const its = items.filter((i) => i.action_id === a.id);
    const linked = links.filter((l) => l.action_id === a.id).map((l) => riskBy.get(l.risk_id)).filter(Boolean);
    // The points the committed work removes on the risks this action is for.
    const points = linked.reduce((n, r) => n + (r.target_score != null && r.target_score < r.score ? r.score - r.target_score : 0), 0);
    const overdue = a.target_date && new Date(a.target_date).getTime() < now;
    return {
      id: a.id, title: a.title, status: a.status, accepted: !!a.accepted_at, target_date: a.target_date,
      overdue: !!(a.accepted_at && overdue), days_overdue: a.accepted_at && overdue ? Math.floor((now - new Date(a.target_date).getTime()) / DAY) : 0,
      owner_name: a.owner_name, subject_type: a.subject_type,
      departments: a.departments.map((d) => deptName.get(d)).filter(Boolean),
      items: its.length, items_done: its.filter((i) => i.status === 'completed').length,
      risks: linked.map((r) => ({ risk_id: r.id, system_name: r.system_name, threat_name: r.threat_name, score: r.score, target_score: r.target_score })),
      high_risks: linked.filter((r) => r.score >= threshold).length,
      points,
    };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.days_overdue - a.days_overdue || b.points - a.points);
  const scopedIds = new Set(rows.map((r) => r.id));
  const people = new Map();
  for (const i of items.filter((x) => scopedIds.has(x.action_id) && x.status !== 'completed')) {
    const k = i.owner_user_id || '';
    if (!people.has(k)) people.set(k, { owner_name: i.owner_name, open_items: 0, actions: new Set() });
    const p = people.get(k);
    p.open_items += 1; p.actions.add(i.action_id);
  }
  return {
    action_threshold: threshold,
    department_id: departmentId,
    totals: {
      actions: rows.length, accepted: rows.filter((r) => r.accepted).length, awaiting_acceptance: rows.filter((r) => !r.accepted).length,
      overdue: rows.filter((r) => r.overdue).length,
      open_items: rows.reduce((n, r) => n + r.items - r.items_done, 0),
      points: rows.reduce((n, r) => n + r.points, 0),
    },
    actions: rows,
    people: [...people.values()].map((p) => ({ owner_name: p.owner_name, open_items: p.open_items, actions: p.actions.size }))
      .sort((a, b) => b.open_items - a.open_items),
  };
}

// ── What changed ─────────────────────────────────────────────────────────────
const WHY = {
  action_verified: 'Security work completed',
  direct_edit: 'Changed by hand',
  corrective_action: 'Corrective action',
};

async function computeChanges(departmentId = null, days = 90) {
  const sql = departmentId ? changesSql('s.department_id') : changesSql('TRUE');
  const { rows } = await query(sql, [departmentId || true, String(days)]);
  const { rows: depts } = await query(`SELECT r.id AS risk_id, s.department_id, d.name AS department_name
                                         FROM risks r JOIN systems s ON s.id = r.system_id LEFT JOIN departments d ON d.id = s.department_id`);
  const deptOf = new Map(depts.map((d) => [d.risk_id, d]));
  const changes = rows.map((c) => ({
    id: c.id, risk_id: c.risk_id, changed_at: c.changed_at, system_name: c.system_name, threat_name: c.threat_name,
    department_name: deptOf.get(c.risk_id)?.department_name || null,
    before: c.before, after: c.after, direction: c.before != null && c.after < c.before ? 'down' : 'up',
    why: c.action_title || WHY[c.source] || c.source, source: c.source, notes: c.notes, changed_by_name: c.changed_by_name,
  }));
  const bySource = new Map();
  for (const c of changes) {
    const k = c.source;
    if (!bySource.has(k)) bySource.set(k, { source: k, why: WHY[k] || k, down: 0, up: 0, points: 0 });
    const g = bySource.get(k);
    g[c.direction] += 1;
    g.points += (c.before ?? c.after) - c.after;
  }
  return {
    department_id: departmentId,
    days,
    totals: { changes: changes.length, down: changes.filter((c) => c.direction === 'down').length, up: changes.filter((c) => c.direction === 'up').length,
              points: changes.reduce((n, c) => n + ((c.before ?? c.after) - c.after), 0) },
    changes,
    by_source: [...bySource.values()].sort((a, b) => (b.down + b.up) - (a.down + a.up)),
  };
}

module.exports = { computeQuality, computeStandard, listStandards, computeWork, computeChanges };
