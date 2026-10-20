#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS demo-date rebaser — keeps a training dataset perpetually "now".
//
//   node db/rebase-demo-dates.js [--dry-run] [--position <0..1>]
//
// WHY THIS EXISTS
// A training instance is built once and used for years. Its dates are fixed, but
// the world's are not, so the dataset silently rots: the planned SWG meeting
// falls into the past and disappears from every dashboard (the swg-summary query
// filters `meeting_date >= CURRENT_DATE`), risk exceptions pass their expiry, and
// `expire_overdue_exceptions()` — which runs at startup, on a daily timer AND
// lazily on the exceptions read endpoints — MUTATES them into the breach queue.
// That last one is not display drift; it rewrites rows and writes audit entries.
//
// This script shifts every date in the operational data by a single uniform
// interval, so every relative gap is preserved exactly and the whole dataset
// simply slides forward to sit around today.
//
// IDEMPOTENT BY DESIGN
// It does NOT shift "by today minus some reference date" — that would double-shift
// on a second run and put the meeting a year out. It shifts TO an anchor: the
// midpoint between the last issued meeting and the next planned one is moved onto
// today. Running it twice is therefore a no-op, which is what makes it safe to
// wire into a container entrypoint or a cron timer.
//
// WHAT IT CANNOT DO
// It cannot repair state a sweep has already mutated. `expire_overdue_exceptions()`
// only moves active → expired; there is no reverse path. Once an exception has
// expired, moving its `expires_at` forward leaves it sitting as expired with an
// escalation stamp and an audit row. The canonical reset is therefore
// RESTORE-then-rebase, and the rebase cadence should beat the nearest expiry
// horizon so the sweep never fires at all.
//
// TRIGGERS
// 62 BEFORE UPDATE triggers exist, including CIA-cascade recomputes and SoD
// guards. A bulk date shift must not fire them — a recompute would rewrite
// derived scores and an SoD guard would reject the write outright. They are
// disabled per-table inside the transaction (ALTER TABLE ... DISABLE TRIGGER
// USER needs table ownership, which both the local replica and the deployed
// `cirks` role have; `session_replication_role` would need superuser and is not
// portable here).

