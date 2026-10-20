'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { query }    = require('../../db/pool');
const { safeExceptionSweep } = require('../../jobs/exceptionSweep');

const router = Router();
router.use(authenticate);

const canRead = requireCapability('exceptions.read');

// ── GET /exceptions/active ────────────────────────────────────────────────────
// Active exceptions are read-visible to EVERYONE (every authenticated role holds
// exceptions.read), org-wide and unscoped — a deliberate transparency choice:
// an active exception is an unresolved risk acceptance, and visibility creates
// accountability/peer pressure to resolve it. Department isolation does NOT
// apply to exception *reads*. Write (accept/renew/revoke) stays seat-gated + SoD
// on the risk routes. See memory project_access_scoping.
//
// Query params (optional filters, no longer access controls):
//   department_id    filter by department of the affected system
//   expiry_status    one of: ok, due_soon, overdue
// (band filtering is client-side — the view returns risk_score, frontend bands.)

router.get('/active', canRead, async (req, res, next) => {
  try {
    const { department_id, expiry_status } = req.query;

    const params = [];
    const conditions = [];

    if (department_id) {
      params.push(department_id);
      conditions.push(`e.department_id = $${params.length}`);
    }
    if (expiry_status) {
      params.push(expiry_status);
      conditions.push(`e.expiry_status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // v_active_exceptions carries department_id but not the department NAME.
    // The list page needs the name to render an owning-department column, which
    // is required wherever the department scope filter is offered — filtering
    // and sorting on a column the user cannot see is not a usable control.
    const { rows } = await query(
      `SELECT e.*, d.name AS department_name
         FROM v_active_exceptions e
         LEFT JOIN departments d ON d.id = e.department_id
        ${where}
        ORDER BY e.expires_at ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /exceptions/stats ─────────────────────────────────────────────────────
// Counts by expiry_status for dashboard headline cards.
// Extended fields (v58):
//   new_count          — exceptions accepted since the last SWG minutes were issued
//   oldest_age_days    — age of the oldest active exception (calendar days)
//   siro_escalated_count — exceptions older than org_config.max_exception_age_days

router.get('/stats', canRead, async (req, res, next) => {
  try {
    const { department_id } = req.query;

    const params = [];
    let where = '';
    let breachWhere = '';

    // Unscoped org-wide stats (optional department_id filter only).
    if (department_id) {
      params.push(department_id);
      where = `WHERE department_id = $${params.length}`;
      breachWhere = `WHERE department_id = $${params.length}`;
    }

    const { rows } = await query(`
      WITH last_swg AS (
        SELECT COALESCE(MAX(minutes_issued_at), '1970-01-01'::timestamptz) AS issued_at
        FROM   working_group_meetings
        WHERE  minutes_issued_at IS NOT NULL
      ),
      cfg AS (
        SELECT max_exception_age_days, threshold_high, threshold_critical FROM org_config LIMIT 1
      )
      SELECT
        COUNT(*)                                                             AS total,
        COUNT(*) FILTER (WHERE expiry_status = 'overdue')                   AS overdue,
        COUNT(*) FILTER (WHERE expiry_status = 'due_soon')                  AS due_soon,
        COUNT(*) FILTER (WHERE expiry_status = 'ok')                        AS ok,
        COUNT(*) FILTER (WHERE e.is_stale)                                  AS stale,
        COUNT(*) FILTER (WHERE e.risk_score >  (SELECT threshold_critical FROM cfg))   AS critical,
        COUNT(*) FILTER (WHERE e.risk_score >  (SELECT threshold_high FROM cfg)
                           AND e.risk_score <= (SELECT threshold_critical FROM cfg))   AS high,
        COUNT(*) FILTER (WHERE e.accepted_at > (SELECT issued_at FROM last_swg)) AS new_count,
        COALESCE(MAX(e.age_days), 0)                                        AS oldest_age_days,
        COUNT(*) FILTER (WHERE e.is_stale)                                  AS siro_escalated_count,
        (SELECT COUNT(*) FROM v_escalated_exceptions be ${breachWhere})     AS breach_count
      FROM v_active_exceptions e
      ${where}
    `, params);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /exceptions/escalated ───────────────────────────────────────────────────
// The breach queue: exceptions whose review date lapsed without renew/revoke and
// were auto-expired (v75). Drives the CISO escalation queue and the SIRO
// "in contravention of policy" panel. Read-visible to everyone (exceptions.read),
// org-wide and unscoped — same transparency rationale as /active. Optional
// department_id filter only.

router.get('/escalated', canRead, async (req, res, next) => {
  try {
    await safeExceptionSweep('read');

    const { department_id } = req.query;
    const params = [];
    let where = '';
    if (department_id) {
      params.push(department_id);
      where = `WHERE e.department_id = $${params.length}`;
    }

    // department_name for the same reason as /active — the breach table on the
    // exceptions page shares its department column and scope filter.
    const { rows } = await query(
      `SELECT e.*, d.name AS department_name
         FROM v_escalated_exceptions e
         LEFT JOIN departments d ON d.id = e.department_id
        ${where}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
