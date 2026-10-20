'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const requireRole  = require('../../middleware/requireRole');
const { requireCapability, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { isDeptScoped, getUserDepartment } = require('../../auth/scoping');
const { query }    = require('../../db/pool');

const router = Router();
router.use(authenticate);

// Cross-risk queries on security_actions. Risk-scoped lifecycle endpoints
// (adopt/start/complete/verify) live in routes/risks/index.js since they
// need the risk context for permission checks.

const canRead  = requireCapability('actions.read');
const canAdopt = requireCapability('actions.adopt_queue');

// ── "Update required" — the SWG review cycle ──────────────────────────────────
// When a meeting is scheduled, every in-flight action must have its progress
// refreshed for that meeting. The benchmark is the OPEN (planned, not-yet-closed)
// meeting's `planned_at` — the moment it was scheduled. An action `needs_update`
// when it is planned/in_progress AND its progress hasn't been touched since then
// (no notes, or `updated_at` predates the scheduling). Logging progress bumps
// `updated_at` (trg_sa_upd), clearing the flag. No open meeting → nothing flags.
async function getUpdateCycle() {
  const { rows } = await query(`
    SELECT planned_at AS since,
           to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date
    FROM working_group_meetings
    WHERE planned_at IS NOT NULL AND closed_at IS NULL
    ORDER BY planned_at DESC
    LIMIT 1
  `);
  return { since: rows[0]?.since ?? null, meetingDate: rows[0]?.meeting_date ?? null };
}

// SQL boolean for `needs_update`, given the bind placeholder holding the cycle's
// `since` timestamp (null when no meeting is open → never flags).
// An in-flight action needs a progress update when no NOTE has been written
// since the benchmark date. This used to read `progress_notes` non-empty AND
// `updated_at >= since` — and `trg_sa_upd` bumps `updated_at` on ANY update, so
// accepting an action or editing its title silently cleared the flag without
// anyone logging progress (0116). The note's own timestamp cannot be gamed that
// way: it exists only because somebody wrote a note.
const needsUpdateSql = (sinceParam, sa = 'sa') => `(
  ${sa}.status IN ('planned', 'in_progress')
  AND ${sinceParam}::timestamptz IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM security_action_notes n
     WHERE n.action_id = ${sa}.id
       AND n.created_at >= ${sinceParam}::timestamptz
  )
)`;

// The most recent note, for readers that showed the old single column.
const latestNoteSql = (sa = 'sa') => `(
  SELECT n.note FROM security_action_notes n
   WHERE n.action_id = ${sa}.id ORDER BY n.created_at DESC LIMIT 1
)`;

// What an action is about (0133). A risk action's subject is its risk(s), read
// through security_action_risks as before; every other subject is named here so
// a non-risk action has something to show where the risk columns are empty.
const subjectSql = (sa = 'sa') => `
  ${sa}.subject_type, ${sa}.subject_id, ${sa}.origin,
  CASE ${sa}.subject_type
    WHEN 'system'  THEN (SELECT x.name  FROM systems x            WHERE x.id = ${sa}.subject_id)
    WHEN 'asset'   THEN (SELECT x.name  FROM information_assets x WHERE x.id = ${sa}.subject_id)
    WHEN 'service' THEN (SELECT x.name  FROM business_services x  WHERE x.id = ${sa}.subject_id)
    WHEN 'control' THEN (SELECT x.title FROM controls x           WHERE x.id = ${sa}.subject_id)
    WHEN 'component' THEN (SELECT x.name FROM control_components x WHERE x.id = ${sa}.subject_id)
    WHEN 'supplier_relationship' THEN (
      SELECT sp.name || ' — ' || COALESCE(sy.name, cc.name)
        FROM supplier_relationships x JOIN suppliers sp ON sp.id = x.supplier_id
        LEFT JOIN systems sy ON sy.id = x.system_id
        LEFT JOIN control_components cc ON cc.id = x.component_id
       WHERE x.id = ${sa}.subject_id)
  END AS subject_name,
  -- A relationship is shown on its supplier's page, so the link needs the supplier.
  CASE WHEN ${sa}.subject_type = 'supplier_relationship'
       THEN (SELECT x.supplier_id FROM supplier_relationships x WHERE x.id = ${sa}.subject_id) END AS subject_parent_id`;

// Department scoping for a dept-scoped reader, through the action's risks OR its
// subject (v_security_action_departments). Every read here used to reach the
// department only through action → risk → system, which an action about an
// asset or a control cannot satisfy — so it was dropped, or 403'd.
const inDepartmentSql = (deptParam, sa = 'sa') => `EXISTS (
  SELECT 1 FROM v_security_action_departments vd
   WHERE vd.action_id = ${sa}.id
     AND (vd.department_id = ${deptParam} OR vd.org_wide)
)`;

// ── GET /actions/acceptance-queue ─────────────────────────────────────────────
// Every PROPOSED (not-yet-accepted) action across all active risks, for CISO
// review at the SWG. Replaces the old adoption queue: acceptance is now what
// freezes an action (items/owners/targets) and snapshots the risk baseline, so
// the queue summarises the ITEMS the CISO is being asked to commit to rather
// than a per-action target_residual_* block.
//
// One row per (action × risk) so the caller can group by risk_id. The action's
// forecast target is derived as the MIN over its control items' targets — the
// same MIN-over-deployed shape the risk itself uses once the items complete.
// Ordered by risk severity (critical first) then action created_at ASC.

router.get('/acceptance-queue', canAdopt, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        sa.id              AS action_id,
        sa.title           AS action_title,
        sa.description     AS action_description,
        sa.target_date,
        sa.created_at,
        ${subjectSql()},
        u.full_name        AS owner_name,
        r.id               AS risk_id,
        r.probability_c    AS current_p_c,
        r.probability_i    AS current_p_i,
        r.probability_a    AS current_p_a,
        -- Impact is the system's derived C/I/A (v90). NOT r.risk_*, which is
        -- already probability x impact (1-25) and squares the probability here.
        COALESCE(s.impact_c, 1) AS current_imp_c,
        COALESCE(s.impact_i, 1) AS current_imp_i,
        COALESCE(s.impact_a, 1) AS current_imp_a,
        t.name             AS threat_name,
        s.id               AS system_id,
        s.name             AS system_name,
        d.name             AS department_name,
        it.item_count, it.control_count, it.component_count, it.system_count,
        it.target_p_c, it.target_p_i, it.target_p_a
      FROM security_actions sa
      -- LEFT, not inner: an action about something other than a risk has no
      -- row here and must still reach the queue. A risk action whose risks
      -- have all been retired stays out, as before.
      LEFT JOIN (security_action_risks sar
                 JOIN risks   r ON r.id  = sar.risk_id AND r.is_active = TRUE
                 JOIN systems s ON s.id  = r.system_id
                 JOIN threats t ON t.id  = r.threat_id)
             ON sar.action_id = sa.id
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN users u ON u.id = sa.primary_owner_user_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)                                                   AS item_count,
               COUNT(*) FILTER (WHERE sai.element_type = 'control')       AS control_count,
               COUNT(*) FILTER (WHERE sai.element_type = 'component')     AS component_count,
               COUNT(DISTINCT sai.system_id)                              AS system_count,
               MIN(sai.target_p_c) AS target_p_c,
               MIN(sai.target_p_i) AS target_p_i,
               MIN(sai.target_p_a) AS target_p_a
          FROM security_action_items sai
         WHERE sai.action_id = sa.id
      ) it ON TRUE
      WHERE sa.status = 'proposed'
        AND (sa.subject_type <> 'risk' OR r.id IS NOT NULL)
      ORDER BY r.risk_score DESC NULLS LAST, sa.created_at ASC
    `);

    res.json({ count: rows.length, actions: rows });
  } catch (err) { next(err); }
});

// ── GET /actions/stats ────────────────────────────────────────────────────────
// Headline counts for the Security Action Plan dashboard widget. Item-based:
// under the gap-driven model an action is a container that drains item by item,
// so "how much remediation is outstanding" is an ITEM count, not an action one.
// The old verification framing (awaiting_verification / verified / rejected) is
// gone with the verify step — completion of the last item completes the action.
//
// Dept-scoped for IAM/IAO (matching every other cross-risk read here).

router.get('/stats', canRead, async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;
    let deptFilter = null;
    if (isDepartmentIsolationEnabled() && ['information_asset_manager', 'information_asset_owner'].includes(role)) {
      const { rows: u } = await query('SELECT department_id FROM users WHERE id = $1', [userId]);
      deptFilter = u[0]?.department_id || null;
    }

    const params = [];
    let deptClause = '';
    if (deptFilter) {
      params.push(deptFilter);
      deptClause = `AND vd.department_id = $${params.length}`;
    }

    // Actions in scope, de-duplicated: an action can sit on several risks.
    // Reached through the risks OR the subject, so an action that is not about
    // a risk is counted (0133). The department figure stays strict — the
    // caller's own department, not org-wide rows — as it always was.
    const scoped = `
      SELECT DISTINCT sa.id, sa.status, sa.target_date, sa.completed_at
        FROM security_actions sa
        JOIN v_security_action_departments vd ON vd.action_id = sa.id
       WHERE 1=1 ${deptClause}
    `;

    const { rows } = await query(`
      WITH scoped AS (${scoped})
      SELECT
        (SELECT COUNT(*) FROM scoped WHERE status = 'proposed')            AS awaiting_acceptance,
        (SELECT COUNT(*) FROM scoped WHERE status IN ('planned','in_progress')) AS in_progress,
        (SELECT COUNT(*) FROM scoped
          WHERE target_date < CURRENT_DATE
            AND status NOT IN ${NOT_OVERDUE})                              AS overdue,
        (SELECT COUNT(*) FROM security_action_items sai
           JOIN scoped sc ON sc.id = sai.action_id
          WHERE sc.status IN ('planned','in_progress')
            AND sai.status NOT IN ('completed', 'withdrawn'))              AS open_items,
        (SELECT COUNT(*) FROM security_action_items sai
           JOIN scoped sc ON sc.id = sai.action_id
          WHERE sai.status = 'completed'
            AND sai.completed_at > now() - interval '30 days')             AS items_completed_recent
    `, params);

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── GET /actions/my-inprogress ────────────────────────────────────────────────
// In-flight actions (planned/in_progress) owned by the calling user.
// Includes a `needs_update` flag: true when progress_notes is null OR when
// the action's updated_at is before the most recent meeting date.
router.get('/my-inprogress', requireRole(
  'ciso', 'risk_analyst', 'admin', 'siro',
  'information_asset_manager', 'information_asset_owner', 'security_consultant', 'meeting_secretary',
  'security_architect'
), async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const cycle = await getUpdateCycle();

    const { rows } = await query(`
      SELECT
        sa.id, sa.title, sa.status, sa.treatment_type,
        ${latestNoteSql()} AS progress_notes, sa.updated_at, sa.target_date,
        sa.description,
        ${subjectSql()},
        t.name   AS threat_name,
        s.name   AS system_name,
        r.id     AS risk_id,
        ${needsUpdateSql('$2')} AS needs_update
      FROM security_actions sa
      LEFT JOIN (security_action_risks sar
                 JOIN risks   r ON r.id  = sar.risk_id AND r.is_active = TRUE
                 JOIN systems s ON s.id  = r.system_id
                 JOIN threats t ON t.id  = r.threat_id)
             ON sar.action_id = sa.id
      WHERE sa.primary_owner_user_id = $1
        AND sa.status IN ('planned', 'in_progress')
        AND (sa.subject_type <> 'risk' OR r.id IS NOT NULL)
      ORDER BY sa.status DESC, sa.target_date ASC NULLS LAST
    `, [userId, cycle.since]);

    res.json({
      count: rows.length,
      needs_update_count: rows.filter(r => r.needs_update).length,
      last_meeting_date: cycle.meetingDate,
      actions: rows,
    });
  } catch (err) { next(err); }
});


// ── GET /actions/org-inprogress ───────────────────────────────────────────────
// All in-flight (planned/in_progress) actions org-wide.
// Used by meeting_secretary to track progress and chase owners before a meeting.
router.get('/org-inprogress', requireCapability('actions.org_view'), async (req, res, next) => {
  try {
    const cycle = await getUpdateCycle();

    const { rows } = await query(`
      SELECT
        sa.id, sa.title, sa.status, sa.treatment_type,
        ${latestNoteSql()} AS progress_notes, sa.updated_at, sa.target_date,
        u.full_name  AS owner_name,
        u.email      AS owner_email,
        ${subjectSql()},
        t.name       AS threat_name,
        s.name       AS system_name,
        r.id         AS risk_id,
        ${needsUpdateSql('$1')} AS needs_update
      FROM security_actions sa
      LEFT JOIN users u                 ON u.id  = sa.primary_owner_user_id
      LEFT JOIN (security_action_risks sar
                 JOIN risks   r ON r.id  = sar.risk_id AND r.is_active = TRUE
                 JOIN systems s ON s.id  = r.system_id
                 JOIN threats t ON t.id  = r.threat_id)
             ON sar.action_id = sa.id
      WHERE sa.status IN ('planned', 'in_progress')
        AND (sa.subject_type <> 'risk' OR r.id IS NOT NULL)
      ORDER BY sa.status DESC, sa.target_date ASC NULLS LAST, sa.title
    `, [cycle.since]);

    res.json({
      count: rows.length,
      needs_update_count: rows.filter(r => r.needs_update).length,
      last_meeting_date: cycle.meetingDate,
      actions: rows,
    });
  } catch (err) { next(err); }
});


// ── PATCH /actions/:id/progress ───────────────────────────────────────────────
// Append a progress note. Callable by the action owner, CISO, risk_analyst, admin.
// Body: { progress_notes: string, item_id?: uuid }
//
// This was an in-place UPDATE of a single column, so each note erased the last
// and none recorded who wrote it. It now APPENDS to security_action_notes
// (0116). `item_id` files the note against one remediation item — the SWG asks
// about the work on a particular control, not the container — and is omitted for
// a note about the action as a whole, which is what the old column meant.
//
// The endpoint keeps its name and its `progress_notes` body field so existing
// callers are unaffected; it returns the action with its LATEST note, as before.
router.patch('/:id/progress', requireCapability('actions.progress'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const { progress_notes, item_id } = req.body;

    const note = typeof progress_notes === 'string' ? progress_notes.trim() : '';
    if (!note) {
      return res.status(400).json({ error: 'progress_notes is required and cannot be blank.' });
    }

    const actionRes = await query(
      `SELECT id, status, primary_owner_user_id FROM security_actions WHERE id = $1`,
      [id]
    );
    if (!actionRes.rows.length) return res.status(404).json({ error: 'Action not found.' });

    const action = actionRes.rows[0];
    const isOwner = action.primary_owner_user_id === userId;
    const isPrivileged = ['ciso', 'risk_analyst', 'admin'].includes(role);

    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ error: 'Only the action owner or a CISO/analyst/admin can log progress.' });
    }

    if (['cancelled', 'verified'].includes(action.status)) {
      return res.status(409).json({ error: `Cannot log progress on a ${action.status} action.` });
    }

    // A note on an item of a DIFFERENT action is refused by the composite FK;
    // catching it here turns a 500 into the 400 it actually is.
    if (item_id) {
      const { rows: owned } = await query(
        `SELECT 1 FROM security_action_items WHERE id = $1 AND action_id = $2`, [item_id, id]);
      if (!owned.length) {
        return res.status(400).json({ error: 'That item does not belong to this action.' });
      }
    }

    const { rows: inserted } = await query(
      `INSERT INTO security_action_notes (action_id, item_id, author_user_id, note)
       VALUES ($1, $2, $3, $4)
       RETURNING id, item_id, note, created_at`,
      [id, item_id || null, userId, note]
    );

    const { rows: after } = await query(
      `SELECT sa.id, sa.title, sa.status, ${latestNoteSql()} AS progress_notes, sa.updated_at
         FROM security_actions sa WHERE sa.id = $1`, [id]);

    res.json({ action: after[0], note: inserted[0] });
  } catch (err) { next(err); }
});

// ── POST /actions/:id/accept ──────────────────────────────────────────────────
// Accept an action that is NOT about a risk (v133/v134): proposed → planned,
// stamping who accepted it. The same governance act, and the same capability, as
// POST /risks/:id/actions/:aid/accept — that route stays the way to accept a risk
// action, because it also snapshots each risk's baseline, which has no meaning
// for an action about an asset. Such an action has no items to freeze.
router.post('/:id/accept', requireCapability('actions.adopt'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT status, subject_type FROM security_actions WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Action not found.' });
    if (rows[0].subject_type === 'risk') {
      return res.status(409).json({ error: 'A risk action is accepted on its risk, which records the risk baseline.' });
    }
    if (rows[0].status !== 'proposed') {
      return res.status(409).json({ error: 'Only a proposed action can be accepted.' });
    }
    await query(
      `UPDATE security_actions SET status = 'planned', accepted_at = now(), accepted_by = $2
        WHERE id = $1 AND status = 'proposed'`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /actions/:id/complete ────────────────────────────────────────────────
// Complete an action that is not about a risk. A risk action completes item by
// item on its risk; this one has no items, so it completes as a whole — once
// accepted, by its owner, the CISO, a risk analyst or an admin (the gate items
// use, with the action owner in place of the system owner).
//
// Done means fixed: the database refuses to complete an action whose finding
// still holds (trg_sa_finding_resolved_before_complete, v134), and this turns
// that refusal into a 409 naming what is still missing.
router.post('/:id/complete', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT status, subject_type, primary_owner_user_id FROM security_actions WHERE id = $1`,
      [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Action not found.' });
    const a = rows[0];
    const allowed = ['ciso', 'risk_analyst', 'admin'].includes(req.user.role)
      || req.user.id === a.primary_owner_user_id;
    if (!allowed) {
      return res.status(403).json({ error: 'Only the action owner, the CISO, a risk analyst or an admin can complete this action.' });
    }
    if (a.subject_type === 'risk') {
      return res.status(409).json({ error: 'A risk action completes as its items complete, on its risk.' });
    }
    if (!['planned', 'in_progress'].includes(a.status)) {
      return res.status(409).json({ error: 'The action must be accepted, and not yet finished, to be completed.' });
    }
    try {
      await query(
        `UPDATE security_actions SET status = 'completed', completed_at = now(), completed_by = $2
          WHERE id = $1`, [req.params.id, req.user.id]);
    } catch (err) {
      if (err.code === '23514' && err.hint === 'finding_unresolved') {
        return res.status(409).json({ error: `Not yet fixed — ${err.message}.` });
      }
      throw err;
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /actions ──────────────────────────────────────────────────────────────
// Scoped security-actions list (replaces the CISO-only GET /governance/sap/actions
// for the list page). LEFT JOINs the plan so PROPOSED actions (plan_id NULL) appear.
//
// RACI read-scope: global roles see all; dept-scoped roles (IAO/IAM) see only
// actions sitting on a risk whose owning system is in their department or shared.
//
// Optional ?status= filter mirrors the old governance endpoint (+ overdue).

// Gap-driven lifecycle: proposed → planned (CISO-accepted) → in_progress (first
// item done) → completed (every item done). 'verified'/'rejected' retired with
// the verify step — the last item's completion is what finishes an action.
const LIST_STATUSES = new Set([
  'proposed', 'planned', 'in_progress', 'completed', 'deferred', 'cancelled',
]);
const NOT_OVERDUE = `('completed','cancelled')`;
// "Archived" = terminal states that no longer need acting on. Hidden from the
// default ("active") list to cut clutter; surfaced via ?status=archived (and still
// in ?status=all) for audit/lookup. 'completed' IS archived now: with verification
// gone it is the end of the line, not a staging post.
const ARCHIVED_STATUSES = `('completed','cancelled')`;

router.get('/', canRead, async (req, res, next) => {
  const { status } = req.query;
  const VIRTUAL = new Set(['overdue', 'archived', 'all']);
  if (status && !VIRTUAL.has(status) && !LIST_STATUSES.has(status)) {
    return res.status(400).json({ error: `Invalid status filter: ${status}` });
  }

  try {
    const { id: userId, role } = req.user;
    const cycle = await getUpdateCycle();
    const params = [cycle.since];   // $1 — "update required" benchmark (see needsUpdateSql)
    const where  = [];

    if (status === 'overdue') {
      where.push(`sa.target_date < CURRENT_DATE AND sa.status NOT IN ${NOT_OVERDUE}`);
    } else if (status === 'archived') {
      where.push(`sa.status IN ${ARCHIVED_STATUSES}`);
    } else if (status === 'all') {
      // no status constraint — every state, including archived (audit view)
    } else if (status) {
      params.push(status);
      where.push(`sa.status = $${params.length}`);
    } else {
      // default ("active") view: hide terminal/archived actions that no longer
      // need acting on. They remain reachable via ?status=archived or all.
      where.push(`sa.status NOT IN ${ARCHIVED_STATUSES}`);
    }

    // ?mine=1 — only actions this user owns (the "My in-progress actions" drill-in).
    if (req.query.mine === '1' || req.query.mine === 'true') {
      params.push(userId);
      where.push(`sa.primary_owner_user_id = $${params.length}`);
    }

    // RACI dept read-scope for IAO/IAM (no-op for global roles / isolation off).
    if (isDepartmentIsolationEnabled() && isDeptScoped(role)) {
      const myDept = await getUserDepartment(userId);
      params.push(myDept);
      where.push(inDepartmentSql(`$${params.length}`));
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await query(`
      SELECT
        sa.id, sa.title, sa.description, sa.status,
        sa.target_date, sa.completed_at, sa.accepted_at,
        ${subjectSql()},
        u.full_name AS owner_name,
        sap.title   AS plan_title,
        (SELECT COUNT(*) FROM security_action_items sai WHERE sai.action_id = sa.id) AS item_count,
        (SELECT COUNT(*) FROM security_action_items sai
          WHERE sai.action_id = sa.id AND sai.status = 'completed')                  AS items_done,
        (sa.target_date < CURRENT_DATE AND sa.status NOT IN ${NOT_OVERDUE}) AS is_overdue,
        ${needsUpdateSql('$1')} AS needs_update,
        fr.risk_id, fr.threat_name, fr.system_name, fr.department_name,
        fr.current_p_c, fr.current_p_i, fr.current_p_a,
        fr.current_imp_c, fr.current_imp_i, fr.current_imp_a,
        (SELECT COUNT(*) FROM security_action_risks sarc
            JOIN risks rc ON rc.id = sarc.risk_id AND rc.is_active = TRUE
           WHERE sarc.action_id = sa.id) AS risk_count
      FROM security_actions sa
      LEFT JOIN security_action_plans sap ON sap.id = sa.plan_id
      JOIN users u ON u.id = sa.primary_owner_user_id
      LEFT JOIN LATERAL (
        SELECT r.id AS risk_id, t.name AS threat_name, s.name AS system_name,
               d.name AS department_name,
               r.probability_c AS current_p_c, r.probability_i AS current_p_i, r.probability_a AS current_p_a,
               -- Impact is the system's derived C/I/A (v90). NOT r.risk_*, which is
               -- already probability x impact (1-25) and squares the probability here.
               COALESCE(s.impact_c, 1) AS current_imp_c,
               COALESCE(s.impact_i, 1) AS current_imp_i,
               COALESCE(s.impact_a, 1) AS current_imp_a
        FROM security_action_risks sar
        JOIN risks   r ON r.id = sar.risk_id AND r.is_active = TRUE
        JOIN threats t ON t.id = r.threat_id
        JOIN systems s ON s.id = r.system_id
        LEFT JOIN departments d ON d.id = s.department_id
        WHERE sar.action_id = sa.id
        ORDER BY r.risk_score DESC NULLS LAST, sar.created_at
        LIMIT 1
      ) fr ON TRUE
      ${whereClause}
      ORDER BY
        (sa.target_date < CURRENT_DATE AND sa.status NOT IN ${NOT_OVERDUE}) DESC,
        sa.target_date ASC NULLS LAST,
        sa.created_at DESC
    `, params);

    res.json({ actions: rows, update_required_meeting_date: cycle.meetingDate });
  } catch (err) { next(err); }
});

// ── GET /actions/:id ──────────────────────────────────────────────────────────
// ── GET /actions/roll-up ─────────────────────────────────────────────────────
// Org-wide roll-up of OPEN action items grouped by the element and its library
// owner (docs/security-actions.md, decision #2 — the derived cross-system view
// for Responsible owners). Each control / component shows the systems where it
// still needs work.
//
// `?mine=1` scopes to the controls the caller owns, plus any item on which the
// caller is the named Responsible. It used to add "my department's components",
// which no longer exists: the component catalogue has no owning department
// (docs/component-ownership.md), so a component reaches "mine" through the item
// owner instead — the person actually doing the work, which is what the list is
// for. Only items on ACCEPTED (planned/in_progress) actions that are not yet
// completed. Defined before GET /:id so it isn't shadowed.
router.get('/roll-up', canRead, async (req, res, next) => {
  try {
    const params = [];
    let mineClause = '';
    if (req.query.mine === '1') {
      params.push(req.user.id);
      mineClause = `AND (c.owner_user_id = $1 OR sai.owner_user_id = $1)`;
    }
    const { rows } = await query(`
      SELECT sai.id AS item_id, sai.element_type, sai.change_kind, sai.status,
             sai.action_id, sa.title AS action_title, sa.target_date,
             (sa.target_date < CURRENT_DATE) AS is_overdue,
             sai.system_id, sys.name AS system_name,
             sai.owner_user_id AS item_owner_id, iow.full_name AS item_owner_name,
             sai.control_id, c.title AS control_title,
             c.owner_user_id AS control_owner_id, cow.full_name AS control_owner_name,
             (SELECT sc2.ref_code FROM control_mappings cm
                JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
                JOIN standards s2 ON s2.id = sc2.standard_id
               WHERE cm.control_id = sai.control_id
               ORDER BY s2.sort_index, sc2.sort_index LIMIT 1) AS framework_ref,
             sai.component_id, cc.name AS component_name, cc.component_type
        FROM security_action_items sai
        JOIN security_actions sa ON sa.id = sai.action_id
        JOIN systems sys ON sys.id = sai.system_id
        LEFT JOIN users iow ON iow.id = sai.owner_user_id
        LEFT JOIN controls c ON c.id = sai.control_id
        LEFT JOIN users cow ON cow.id = c.owner_user_id
        LEFT JOIN control_components cc ON cc.id = sai.component_id
       WHERE sa.status IN ('planned','in_progress')
         AND sai.status NOT IN ('completed', 'withdrawn')
         ${mineClause}
       ORDER BY sys.name
    `, params);

    const controls = new Map();
    const components = new Map();
    for (const r of rows) {
      const work = {
        item_id: r.item_id, action_id: r.action_id, change_kind: r.change_kind,
        // The action the item belongs to, so the roll-up can open it: each line
        // used to be a dead end, though every item has an action detail page.
        action_title: r.action_title, target_date: r.target_date, is_overdue: r.is_overdue,
        status: r.status, system_id: r.system_id, system_name: r.system_name,
        item_owner: r.item_owner_id ? { user_id: r.item_owner_id, name: r.item_owner_name } : null,
      };
      if (r.element_type === 'control') {
        if (!controls.has(r.control_id)) controls.set(r.control_id, {
          control_id: r.control_id, title: r.control_title, framework_ref: r.framework_ref,
          library_owner: r.control_owner_id ? { user_id: r.control_owner_id, name: r.control_owner_name } : null,
          systems: [],
        });
        controls.get(r.control_id).systems.push(work);
      } else {
        if (!components.has(r.component_id)) components.set(r.component_id, {
          component_id: r.component_id, name: r.component_name, component_type: r.component_type,
          library_owner: null,   // the catalogue has no owner — see the note above

          systems: [],
        });
        components.get(r.component_id).systems.push(work);
      }
    }
    const ctlOut = [...controls.values()].map(x => ({ ...x, systems_count: x.systems.length }));
    const cmpOut = [...components.values()].map(x => ({ ...x, systems_count: x.systems.length }));
    res.json({
      controls: ctlOut,
      components: cmpOut,
      summary: {
        controls: ctlOut.length, components: cmpOut.length,
        open_items: rows.length,
      },
    });
  } catch (err) { next(err); }
});

// Full detail for one security action — base + lifecycle fields, linked risks
// (with click-through ids), controls and components. Replaces the CISO-only
// GET /governance/sap/actions/:id. LEFT JOINs the plan so proposed actions load.
//
// RACI read-gate: dept-scoped roles may only open an action that sits on a risk
// in their department or on a shared system (same shape as GET /risks/:id).
// Defined LAST so it does not shadow the static routes above.

router.get('/:id', canRead, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const cycle = await getUpdateCycle();

    const { rows } = await query(`
      SELECT
        sa.id, sa.title, sa.description, sa.status,
        sa.target_date, sa.completed_at, sa.completed_by,
        sa.accepted_at, sa.accepted_by,
        ${subjectSql()},
        ${latestNoteSql()} AS progress_notes, sa.requires_siro_signoff, sa.siro_signoff_at,
        sa.primary_owner_user_id AS owner_id,
        u.full_name  AS owner_name, u.email AS owner_email, u.role AS owner_role,
        cb.full_name AS completed_by_name,
        ab.full_name AS accepted_by_name,
        sap.title    AS plan_title, sap.status AS plan_status,
        (sa.target_date < CURRENT_DATE AND sa.status NOT IN ${NOT_OVERDUE}) AS is_overdue,
        ${needsUpdateSql('$2')} AS needs_update
      FROM security_actions sa
      LEFT JOIN security_action_plans sap ON sap.id = sa.plan_id
      JOIN users u  ON u.id  = sa.primary_owner_user_id
      LEFT JOIN users cb ON cb.id = sa.completed_by
      LEFT JOIN users ab ON ab.id = sa.accepted_by
      WHERE sa.id = $1
    `, [id, cycle.since]);

    if (!rows.length) return res.status(404).json({ error: 'Action not found.' });
    const action = rows[0];

    const { rows: risks } = await query(`
      SELECT r.id AS risk_id, r.risk_score,
             r.probability_c AS current_p_c, r.probability_i AS current_p_i, r.probability_a AS current_p_a,
             -- Impact is the system's derived C/I/A (v90). NOT r.risk_*, which is
             -- already probability x impact (1-25) and squares the probability here.
             COALESCE(s.impact_c, 1) AS current_imp_c,
             COALESCE(s.impact_i, 1) AS current_imp_i,
             COALESCE(s.impact_a, 1) AS current_imp_a,
             t.name AS threat_name,
             -- The ceiling a confirmed probability must sit under: a control can
             -- only reduce the chance of an attack. The completion dialog now
             -- takes ONE figure and expands it across C/I/A, so it needs this.
             t.probability_c AS inherent_c, t.probability_i AS inherent_i,
             t.probability_a AS inherent_a,
             s.id AS system_id, s.name AS system_name,
             s.department_id, s.is_shared AS system_is_shared,
             d.name AS department,
             sar.baseline_risk_c, sar.baseline_risk_i, sar.baseline_risk_a,
             sar.baseline_risk_score
        FROM security_action_risks sar
        JOIN risks   r ON r.id = sar.risk_id
        JOIN threats t ON t.id = r.threat_id
        JOIN systems s ON s.id = r.system_id
   LEFT JOIN departments d ON d.id = s.department_id
       WHERE sar.action_id = $1 AND r.is_active = TRUE
       ORDER BY r.risk_score DESC NULLS LAST
    `, [id]);

    // RACI read-gate for dept-scoped roles (no-op for global roles / isolation off).
    // Asked of the action's risks OR its subject: `risks.some(...)` alone denied
    // every action that is not about a risk, since .some() over none is false.
    if (isDepartmentIsolationEnabled() && isDeptScoped(role)) {
      const myDept = await getUserDepartment(userId);
      const { rows: vis } = await query(
        `SELECT ${inDepartmentSql('$2', 'x')} AS visible FROM (SELECT $1::uuid AS id) x`,
        [id, myDept]);
      if (!vis[0].visible) return res.status(403).json({ error: 'Forbidden.' });
    }

    // The action's remediation items — the same shape GET /risks/:id/actions
    // returns, so the detail page and the risk panel render items identically.
    const { rows: itemRows } = await query(`
      SELECT sai.id, sai.element_type, sai.change_kind, sai.status,
             sai.control_id, sai.component_id, sai.system_id,
             sai.target_p_c, sai.target_p_i, sai.target_p_a,
             sai.comment, sai.completed_at, sai.completed_by,
             sys.name AS system_name, sys.owner_user_id AS system_owner_user_id,
             c.title  AS control_title,
             (SELECT sc2.ref_code FROM control_mappings cm
                JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
                JOIN standards s2 ON s2.id = sc2.standard_id
               WHERE cm.control_id = sai.control_id
               ORDER BY s2.sort_index, sc2.sort_index LIMIT 1) AS framework_ref,
             cc.name AS component_name, cc.component_type,
             sai.owner_user_id, ow.full_name AS owner_name, ow.role AS owner_role,
             cbu.full_name AS completed_by_name, cbu.role AS completed_by_role,
             conf.probability_c AS confirmed_p_c,
             conf.probability_i AS confirmed_p_i,
             conf.probability_a AS confirmed_p_a
        FROM security_action_items sai
        JOIN systems sys ON sys.id = sai.system_id
        LEFT JOIN controls c            ON c.id  = sai.control_id
        LEFT JOIN control_components cc ON cc.id = sai.component_id
        LEFT JOIN users ow  ON ow.id  = sai.owner_user_id
        LEFT JOIN users cbu ON cbu.id = sai.completed_by
        -- The residual confirmed when this control item completed, read against
        -- the linked risk that shares the item's system (an action may span
        -- several, and the residual was written for one of them).
        LEFT JOIN LATERAL (
          SELECT rcp.probability_c, rcp.probability_i, rcp.probability_a
            FROM security_action_risks sar2
            JOIN risks r2 ON r2.id = sar2.risk_id AND r2.system_id = sai.system_id
            JOIN risk_control_probability rcp
              ON rcp.risk_id = r2.id AND rcp.control_id = sai.control_id
           WHERE sar2.action_id = sai.action_id
           LIMIT 1
        ) conf ON sai.element_type = 'control'
       WHERE sai.action_id = $1
       ORDER BY sai.element_type DESC, sai.created_at
    `, [id]);

    // The dialogue: every note on this action, action-level and per item, oldest
    // first — a narrative is read forwards.
    const { rows: noteRows } = await query(`
      SELECT n.id, n.item_id, n.note, n.created_at,
             n.author_user_id, au.full_name AS author_name, au.role AS author_role
        FROM security_action_notes n
        LEFT JOIN users au ON au.id = n.author_user_id
       WHERE n.action_id = $1
       ORDER BY n.created_at ASC
    `, [id]);

    const notes = noteRows.map(n => ({
      id: n.id,
      item_id: n.item_id,
      note: n.note,
      created_at: n.created_at,
      // A NULL author is the backfilled column, which never recorded one.
      author: n.author_user_id
        ? { user_id: n.author_user_id, name: n.author_name, role: n.author_role } : null,
    }));

    const items = itemRows.map(it => ({
      id: it.id,
      element_type: it.element_type,
      change_kind: it.change_kind,
      status: it.status,
      control_id: it.control_id,
      component_id: it.component_id,
      system: { id: it.system_id, name: it.system_name, owner_user_id: it.system_owner_user_id },
      label: it.element_type === 'control' ? it.control_title : it.component_name,
      framework_ref: it.framework_ref,
      component_type: it.component_type,
      owner: it.owner_user_id
        ? { user_id: it.owner_user_id, name: it.owner_name, role: it.owner_role } : null,
      target: it.element_type === 'control'
        ? { c: it.target_p_c, i: it.target_p_i, a: it.target_p_a } : null,
      confirmed: it.confirmed_p_c != null
        ? { c: it.confirmed_p_c, i: it.confirmed_p_i, a: it.confirmed_p_a } : null,
      comment: it.comment,
      completed_by: it.completed_by
        ? { user_id: it.completed_by, name: it.completed_by_name, role: it.completed_by_role } : null,
      completed_at: it.completed_at,
      notes: notes.filter(n => n.item_id === it.id),
    }));

    res.json({
      ...action,
      risks,
      items,
      items_done: items.filter(i => i.status === 'completed').length,
      // Action-level notes only; per-item ones are attached to their item above.
      notes: notes.filter(n => !n.item_id),
      update_required_meeting_date: cycle.meetingDate,
    });
  } catch (err) { next(err); }
});

module.exports = router;
