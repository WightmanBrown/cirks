'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Is the record current and trusted? — the CISO's C8 (docs/reporting-ciso.md).
// Can someone new, or someone asking, rely on what CIRKS says?
//   written  systems, business services, information assets and components:
//            described, owned and linked (a completeness ring per kind)
//   current  each record's last change — its own updated_at or the last
//            successful change made through CIRKS to it or beneath it (the
//            request log), whichever is later — and the stalest
//   used     who reads CIRKS, by role, and the lookups it answers (the
//            knowledge search and the SOC enrichment), from the request log
// Derived on read; nothing is stored.

const { query } = require('../db/pool');

const CURRENT_MONTHS = 12;
const USE_DAYS = 90;
const ROWS = 25;

// Each kind: its table, the URL area its API lives under (for the request
// log), its page, and what "written down" asks of it. Every check is SQL on
// alias t returning a boolean.
const KINDS = [
  {
    kind: 'system', label: 'Systems', table: 'systems', area: 'systems', page: '/systems/', active: 't.is_active',
    checks: [
      ['description', 'a description', `COALESCE(btrim(t.description), '') <> ''`],
      ['owner', 'an owner', 't.owner_user_id IS NOT NULL'],
      ['manager', 'a manager', 't.managed_by_user_id IS NOT NULL'],
      ['assets', 'the information it holds', 'EXISTS (SELECT 1 FROM system_assets x WHERE x.system_id = t.id)'],
      ['components', 'its components', 'EXISTS (SELECT 1 FROM system_components x WHERE x.system_id = t.id)'],
    ],
  },
  {
    kind: 'service', label: 'Business services', table: 'business_services', area: 'services', page: '/services/', active: 't.is_active',
    checks: [
      ['description', 'a description', `COALESCE(btrim(t.description), '') <> ''`],
      ['manager', 'a manager', 't.managed_by_user_id IS NOT NULL'],
      ['systems', 'the systems it uses', 'EXISTS (SELECT 1 FROM business_service_systems x WHERE x.service_id = t.id)'],
    ],
  },
  {
    kind: 'asset', label: 'Information assets', table: 'information_assets', area: 'assets', page: '/assets/', active: 't.is_active',
    checks: [
      ['description', 'a description', `COALESCE(btrim(t.description), '') <> ''`],
      ['owner', 'an owner', 't.owner_user_id IS NOT NULL'],
      ['manager', 'a manager', 't.managed_by_user_id IS NOT NULL'],
      ['systems', 'the systems holding it', 'EXISTS (SELECT 1 FROM system_assets x WHERE x.asset_id = t.id)'],
    ],
  },
  {
    kind: 'component', label: 'Components', table: 'control_components', area: 'components', page: null, active: 'TRUE',
    checks: [
      ['description', 'a description', `COALESCE(btrim(t.description), '') <> ''`],
      ['scope', 'its scope (once for the organisation, or per system)', 't.instantiation IS NOT NULL'],
      ['used', 'where it is used (a system, or a security solution)',
        `(EXISTS (SELECT 1 FROM system_components x WHERE x.component_id = t.id)
          OR EXISTS (SELECT 1 FROM delivery_pattern_parts x WHERE x.component_id = t.id))`],
    ],
  },
];