require('dotenv').config();
const { pool, query } = require('../src/db/pool');

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { position: 0.5 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--position') out.position = parseFloat(argv[++i]);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const HELP = `
CIRKS demo-date rebaser — slide the training dataset so "today" sits between meetings.

  node db/rebase-demo-dates.js [options]

  --dry-run           report the shift and the before/after dates; write nothing
  --position <0..1>   where today should sit between the last issued meeting and
                      the next planned one. 0 = on the last meeting, 1 = on the
                      next, 0.5 = midway (default)
  -h, --help          this message

Run it from the app container:
  docker compose exec app node riskapp/db/rebase-demo-dates.js
`;

// Tables deliberately NOT shifted.
//   schema_migrations — infrastructure history, not demo narrative
//   refresh_tokens    — shifting would resurrect revoked sessions
//   api_keys          — shifting would revive an expired machine credential
//   api_request_log   — request telemetry; never surfaced in the training UI
const EXCLUDED_TABLES = new Set([
  'schema_migrations',
  'refresh_tokens',
  'api_keys',
  'api_request_log',
]);

const log = (m) => console.log(m);

// ── Anchor resolution ────────────────────────────────────────────────────────
// The two meetings that define "between meetings". Both must exist: without them
// there is no cycle to sit inside and a shift would be arbitrary.
async function resolveAnchor(position) {
  const { rows: prev } = await query(`
    SELECT meeting_date FROM working_group_meetings
     WHERE minutes_issued_at IS NOT NULL
     ORDER BY meeting_date DESC LIMIT 1`);
  const { rows: next } = await query(`
    SELECT meeting_date FROM working_group_meetings
     WHERE closed_at IS NULL AND planned_at IS NOT NULL
     ORDER BY meeting_date ASC LIMIT 1`);

  if (!prev.length) throw new Error('No meeting with issued minutes — nothing to anchor the past end of the cycle on.');
  if (!next.length) throw new Error('No open planned meeting — nothing to anchor the future end of the cycle on.');

  // Compute the midpoint and the resulting shift in the database, so the
  // arithmetic uses the same CURRENT_DATE the application will.
  //
  // Every date is returned as TEXT, not as a date. The pg driver hands back a JS
  // Date at local midnight, and toISOString() then renders it in UTC — which in
  // any positive-offset timezone (BST here) prints the PREVIOUS day. The numbers
  // would still be right, because all the arithmetic happens in SQL, but the
  // report would be off by one and quietly discredit the tool.
  const { rows } = await query(`
    SELECT to_char($1::date, 'YYYY-MM-DD')                     AS prev_date,
           to_char($2::date, 'YYYY-MM-DD')                     AS next_date,
           ($2::date - $1::date)                               AS cycle_days,
           to_char($1::date + (($2::date - $1::date) * $3::numeric)::int,
                   'YYYY-MM-DD')                               AS anchor_date,
           to_char(CURRENT_DATE, 'YYYY-MM-DD')                 AS today,
           (CURRENT_DATE - ($1::date + (($2::date - $1::date) * $3::numeric)::int)) AS shift_days`,
    [prev[0].meeting_date, next[0].meeting_date, position]);

  return rows[0];
}

// ── Column discovery ─────────────────────────────────────────────────────────
async function shiftableColumns() {
  const { rows } = await query(`
    SELECT c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
       AND t.table_type   = 'BASE TABLE'
     WHERE c.table_schema = 'public'
       AND c.data_type IN ('date','timestamp with time zone','timestamp without time zone')
       AND c.is_generated = 'NEVER'
     ORDER BY c.table_name, c.column_name`);

  const byTable = new Map();
  for (const r of rows) {
    if (EXCLUDED_TABLES.has(r.table_name)) continue;
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
    byTable.get(r.table_name).push(r);
  }
  return byTable;
}

// A date column takes plain integer-day arithmetic; a timestamp takes an
// interval. Mixing them up silently promotes a date to a timestamp.
function shiftExpr(col) {
  return col.data_type === 'date'
    ? `"${col.column_name}" = "${col.column_name}" + $1::int`
    : `"${col.column_name}" = "${col.column_name}" + make_interval(days => $1)`;
}

// ── Reporting ────────────────────────────────────────────────────────────────
async function snapshot(label) {
  const { rows } = await query(`
    SELECT 'meetings: ' || string_agg(
             to_char(meeting_date,'YYYY-MM-DD') || ' (' ||
             CASE WHEN minutes_issued_at IS NOT NULL THEN 'issued'
                  WHEN closed_at IS NOT NULL THEN 'closed'
                  WHEN planned_at IS NOT NULL THEN 'planned'
                  ELSE 'draft' END || ', ' ||
             (meeting_date - CURRENT_DATE) || 'd)', '  ' ORDER BY meeting_date) AS line
      FROM working_group_meetings
    UNION ALL
    SELECT 'exceptions: ' || COALESCE(string_agg(
             status || ' expires ' || to_char(expires_at,'YYYY-MM-DD') ||
             ' (' || (expires_at - CURRENT_DATE) || 'd)', '  ' ORDER BY expires_at), 'none')
      FROM exceptions WHERE status = 'active'`);
  log(`   ${label}`);
  rows.forEach(r => log(`     ${r.line}`));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) { console.log(HELP); return; }
  if (!(opts.position >= 0 && opts.position <= 1)) {
    throw new Error(`--position must be between 0 and 1 (got ${opts.position})`);
  }

  log(`CIRKS demo-date rebase${opts.dryRun ? '   [DRY RUN — no writes]' : ''}`);

  const a = await resolveAnchor(opts.position);
  const shift = Number(a.shift_days);

  log('');
  log(`   last issued meeting   ${a.prev_date}`);
  log(`   next planned meeting  ${a.next_date}`);
  log(`   cycle length          ${a.cycle_days} days`);
  log(`   anchor (position ${opts.position})   ${a.anchor_date}`);
  log(`   today                 ${a.today}`);
  log(`   shift                 ${shift >= 0 ? '+' : ''}${shift} days`);
  log('');

  await snapshot('before:');

  if (shift === 0) {
    log('');
    log('   Already anchored — nothing to do.');
    return;
  }

  const byTable = await shiftableColumns();
  const totalCols = [...byTable.values()].reduce((n, cs) => n + cs.length, 0);
  log('');
  log(`   ${totalCols} date/timestamp columns across ${byTable.size} tables`);

  if (opts.dryRun) {
    log('');
    log(`   DRY RUN — would shift every date by ${shift >= 0 ? '+' : ''}${shift} days.`);
    return;
  }

  const client = await pool.connect();
  let rowsTouched = 0;
  try {
    await client.query('BEGIN');

    // Suppress the 62 BEFORE UPDATE triggers for the duration — see header.
    for (const table of byTable.keys()) {
      await client.query(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
    }

    for (const [table, cols] of byTable) {
      const sets = cols.map(shiftExpr).join(', ');
      const notNull = cols.map(c => `"${c.column_name}" IS NOT NULL`).join(' OR ');
      const res = await client.query(
        `UPDATE "${table}" SET ${sets} WHERE ${notNull}`, [shift]);
      rowsTouched += res.rowCount;
    }

    for (const table of byTable.keys()) {
      await client.query(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  log(`   ${rowsTouched} rows shifted`);
  log('');
  await snapshot('after:');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(`\n[rebase] FAILED: ${err.message}`);
    pool.end();
    process.exit(1);
  });
