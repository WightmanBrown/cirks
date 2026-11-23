'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The security team's service — the CISO's C6 (docs/reporting-ciso.md). Is my
// team responsive, and where does its time go?
//   waiting     what the business is waiting on security for, oldest first:
//               risks awaiting validation, proposed actions awaiting
//               acceptance, acceptances about to expire or already expired
//   turnaround  median days, quarter by quarter, from the timestamps kept:
//               recorded → validated, proposed → accepted, accepted → done
//   work        changes made through CIRKS by each member of the security
//               team in the last 90 days, by area (the request log)
//   delivered   risk points removed by work completed, per quarter and per
//               head of the security team
// Derived on read; nothing is stored.

const { query } = require('../db/pool');

const SECURITY_ROLES = ['ciso', 'risk_analyst', 'security_consultant', 'security_architect'];
const WORK_DAYS = 90;
const EXPIRY_DAYS = 30;
const QUARTERS = 4;
const WAIT_ROWS = 25;

// The area of CIRKS a request changed, from its path (/api/v1/<area>/…).
// Sign-in and a person's own settings are not the team's work.
const AREA = {
  risks: 'Risks', governance: 'Validation', threats: 'Threats', systems: 'Systems', assets: 'Information assets',
  services: 'Business services', components: 'Components', controls: 'Control objectives and solutions',
  architecture: 'Security architecture', soa: 'Statement of Applicability', scopes: 'Scopes',
  suppliers: 'Suppliers', findings: 'Findings', actions: 'Security actions', exceptions: 'Exceptions',
  meetings: 'Meetings', bil: 'Impact tables', departments: 'Departments', org: 'Organisation',
  reports: 'Reports', admin: 'Administration', knowledge: 'Knowledge',
};
const NOT_WORK = ['auth', 'users'];

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// The last QUARTERS calendar quarters, newest first: { label, from, to }.
function quarters(now = new Date()) {
  const out = [];
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3);
  for (let k = 0; k < QUARTERS; k += 1) {
    const from = new Date(Date.UTC(y, q * 3, 1));
    const to = new Date(Date.UTC(y, q * 3 + 3, 1));
    out.push({ label: `Q${q + 1} ${y}`, from, to, current: k === 0 });
    q -= 1;
    if (q < 0) { q = 3; y -= 1; }
  }
  return out;
}

