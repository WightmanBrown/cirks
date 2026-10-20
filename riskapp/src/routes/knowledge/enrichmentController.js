'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// SOC enrichment resolver: an event's IP or hostname → the host(s) carrying it →
// the system(s) those hosts belong to (via the existing system_components M:M) →
// the impact + live risk already curated through governance. Read-only.
//
// Matching:
//   * a valid IP/CIDR  → component_ip_addresses WHERE ip_address >>= $1 (a stored
//     host /32 resolves on equality; a stored CIDR resolves any contained address)
//   * anything else    → hostname ILIKE %q% (partial, case-insensitive)
//
// One host can belong to several systems (shared infra) → ALL matching systems are
// returned, ranked by risk score desc (full blast radius). Bands are computed
// server-side from org_config thresholds so the contract is consumer-agnostic.

const net = require('net');
const { query } = require('../../db/pool');
const { can, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { isDeptScoped, getUserDepartment } = require('../../auth/scoping');

function isValidInet(value) {
  if (typeof value !== 'string') return false;
  const [addr, mask, ...rest] = value.trim().split('/');
  if (rest.length) return false;
  const fam = net.isIP(addr);
  if (fam === 0) return false;
  if (mask !== undefined) {
    const m = Number(mask);
    const max = fam === 6 ? 128 : 32;
    if (!Number.isInteger(m) || m < 0 || m > max) return false;
  }
  return true;
}

// Score band — mirrors the frontend scoreLevel() using org_config thresholds.
function bandFor(score, t) {
  if (score == null) return null;
  if (score >= 25)            return 'catastrophic';
  if (score > t.critical)     return 'critical';
  if (score > t.high)         return 'high';
  if (score > t.medium)       return 'medium';
  return 'low';
}

// Org-config risk-score thresholds (fetched once per request, shared across a batch).
async function getThresholds() {
  const { rows } = await query(
    'SELECT threshold_medium, threshold_high, threshold_critical FROM org_config WHERE id = TRUE'
  );
  return {
    medium:   rows[0]?.threshold_medium   ?? 5,
    high:     rows[0]?.threshold_high     ?? 11,
    critical: rows[0]?.threshold_critical ?? 19,
  };
}

// Resolve a single query (IP/CIDR or hostname) → matched hosts + systems + risk.
// Pure data (no res); reused by the single GET and the bulk POST.
async function resolveOne(rawQuery, thresholds) {
  const q = (rawQuery || '').toString().trim();
  if (!q) return { query: q, query_kind: null, matched: false, hosts: [], systems: [], error: 'empty query' };

  const isIp = isValidInet(q);
  const queryKind = isIp ? 'ip' : 'hostname';

  // ── 1. Matching hosts ───────────────────────────────────────────────────────
  let hosts;
  if (isIp) {
    ({ rows: hosts } = await query(
      `SELECT cc.id, cc.name, cc.hostname,
              COALESCE(json_agg(DISTINCT abbrev(ip.ip_address)) FILTER (WHERE ip.ip_address >>= $1::inet), '[]'::json) AS matched_ips
       FROM control_components cc
       JOIN component_ip_addresses ip ON ip.component_id = cc.id
       WHERE cc.is_host = TRUE AND ip.ip_address >>= $1::inet
       GROUP BY cc.id, cc.name, cc.hostname
       ORDER BY cc.name`,
      [q]
    ));
  } else {
    ({ rows: hosts } = await query(
      `SELECT cc.id, cc.name, cc.hostname, '[]'::json AS matched_ips
       FROM control_components cc
       WHERE cc.is_host = TRUE AND cc.hostname ILIKE $1
       ORDER BY cc.name`,
      [`%${q}%`]
    ));
  }

  if (hosts.length === 0) {
    return { query: q, query_kind: queryKind, matched: false, hosts: [], systems: [] };
  }

  // ── 2. Systems carried by those hosts, with impact + risk ────────────────────
  const hostIds = hosts.map(h => h.id);
  const { rows: systems } = await query(
    `SELECT s.id, s.name,
            d.name AS department_name,
            s.impact_c, s.impact_i, s.impact_a,
            GREATEST(COALESCE(s.impact_c,0), COALESCE(s.impact_i,0), COALESCE(s.impact_a,0)) AS impact_max,
            rg.max_risk_score,
            rg.active_count,
            array_agg(DISTINCT cc.name ORDER BY cc.name) AS via_hosts
     FROM system_components sc
     JOIN systems s          ON s.id = sc.system_id AND s.is_active = TRUE
     JOIN control_components cc ON cc.id = sc.component_id
     LEFT JOIN departments d ON d.id = s.department_id
     LEFT JOIN LATERAL (
       SELECT MAX(r.risk_score) AS max_risk_score,
              COUNT(*) FILTER (WHERE r.risk_score IS NOT NULL)::int AS active_count
       FROM risks r WHERE r.system_id = s.id AND r.is_active = TRUE
     ) rg ON TRUE
     WHERE sc.component_id = ANY($1::uuid[])
     GROUP BY s.id, s.name, d.name, s.impact_c, s.impact_i, s.impact_a,
              rg.max_risk_score, rg.active_count
     ORDER BY rg.max_risk_score DESC NULLS LAST, impact_max DESC, s.name`,
    [hostIds]
  );

  const shaped = systems.map(s => ({
    id:              s.id,
    name:            s.name,
    department_name: s.department_name,
    impact: {
      c:   s.impact_c,
      i:   s.impact_i,
      a:   s.impact_a,
      max: s.impact_max || null,
    },
    risk: {
      max_score:    s.max_risk_score,
      band:         bandFor(s.max_risk_score, thresholds),
      active_count: s.active_count ?? 0,
    },
    via_hosts: s.via_hosts,
  }));

  return {
    query:      q,
    query_kind: queryKind,
    matched:    true,
    hosts:      hosts.map(h => ({ id: h.id, name: h.name, hostname: h.hostname, matched_ips: h.matched_ips })),
    systems:    shaped,
  };
}

// GET /knowledge/enrich?q=<ip|hostname> — single lookup
async function enrich(req, res, next) {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'A query (q) — an IP address or hostname — is required.' });
  try {
    const thresholds = await getThresholds();
    res.json(await resolveOne(q, thresholds));
  } catch (err) {
    next(err);
  }
}

