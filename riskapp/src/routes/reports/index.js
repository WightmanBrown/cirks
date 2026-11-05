'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Reports under Metrics & Reporting (docs/reporting-siro.md). Each report is a
// query over the live register — derived on read, nothing stored — and reads
// across every department, so the whole router sits behind reports.read
// (admin, CISO, SIRO; v167).
//
// GET /reports/siro — the SIRO's report: decisions for the SIRO (report 2) and
// exposure against the thresholds (report 1). GET /reports/board — the board
// summary (report 9), at the end of this file. GET /reports/ciso — the CISO's
// reports (src/reports/ciso.js). One score per risk read against
// two thresholds from org_config, never split by C/I/A (owner, 2026-11-03).

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { canAcceptRiskAtScore } = require('../../auth/acceptanceAuthority');
const { query }    = require('../../db/pool');
const { RISKS_SQL, OPEN_ACTION } = require('../../reports/riskRows');
const { computeBoard, TILES } = require('../../reports/board');
const { computeCiso } = require('../../reports/ciso');
const { computeDepartment } = require('../../reports/department');
const { listSystems, computeSystem } = require('../../reports/systems');
const { computeAnalyst, computeUnknown } = require('../../reports/analyst');
const { can } = require('../../auth/permissions');

const router = Router();
router.use(authenticate);

// GET /reports/department[?department_id=] — the IAO's My department report
// (src/reports/department.js, docs/reporting-iao.md). Registered before the
// reports.read guard below: it has its own capability, reports.department —
// the IAO's and IAM's own department, any department for admin, CISO and SIRO
// (v172). An own-department reader always gets their own, whatever is asked.
// The department a reports.department reader is looking at: their own unless
// they may choose (admin, CISO, SIRO). Sends the refusal itself and returns
// null when there is none.
async function readerDepartment(req, res) {
  const { scope } = can(req.user.role, 'reports.department');
  let departmentId = scope === 'all_depts' ? req.query.department_id || null : null;
  if (!departmentId) {
    const { rows: [me] } = await query('SELECT department_id FROM users WHERE id = $1', [req.user.id]);
    departmentId = me?.department_id || null;
  }
  if (!departmentId) {
    res.status(scope === 'all_depts' ? 400 : 403)
      .json({ error: scope === 'all_depts' ? 'Choose a department.' : 'Your account has no department, so there is no department report for you.' });
    return null;
  }
  return { departmentId, scope };
}

router.get('/department', requireCapability('reports.department'), async (req, res, next) => {
  try {
    const who = await readerDepartment(req, res);
    if (!who) return;
    const { departmentId, scope } = who;
    const report = await computeDepartment(departmentId);
    if (!report) return res.status(404).json({ error: 'No such department.' });
    res.json({ ...report, can_choose: scope === 'all_depts' });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'That is not a department id.' });
    next(err);
  }
});

// GET /reports/systems[?department_id=] — My systems, the IAM's report (M1, M9,
// M10; src/reports/systems.js, docs/reporting-iam.md). The same capability and
// department rule as /department (decision 1).
router.get('/systems', requireCapability('reports.department'), async (req, res, next) => {
  try {
    const who = await readerDepartment(req, res);
    if (!who) return;
    const report = await listSystems(who.departmentId, req.user.id);
    if (!report) return res.status(404).json({ error: 'No such department.' });
    res.json({ ...report, can_choose: who.scope === 'all_depts' });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'That is not a department id.' });
    next(err);
  }
});

// GET /reports/systems/:id — one system's report (M2–M5, M7, M8). An IAM or IAO
// may read their own department's systems only.
router.get('/systems/:id', requireCapability('reports.department'), async (req, res, next) => {
  try {
    const { scope } = can(req.user.role, 'reports.department');
    const report = await computeSystem(req.params.id);
    if (!report) return res.status(404).json({ error: 'No such system.' });
    if (scope !== 'all_depts') {
      const { rows: [me] } = await query('SELECT department_id FROM users WHERE id = $1', [req.user.id]);
      if (!me?.department_id || me.department_id !== report.system.department_id) {
        return res.status(403).json({ error: 'That system belongs to another department.' });
      }
    }
    res.json(report);
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'That is not a system id.' });
    next(err);
  }
});