async function kindReport(k) {
  const checks = k.checks.map(([key, words, sql]) => `${sql} AS "${key}"`).join(', ');
  // The last change made through CIRKS to this record or beneath it: the
  // request log names the record's id in the path (/api/v1/<area>/<id>/…).
  const { rows } = await query(`
    WITH writes AS (
      SELECT split_part(l.endpoint, '/', 5) AS id, MAX(l.requested_at) AS at
        FROM api_request_log l
       WHERE split_part(l.endpoint, '/', 4) = $1
         AND l.method IN ('POST', 'PUT', 'PATCH', 'DELETE') AND l.status_code < 400
       GROUP BY 1)
    SELECT t.id, t.name, t.created_at, GREATEST(t.updated_at, w.at) AS last_change, ${checks}
      FROM ${k.table} t
      LEFT JOIN writes w ON w.id = t.id::text
     WHERE ${k.active}
     ORDER BY t.name`, [k.area]);

  const keys = k.checks.map(([key]) => key);
  let complete = 0;
  let partial = 0;
  let missing = 0;
  const gaps = [];
  for (const r of rows) {
    const have = keys.filter((key) => r[key]).length;
    if (have === keys.length) complete += 1;
    else {
      if (have === 0) missing += 1; else partial += 1;
      gaps.push({ id: r.id, name: r.name, lacks: k.checks.filter(([key]) => !r[key]).map(([, words]) => words) });
    }
  }
  const byCheck = k.checks.map(([key, words]) => ({ key, words, have: rows.filter((r) => r[key]).length }));

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - CURRENT_MONTHS);
  const changedRecently = rows.filter((r) => r.last_change && new Date(r.last_change) >= cutoff).length;
  // Never changed since it was recorded: no later change than its creation.
  const untouched = rows.filter((r) => !r.last_change || new Date(r.last_change) - new Date(r.created_at) < 60000).length;
  const stalest = [...rows]
    .sort((a, b) => new Date(a.last_change || a.created_at) - new Date(b.last_change || b.created_at))
    .slice(0, 10)
    .map((r) => ({ id: r.id, name: r.name, last_change: r.last_change || r.created_at, created_at: r.created_at }));

  return {
    kind: k.kind, label: k.label, page: k.page, total: rows.length,
    written: { complete, partial, missing, checks: byCheck, gaps: gaps.slice(0, ROWS), gaps_count: gaps.length },
    current: { months: CURRENT_MONTHS, changed: changedRecently, untouched, stalest },
  };
}

async function computeRecord() {
  const kinds = [];
  for (const k of KINDS) kinds.push(await kindReport(k));

  // Who reads CIRKS, by role: people who opened anything in it in the last
  // USE_DAYS days, and the knowledge lookups it answered. A machine (an API
  // key) is counted under the role it assumes. Unauthenticated requests (the
  // public /meta) are no one reading the record.
  const [{ rows: readers }, { rows: [lookups] }, { rows: [people] }] = await Promise.all([
    query(`SELECT l.role, COUNT(DISTINCT l.user_id)::int AS people, COUNT(*)::int AS reads
             FROM api_request_log l
            WHERE l.requested_at >= now() - interval '${USE_DAYS} days' AND l.method = 'GET' AND l.status_code < 400
              AND l.role IS NOT NULL AND split_part(l.endpoint, '/', 4) NOT IN ('auth', 'users', 'org', 'meta')
            GROUP BY 1 ORDER BY 3 DESC`),
    query(`SELECT COUNT(*) FILTER (WHERE l.endpoint LIKE '/api/v1/knowledge/search%')::int AS searches,
                  COUNT(*) FILTER (WHERE l.endpoint LIKE '/api/v1/knowledge/enrich%')::int AS enrichments,
                  COUNT(*) FILTER (WHERE l.endpoint LIKE '/api/v1/knowledge/enrich%' AND l.user_id IS NULL)::int AS by_machine
             FROM api_request_log l
            WHERE l.requested_at >= now() - interval '${USE_DAYS} days' AND l.status_code < 400`),
    query(`SELECT COUNT(*) FILTER (WHERE is_active)::int AS active FROM users`),
  ]);

  const sum = (f) => kinds.reduce((a, k) => a + f(k), 0);
  return {
    generated_at: new Date().toISOString(),
    headline: {
      records: sum((k) => k.total),
      written_complete: sum((k) => k.written.complete),
      changed: sum((k) => k.current.changed),
      untouched: sum((k) => k.current.untouched),
      readers: readers.reduce((a, r) => a + r.people, 0),
      people_active: people.active,
    },
    kinds,
    used: { days: USE_DAYS, readers, ...lookups },
  };
}

module.exports = { computeRecord, KINDS };