const BULK_MAX = 256;

// POST /knowledge/enrich/bulk { queries: [<ip|hostname>, …] } — batch (machine path)
async function enrichBulk(req, res, next) {
  const queries = req.body?.queries;
  if (!Array.isArray(queries) || queries.length === 0) {
    return res.status(400).json({ error: 'Body must be { queries: [<ip|hostname>, …] } with at least one entry.' });
  }
  if (queries.length > BULK_MAX) {
    return res.status(400).json({ error: `Too many queries (${queries.length}); the per-request limit is ${BULK_MAX}.` });
  }
  try {
    const thresholds = await getThresholds(); // fetched once, shared across the batch
    const results = [];
    for (const q of queries) results.push(await resolveOne(q, thresholds));
    res.json({ count: results.length, results });
  } catch (err) {
    next(err);
  }
}

// GET /knowledge/search?q= — universal, RBAC/scope-aware text search.
//
// Searches operational knowledge (NOT CIRKS setup data): business services,
// information assets, systems, PPITF components, risks, security actions,
// threats and controls — all by name/title and description.
//
// "In the context of the user": each entity is included only if the caller holds
// that entity's own read capability (the same cap that gates its list page), and
// dept-bearing entities are row-scoped to the caller's department when they are a
// dept-scoped role (IAO/IAM) and department isolation is on. This means, e.g.,
// security_consultant (no risks/actions read) sees architecture + threats +
// controls but no risks; soc_analyst (only knowledge.query) gets nothing here and
// uses /enrich instead. No per-role special-casing — it falls out of the caps.
//
// Every row is shaped uniformly { id, name, description, department_name,
// entity_type } so the frontend renderer is generic. Each entity is capped at 10.
async function searchAll(q, user) {
  const { role, id: userId } = user;
  const like = `%${q}%`;

  // Dept-scoped role + isolation on → confine dept-bearing rows to own dept.
  const deptScoped = isDeptScoped(role) && isDepartmentIsolationEnabled();
  const myDept = deptScoped ? await getUserDepartment(userId) : null;
  // A dept-scoped user with no department assigned sees no dept-bearing rows.
  const deptBearingOk = !deptScoped || !!myDept;

  const has = (cap) => can(role, cap).allowed;

  // Dept clause + params for a dept-bearing entity (alias carries department_id + is_shared).
  const deptBits = (alias) =>
    deptScoped
      ? { clause: `AND (${alias}.department_id = $2 OR ${alias}.is_shared = TRUE)`, params: [like, myDept] }
      : { clause: '', params: [like] };

  const jobs = [];
  const add = (key, sql, params) => jobs.push({ key, sql, params });

  // ── Business Architecture (dept-bearing: services, assets, systems) ──────────
  if (deptBearingOk && has('services.read')) {
    const { clause, params } = deptBits('bs');
    add('services',
      `SELECT bs.id, bs.name, bs.description,
              d.name AS department_name, 'service' AS entity_type,
              GREATEST(bs.confidentiality, bs.integrity, bs.availability) AS bil_1d,
              (SELECT MAX(r.risk_score)
                 FROM business_service_systems bss
                 JOIN risks r ON r.system_id = bss.system_id AND r.is_active
                WHERE bss.service_id = bs.id) AS risk_1d
       FROM business_services bs
       LEFT JOIN departments d ON d.id = bs.department_id
       WHERE bs.is_active = TRUE AND (bs.name ILIKE $1 OR bs.description ILIKE $1) ${clause}
       ORDER BY bs.name LIMIT 10`, params);
  }
  if (deptBearingOk && has('assets.read')) {
    const { clause, params } = deptBits('ia');
    add('assets',
      `SELECT ia.id, ia.name, ia.description,
              d.name AS department_name, 'asset' AS entity_type,
              GREATEST(ia.confidentiality, ia.integrity, ia.availability) AS bil_1d
       FROM information_assets ia
       LEFT JOIN departments d ON d.id = ia.department_id
       WHERE ia.is_active = TRUE AND (ia.name ILIKE $1 OR ia.description ILIKE $1) ${clause}
       ORDER BY ia.name LIMIT 10`, params);
  }
  if (deptBearingOk && has('systems.read')) {
    const { clause, params } = deptBits('s');
    add('systems',
      `SELECT s.id, s.name, s.description,
              d.name AS department_name, 'system' AS entity_type,
              GREATEST(s.impact_c, s.impact_i, s.impact_a) AS bil_1d,
              (SELECT MAX(r.risk_score) FROM risks r
                WHERE r.system_id = s.id AND r.is_active) AS risk_1d
       FROM systems s
       LEFT JOIN departments d ON d.id = s.department_id
       WHERE s.is_active = TRUE AND (s.name ILIKE $1 OR s.description ILIKE $1) ${clause}
       ORDER BY s.name LIMIT 10`, params);
  }

  // ── PPITF components (org-wide catalogue) ────────────────────────────────────
  if (has('components.read')) {
    add('components',
      `SELECT cc.id, cc.name, cc.description,
              NULL AS department_name, cc.component_type AS entity_type,
              cc.status AS component_status,
              EXISTS (SELECT 1 FROM risk_components rc
                        JOIN risks r ON r.id = rc.risk_id AND r.is_active
                       WHERE rc.component_id = cc.id) AS is_vulnerable,
              (SELECT MAX(r.risk_score) FROM risk_components rc
                 JOIN risks r ON r.id = rc.risk_id AND r.is_active
                WHERE rc.component_id = cc.id) AS risk_1d
       FROM control_components cc
       WHERE cc.component_type IN ('people','process','technology','facility')
         AND (cc.name ILIKE $1 OR cc.description ILIKE $1)
       ORDER BY cc.component_type, cc.name LIMIT 10`, [like]);
  }

  // ── Risks (dept-bearing via owning system; matched on threat/system/asset) ───
  if (deptBearingOk && has('risks.read')) {
    const { clause, params } = deptBits('sys');
    add('risks',
      `SELECT r.id,
              t.name || ' on ' || sys.name AS name,
              r.validation_status AS description,
              d.name AS department_name, 'risk' AS entity_type,
              r.risk_score AS risk_1d
       FROM risks r
       JOIN systems sys            ON sys.id = r.system_id
       JOIN threats t              ON t.id   = r.threat_id
       LEFT JOIN information_assets ia ON ia.id = r.asset_id
       LEFT JOIN departments d     ON d.id   = sys.department_id
       WHERE r.is_active = TRUE
         AND (t.name ILIKE $1 OR sys.name ILIKE $1 OR ia.name ILIKE $1) ${clause}
       ORDER BY r.risk_score DESC NULLS LAST, sys.name LIMIT 10`, params);
  }

  // ── Security actions (dept-bearing via linked risk's system) ─────────────────
  if (deptBearingOk && has('actions.read')) {
    const deptExists = deptScoped
      ? `AND EXISTS (
           SELECT 1 FROM security_action_risks sar
           JOIN risks r2   ON r2.id = sar.risk_id AND r2.is_active = TRUE
           JOIN systems s2 ON s2.id = r2.system_id
           WHERE sar.action_id = sa.id
             AND (s2.department_id = $2 OR s2.is_shared = TRUE)
         )`
      : '';
    add('actions',
      `SELECT sa.id, sa.title AS name,
              sa.status || COALESCE(' · ' || u.full_name, '') AS description,
              NULL AS department_name, 'action' AS entity_type
       FROM security_actions sa
       LEFT JOIN users u ON u.id = sa.primary_owner_user_id
       WHERE (sa.title ILIKE $1 OR sa.description ILIKE $1) ${deptExists}
       ORDER BY sa.title LIMIT 10`,
      deptScoped ? [like, myDept] : [like]);
  }

  // ── Threats (org-wide catalogue) ─────────────────────────────────────────────
  if (has('threats.read')) {
    add('threats',
      `SELECT t.id, t.name, t.description,
              NULL AS department_name, 'threat' AS entity_type
       FROM threats t
       WHERE t.is_active = TRUE AND (t.name ILIKE $1 OR t.description ILIKE $1)
       ORDER BY t.name LIMIT 10`, [like]);
  }

  // ── Controls (org-wide catalogue; v87 native — no framework column) ──────────
  if (has('controls.read')) {
    add('controls',
      `SELECT c.id, c.title AS name, c.description,
              NULL AS department_name, 'control' AS entity_type
       FROM controls c
       WHERE (c.title ILIKE $1 OR c.description ILIKE $1)
       ORDER BY c.title LIMIT 10`, [like]);
  }

  const settled = await Promise.all(jobs.map(j => query(j.sql, j.params)));

  const out = {
    query: q,
    services: [], assets: [], systems: [], components: [],
    risks: [], actions: [], threats: [], controls: [],
  };
  jobs.forEach((j, i) => { out[j.key] = settled[i].rows; });
  out.total = ['services','assets','systems','components','risks','actions','threats','controls']
    .reduce((n, k) => n + out[k].length, 0);
  return out;
}

async function search(req, res, next) {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'A search term (q) is required.' });
  try {
    res.json(await searchAll(q, req.user));
  } catch (err) {
    next(err);
  }
}

module.exports = { enrich, enrichBulk, resolveOne, search, BULK_MAX };