router.use(requireCapability('reports.read'));

const TOP_RISKS = 10;
const TOP_SYSTEMS = 10;
const EXPIRING_DAYS = 90;

router.get('/siro', async (req, res, next) => {
  try {
    const [{ rows: [cfg] }, { rows: risks }, { rows: acceptances }, { rows: breaches }, { rows: signoffs }] =
      await Promise.all([
        query(`SELECT mandatory_action_score, exception_accept_analyst_max, exception_accept_owner_max,
                      max_exception_age_days, setup_phase_active, updated_at
                 FROM org_config LIMIT 1`),
        query(RISKS_SQL),
        query(`SELECT e.exception_id, e.risk_id, e.system_id, e.system_name, e.threat_name, e.risk_score,
                      e.accepted_by_name, e.accepted_role, e.accepted_at, e.expires_at, e.days_until_expiry,
                      e.expiry_status, e.is_stale, d.name AS department_name,
                      (SELECT COUNT(*)::int FROM exceptions h
                        WHERE h.risk_id = e.risk_id AND h.status = 'renewed')     AS renewals
                 FROM v_active_exceptions e
                 LEFT JOIN departments d ON d.id = e.department_id
                WHERE e.risk_id IS NOT NULL
                ORDER BY e.expires_at`),
        query(`SELECT e.* FROM v_escalated_exceptions e WHERE e.risk_id IS NOT NULL ORDER BY e.expires_at`),
        query(`SELECT a.id, a.title, a.status, a.target_date, a.created_at,
                      u.full_name AS owner_name
                 FROM security_actions a
                 LEFT JOIN users u ON u.id = a.primary_owner_user_id
                WHERE a.requires_siro_signoff AND a.siro_signoff_at IS NULL AND ${OPEN_ACTION}
                ORDER BY a.created_at`),
      ]);

    const action = cfg.mandatory_action_score;
    const ownerMax = cfg.exception_accept_owner_max;
    const atOrAbove = (s) => s != null && s >= action;
    const aboveOwner = (s) => s != null && s > ownerMax;
    const byScore = (a, b) => b.score - a.score || a.system_name.localeCompare(b.system_name);

    // What a reader sees of one risk, wherever it is listed.
    const riskRow = (r) => ({
      risk_id: r.id, system_id: r.system_id, system_name: r.system_name, threat_name: r.threat_name,
      department_id: r.department_id, department_name: r.department_name,
      owner_names: r.owner_names, owner_is_siro_fallback: r.owner_is_siro_fallback,
      score: r.score, target_score: r.target_score,
      treatment_decision: r.treatment_decision, review_date: r.review_date,
      has_open_action: r.has_open_action, has_active_exception: r.has_active_exception,
    });

    const stage = (key) => ({
      at_or_above_action: risks.filter((r) => atOrAbove(key(r))).length,
      above_owner_max:    risks.filter((r) => aboveOwner(key(r))).length,
    });

    // ── Report 1: exposure ────────────────────────────────────────────────
    const depts = new Map();
    for (const r of risks) {
      const k = r.department_id || 'none';
      if (!depts.has(k)) {
        depts.set(k, { department_id: r.department_id, department_name: r.department_name || 'No department',
                       owner_names: r.owner_names, owner_is_siro_fallback: r.owner_is_siro_fallback,
                       total: 0, at_or_above_action: 0, above_owner_max: 0 });
      }
      const d = depts.get(k);
      d.total += 1;
      if (atOrAbove(r.score)) d.at_or_above_action += 1;
      if (aboveOwner(r.score)) d.above_owner_max += 1;
    }

    const systems = new Map();
    for (const r of risks.filter((x) => atOrAbove(x.score))) {
      if (!systems.has(r.system_id)) {
        systems.set(r.system_id, { system_id: r.system_id, system_name: r.system_name,
                                   department_name: r.department_name, count: 0, max_score: 0 });
      }
      const s = systems.get(r.system_id);
      s.count += 1;
      s.max_score = Math.max(s.max_score, r.score);
    }

    const exposure = {
      total: risks.length,
      current:  stage((r) => r.score),
      // A risk with no committed work stays at its current score.
      target:   stage((r) => r.target_score ?? r.score),
      with_target: risks.filter((r) => r.target_score != null).length,
      by_department: [...depts.values()]
        .sort((a, b) => b.at_or_above_action - a.at_or_above_action || a.department_name.localeCompare(b.department_name)),
      top_risks: [...risks].sort(byScore).slice(0, TOP_RISKS).map(riskRow),
      // Systems carrying more than one risk at or above the action threshold:
      // one incident there could realise several of them together.
      concentration: [...systems.values()].filter((s) => s.count > 1)
        .sort((a, b) => b.count - a.count || b.max_score - a.max_score || a.system_name.localeCompare(b.system_name))
        .slice(0, TOP_SYSTEMS),
    };

    // ── Report 2: decisions ───────────────────────────────────────────────
    const needsAnswer = risks.filter((r) => atOrAbove(r.score) && !r.has_open_action && !r.has_active_exception);
    const decisions = {
      // A treatment was decided and nothing is carrying it out.
      decided_not_delivered: needsAnswer.filter((r) => r.treatment_decision && r.treatment_decision !== 'accept')
        .sort(byScore).map(riskRow),
      // Decided to accept, but no acceptance is recorded.
      accept_not_recorded: needsAnswer.filter((r) => r.treatment_decision === 'accept').sort(byScore).map(riskRow),
      // No treatment decided at all.
      no_decision: needsAnswer.filter((r) => !r.treatment_decision).sort(byScore).map(riskRow),
      above_owner_max: risks.filter((r) => aboveOwner(r.score)).sort(byScore).map(riskRow),
      acceptances: acceptances.map((e) => ({
        ...e,
        // Whether the accepter's role may accept the risk at TODAY's score. The
        // score at acceptance is not recorded, so a risk that has risen since is
        // shown against what it is now.
        within_authority_now: canAcceptRiskAtScore(e.risk_score, e.accepted_role,
          cfg.exception_accept_analyst_max, ownerMax, cfg.setup_phase_active),
        expiring_soon: e.days_until_expiry != null && e.days_until_expiry <= EXPIRING_DAYS,
      })),
      breaches,
      signoff_pending: signoffs,
    };

    res.json({
      generated_at: new Date().toISOString(),
      thresholds: {
        action: action,
        owner_max: ownerMax,
        analyst_max: cfg.exception_accept_analyst_max,
        max_exception_days: cfg.max_exception_age_days,
        expiring_days: EXPIRING_DAYS,
        config_updated_at: cfg.updated_at,
      },
      exposure,
      decisions,
    });
  } catch (err) { next(err); }
});