async function computeTeam() {
  const qs = quarters();
  const since = qs[qs.length - 1].from;
  const [{ rows: [cfg] }, { rows: pending }, { rows: proposed }, { rows: expiring }, { rows: validations },
         { rows: acceptances }, { rows: completions }, { rows: requests }, { rows: team }] = await Promise.all([
    query(`SELECT mandatory_action_score FROM org_config LIMIT 1`),
    query(`SELECT r.id AS risk_id, r.risk_score AS score, r.created_at AS since, s.name AS system_name, t.name AS threat_name,
                  d.name AS department_name
             FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
             LEFT JOIN departments d ON d.id = s.department_id
            WHERE r.is_active AND r.validation_status::text = 'pending' ORDER BY r.created_at`),
    query(`SELECT a.id AS action_id, a.title, a.created_at AS since, COALESCE(a.subject_type::text, 'risk') AS subject_type,
                  (SELECT sar.risk_id FROM security_action_risks sar WHERE sar.action_id = a.id ORDER BY sar.created_at LIMIT 1) AS risk_id
             FROM security_actions a WHERE a.status::text = 'proposed' ORDER BY a.created_at`),
    // Expiring soon, or expired with nothing renewed in its place.
    query(`SELECT x.id AS exception_id, x.risk_id, x.status::text AS status, x.expires_at, x.subject_type::text AS subject_type,
                  COALESCE(s.name || ' — ' || t.name, x.subject_type::text) AS label
             FROM exceptions x
             LEFT JOIN risks r ON r.id = x.risk_id LEFT JOIN systems s ON s.id = r.system_id LEFT JOIN threats t ON t.id = r.threat_id
            WHERE (x.risk_id IS NULL OR r.is_active)
              AND ((x.status = 'active' AND x.expires_at <= now() + interval '${EXPIRY_DAYS} days')
               OR (x.status = 'expired' AND NOT EXISTS (
                     SELECT 1 FROM exceptions y WHERE y.status = 'active' AND y.subject_type = x.subject_type
                        AND y.subject_id IS NOT DISTINCT FROM x.subject_id AND y.risk_id IS NOT DISTINCT FROM x.risk_id)))
            ORDER BY x.expires_at`),
    query(`SELECT validated_at AS at, EXTRACT(EPOCH FROM validated_at - created_at) / 86400 AS days
             FROM risks WHERE validated_at >= $1 AND validated_at >= created_at`, [since]),
    query(`SELECT accepted_at AS at, EXTRACT(EPOCH FROM accepted_at - created_at) / 86400 AS days
             FROM security_actions WHERE accepted_at >= $1 AND accepted_at >= created_at`, [since]),
    // Points removed: what each risk scored when its action was accepted, less
    // what it scores now. Never negative: work does not add risk.
    query(`SELECT a.id, a.completed_at AS at,
                  CASE WHEN a.accepted_at IS NOT NULL AND a.completed_at >= a.accepted_at
                       THEN EXTRACT(EPOCH FROM a.completed_at - a.accepted_at) / 86400 END AS days,
                  COALESCE((SELECT SUM(GREATEST(0, sar.baseline_risk_score - r.risk_score))
                              FROM security_action_risks sar JOIN risks r ON r.id = sar.risk_id
                             WHERE sar.action_id = a.id AND sar.baseline_risk_score IS NOT NULL), 0)::int AS points
             FROM security_actions a WHERE a.status::text = 'completed' AND a.completed_at >= $1`, [since]),
    query(`SELECT l.user_id, split_part(l.endpoint, '/', 4) AS area, COUNT(*)::int AS n
             FROM api_request_log l
            WHERE l.requested_at >= now() - interval '${WORK_DAYS} days'
              AND l.method IN ('POST', 'PUT', 'PATCH', 'DELETE') AND l.status_code < 400
              AND l.role = ANY($1::text[]) AND l.user_id IS NOT NULL
            GROUP BY 1, 2`, [SECURITY_ROLES]),
    query(`SELECT u.id, u.full_name, array_agg(DISTINCT vr.role::text ORDER BY vr.role::text) AS roles
             FROM users u JOIN v_user_roles vr ON vr.user_id = u.id
            WHERE u.is_active AND vr.role::text = ANY($1::text[])
            GROUP BY u.id, u.full_name ORDER BY u.full_name`, [SECURITY_ROLES]),
  ]);

  const now = Date.now();
  const age = (t) => Math.floor((now - new Date(t).getTime()) / 86400000);

  // ── Waiting on security ────────────────────────────────────────────────────
  const waitGroup = (key, label, who, rows) => ({ key, label, who, count: rows.length, oldest_days: rows.length ? Math.max(...rows.map((r) => r.days)) : null, rows: rows.slice(0, WAIT_ROWS) });
  const waiting = [
    waitGroup('validation', 'Risks waiting for validation', 'The CISO: validate or return each one',
      pending.map((r) => ({ ...r, days: age(r.since) }))),
    waitGroup('acceptance', 'Security actions waiting to be accepted', 'The CISO, or the SIRO at the Security Working Group',
      proposed.map((a) => ({ ...a, days: age(a.since) }))),
    waitGroup('expiring', `Exceptions expired, or expiring within ${EXPIRY_DAYS} days`, 'The SIRO or CISO: renew, or act on the risk',
      expiring.map((x) => ({ ...x, days: x.status === 'expired' ? age(x.expires_at) : -Math.ceil((new Date(x.expires_at).getTime() - now) / 86400000) }))),
  ];
  // Waiting on validation or acceptance; an acceptance yet to expire is not a wait.
  const waits = waiting.flatMap((g) => g.rows.map((r) => ({ ...r, group: g.key }))).filter((r) => r.days >= 0);
  const oldest = waits.sort((a, b) => b.days - a.days)[0] || null;

  // ── Turnaround and delivery, quarter by quarter ────────────────────────────
  const inQ = (q, rows) => rows.filter((r) => r.at >= q.from && r.at < q.to);
  const heads = team.length;
  const byQuarter = qs.map((q) => {
    const v = inQ(q, validations);
    const a = inQ(q, acceptances);
    const c = inQ(q, completions);
    const done = c.filter((x) => x.days != null);
    const points = c.reduce((s, x) => s + x.points, 0);
    return {
      label: q.label, current: q.current, from: q.from.toISOString().slice(0, 10),
      validation: { n: v.length, median_days: round1(median(v.map((x) => Number(x.days)))) },
      acceptance: { n: a.length, median_days: round1(median(a.map((x) => Number(x.days)))) },
      delivery: { n: done.length, median_days: round1(median(done.map((x) => Number(x.days)))) },
      completed: c.length, points_removed: points,
      points_per_head: heads ? round1(points / heads) : null,
    };
  });

  // ── Where the work goes ────────────────────────────────────────────────────
  const people = team.map((u) => ({ id: u.id, name: u.full_name, roles: u.roles, total: 0, areas: {} }));
  const byId = new Map(people.map((p) => [p.id, p]));
  const areaTotals = {};
  for (const r of requests) {
    if (NOT_WORK.includes(r.area)) continue;
    const label = AREA[r.area] || 'Other';
    const p = byId.get(r.user_id);
    if (!p) continue; // made under a security role, by someone who no longer holds it
    p.areas[label] = (p.areas[label] || 0) + r.n;
    p.total += r.n;
    areaTotals[label] = (areaTotals[label] || 0) + r.n;
  }
  const total = people.reduce((s, p) => s + p.total, 0);
  people.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const areas = Object.entries(areaTotals).sort((a, b) => b[1] - a[1]).map(([area, n]) => ({ area, n }));

  const current = byQuarter[0];
  return {
    generated_at: new Date().toISOString(),
    thresholds: { action: cfg.mandatory_action_score },
    headline: {
      waiting: waits.length,
      oldest_days: oldest ? oldest.days : null,
      oldest_group: oldest ? oldest.group : null,
      validation_median_days: current.validation.median_days,
      points_removed_quarter: current.points_removed,
      heads,
    },
    waiting,
    quarters: byQuarter,
    work: {
      days: WORK_DAYS, total, areas, people,
      top_share: total && people.length ? Math.round((people[0].total / total) * 100) : null,
    },
  };
}

module.exports = { computeTeam, quarters, median };