// GET /reports/board — the board summary (report 9): the few figures a board
// reads at a glance, and the monthly captures that draw their trend.
router.get('/board', async (req, res, next) => {
  try {
    const [board, { rows: trend }] = await Promise.all([
      computeBoard(),
      query(`SELECT period, definition_ver, captured_at, summary FROM metric_snapshots
              WHERE metric_key = 'board.headline' ORDER BY period`),
    ]);
    res.json({ ...board, trend });
  } catch (err) { next(err); }
});

// GET /reports/ciso — the CISO's reports (docs/reporting-ciso.md): what the
// business has agreed (C2), where the money goes furthest (C1), shared risk and
// joint cases (C5).
// GET /reports/unknown — where unknown risk is hiding (docs/reporting-analyst.md
// R5, the CISO's C3): one report for both roles.
router.get('/unknown', async (req, res, next) => {
  try { res.json(await computeUnknown()); } catch (err) { next(err); }
});

// GET /reports/analyst[?analyst=<user id>|team] — My work, the risk analyst's
// report (src/reports/analyst.js). A risk analyst sees their own work; the CISO
// and admin see the team (every analyst) or one analyst (decision 2).
router.get('/analyst', requireCapability('risks.write'), async (req, res, next) => {
  try {
    const { rows: analysts } = await query(
      `SELECT u.id, u.full_name FROM users u JOIN v_user_roles vr ON vr.user_id = u.id
        WHERE vr.role = 'risk_analyst' AND u.is_active GROUP BY u.id, u.full_name ORDER BY u.full_name`);
    if (req.user.role === 'risk_analyst') {
      const { rows: [me] } = await query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
      return res.json(await computeAnalyst([req.user.id], { kind: 'self', name: me?.full_name || null, can_choose: false }));
    }
    const pick = req.query.analyst;
    if (pick && pick !== 'team') {
      const one = analysts.find((a) => a.id === pick);
      if (!one) return res.status(404).json({ error: 'No such risk analyst.' });
      return res.json(await computeAnalyst([one.id], { kind: 'analyst', id: one.id, name: one.full_name, can_choose: true, analysts }));
    }
    res.json(await computeAnalyst(analysts.map((a) => a.id), { kind: 'team', name: null, can_choose: true, analysts }));
  } catch (err) { next(err); }
});

router.get('/ciso', async (req, res, next) => {
  try { res.json(await computeCiso()); } catch (err) { next(err); }
});

// PUT /reports/tolerances/:key — { green_max, amber_max, reason }; DELETE clears
// it. The SIRO's (reports.tolerances, v169): the tolerance a board figure is
// rated against. Audited with before and after.
const canSetTolerance = requireCapability('reports.tolerances');
const tileFor = (key) => TILES.find((t) => t.key === key);
const describe = (t) => (t ? `green up to ${t.green_max}, amber up to ${t.amber_max}` : 'none');

router.put('/tolerances/:key', canSetTolerance, async (req, res, next) => {
  try {
    const tile = tileFor(req.params.key);
    if (!tile) return res.status(404).json({ error: 'No board figure has that key.' });
    const { green_max, amber_max, reason } = req.body || {};
    const g = Number(green_max), a = Number(amber_max);
    if (!Number.isInteger(g) || !Number.isInteger(a) || g < 0 || a < 0) {
      return res.status(400).json({ error: 'Green and amber limits must be whole numbers, 0 or more.' });
    }
    if (g > a) return res.status(400).json({ error: 'The green limit cannot be above the amber limit: green is the better end.' });
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'Say why this tolerance was chosen.' });

    const { rows: before } = await query(`SELECT green_max::float, amber_max::float FROM metric_tolerances WHERE metric_key = $1`, [tile.key]);
    const { rows: [row] } = await query(
      `INSERT INTO metric_tolerances (metric_key, direction, green_max, amber_max, reason, set_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (metric_key) DO UPDATE SET green_max = EXCLUDED.green_max, amber_max = EXCLUDED.amber_max,
         reason = EXCLUDED.reason, set_by = EXCLUDED.set_by, set_at = now()
       RETURNING id, metric_key, direction, green_max::float AS green_max, amber_max::float AS amber_max, reason, set_at`,
      [tile.key, tile.direction, g, a, String(reason).trim(), req.user.id]);
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
       VALUES ($1, $2, 'metric_tolerances', $3, $4, $5)`,
      [req.user.id, before.length ? 'update' : 'create', row.id, tile.key,
       `Tolerance for ${tile.key}: ${describe(before[0])} → ${describe(row)}. Reason: ${row.reason}`]);
    res.json({ tolerance: row });
  } catch (err) { next(err); }
});

router.delete('/tolerances/:key', canSetTolerance, async (req, res, next) => {
  try {
    const tile = tileFor(req.params.key);
    if (!tile) return res.status(404).json({ error: 'No board figure has that key.' });
    const { rows: [gone] } = await query(
      `DELETE FROM metric_tolerances WHERE metric_key = $1
       RETURNING id, green_max::float AS green_max, amber_max::float AS amber_max`, [tile.key]);
    if (!gone) return res.status(404).json({ error: 'No tolerance is set for that figure.' });
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
       VALUES ($1, 'delete', 'metric_tolerances', $2, $3, $4)`,
      [req.user.id, gone.id, tile.key, `Tolerance for ${tile.key} cleared (was ${describe(gone)}).`]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
