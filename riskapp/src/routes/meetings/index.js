'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const uuidParam    = require('../../middleware/uuidParam');
const { pool, query } = require('../../db/pool');
const agenda       = require('./agendaController');
const attachCtrl   = require('./attachmentsController');
const multer       = require('multer');

const router = Router();
router.use(authenticate);

// Every id-shaped parameter on this router addresses a uuid column. Validating
// them here (router.param runs before route middleware) is what keeps the
// attachment upload's destination directory inside the uploads root — see
// middleware/uuidParam.js and hardening H-09. Literal routes declared ahead of
// their `/:id` counterparts (/swg-summary, /cycles/*, /users/*) match first and
// are unaffected.
for (const [name, guard] of uuidParam('id', 'aid', 'iid')) router.param(name, guard);

// Roles that can view meetings (full list + management pages)
const canRead = requireCapability('meetings.read');
const canReadPack = requireCapability('meetings.read_pack');
// Only meeting_secretary can write
const canWrite = requireCapability('meetings.write');
// Secretary or admin for attendee management
const canManageAttendees = requireCapability('meetings.attendees');
// Decision recording: SWG governance roles (secretary acts as scribe)
const canDecide = requireCapability('meetings.decide');

// ── GET /meetings ─────────────────────────────────────────────────────────────
// List all meetings, most recent first. Includes lifecycle state and cycle info.
router.get('/', canRead, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        m.id,
        m.meeting_date,
        m.planned_at,
        m.closed_at,
        m.minutes_issued_at,
        m.linked_cycle_id,
        rc.name                AS cycle_name,
        rc.status              AS cycle_status,
        u_chair.full_name      AS chaired_by_name,
        u_sec.full_name        AS secretary_name,
        m.quorate,
        (SELECT COUNT(*) FROM meeting_attendees ma WHERE ma.meeting_id = m.id) AS attendee_count,
        (SELECT COUNT(*) FROM meeting_agenda_items ag WHERE ag.meeting_id = m.id) AS agenda_item_count,
        CASE
          WHEN m.minutes_issued_at IS NOT NULL THEN 'minutes_issued'
          WHEN m.closed_at         IS NOT NULL THEN 'closed'
          WHEN m.planned_at        IS NOT NULL THEN 'planned'
          ELSE                                      'draft'
        END AS state
      FROM working_group_meetings m
      LEFT JOIN review_cycles rc      ON rc.id = m.linked_cycle_id
      LEFT JOIN users u_chair         ON u_chair.id = m.chaired_by
      LEFT JOIN users u_sec           ON u_sec.id   = m.secretary_user_id
      ORDER BY m.meeting_date DESC NULLS LAST, m.created_at DESC
    `);
    res.json({ count: result.rows.length, meetings: result.rows });
  } catch (err) { next(err); }
});


// ── Any-authenticated SWG visibility ──────────────────────────────────────────
// Issued minutes are the sealed, formal record, so every governance-console user
// can see them and the next meeting date — including roles without full meetings
// access. These routes are intentionally gated only by `authenticate`, and the
// static `/swg-summary` path MUST stay above the `/:id` catch-all below.

// Compact summary for the SWG dashboard widget: latest issued minutes + next meeting.
router.get('/swg-summary', async (req, res, next) => {
  try {
    const latest = await query(`
      SELECT id, to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date, minutes_issued_at
      FROM working_group_meetings
      WHERE minutes_issued_at IS NOT NULL
      ORDER BY minutes_issued_at DESC
      LIMIT 1
    `);
    const next = await query(`
      SELECT id, to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date
      FROM working_group_meetings
      WHERE closed_at IS NULL AND planned_at IS NOT NULL AND meeting_date >= CURRENT_DATE
      ORDER BY meeting_date ASC
      LIMIT 1
    `);
    res.json({
      latest_minutes: latest.rows[0] || null,
      next_meeting:   next.rows[0]   || null,
    });
  } catch (err) { next(err); }
});

// Read-only sealed minutes for any authenticated user (the widget's "latest minutes" link).
router.get('/:id/published-minutes', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT id, to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date, minutes_issued_at, minutes_body
      FROM working_group_meetings
      WHERE id = $1 AND minutes_issued_at IS NOT NULL
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No issued minutes for this meeting.' });
    res.json({ minutes: rows[0] });
  } catch (err) { next(err); }
});

// iCalendar (.ics) download — all-day event on the meeting date.
router.get('/:id/calendar.ics', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT id,
             to_char(meeting_date,     'YYYYMMDD') AS dtstart,
             to_char(meeting_date + 1, 'YYYYMMDD') AS dtend
      FROM working_group_meetings WHERE id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    const m = rows[0];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RiskApp//SWG//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:swg-${m.id}@riskapp`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${m.dtstart}`,
      `DTEND;VALUE=DATE:${m.dtend}`,
      'SUMMARY:Security Working Group meeting',
      'DESCRIPTION:Scheduled SWG meeting.',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="swg-${m.dtstart}.ics"`);
    res.send(ics);
  } catch (err) { next(err); }
});


// ── POST /meetings ────────────────────────────────────────────────────────────
// Plan a new meeting ("Plan Meeting" wizard step 1).
// Body: { meeting_date, chaired_by, linked_cycle_id?, target_duration_min? }
router.post('/', canWrite, async (req, res, next) => {
  try {
    const secretaryId = req.user.id;
    const { meeting_date, chaired_by, linked_cycle_id, target_duration_min } = req.body;

    if (!meeting_date) {
      return res.status(400).json({ error: 'meeting_date is required.' });
    }
    if (target_duration_min !== undefined && target_duration_min !== null
        && (!Number.isInteger(target_duration_min) || target_duration_min < 1)) {
      return res.status(400).json({ error: 'target_duration_min must be a positive integer.' });
    }

    // Enforce one open meeting per cycle
    if (linked_cycle_id) {
      const conflict = await query(
        `SELECT id FROM working_group_meetings
          WHERE linked_cycle_id = $1 AND closed_at IS NULL`,
        [linked_cycle_id]
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json({ error: 'An open meeting already exists for this cycle.' });
      }
    }

    // target_duration_min is optional — omit it so the column DEFAULT (90) applies.
    const cols = ['meeting_date', 'chaired_by', 'secretary_user_id', 'linked_cycle_id', 'planned_at', 'planned_by'];
    const vals = ['$1', '$2', '$3', '$4', 'now()', '$3'];
    const params = [meeting_date, chaired_by || null, secretaryId, linked_cycle_id || null];
    if (target_duration_min !== undefined && target_duration_min !== null) {
      params.push(target_duration_min);
      cols.push('target_duration_min');
      vals.push(`$${params.length}`);
    }

    const result = await query(
      `INSERT INTO working_group_meetings (${cols.join(', ')})
       VALUES (${vals.join(', ')})
       RETURNING *`,
      params
    );

    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, human_narrative)
       VALUES ($1, 'plan_meeting', 'working_group_meetings', $2, $3)`,
      [secretaryId, result.rows[0].id, `Meeting planned for ${meeting_date}`]
    );

    res.status(201).json({ meeting: result.rows[0] });
  } catch (err) { next(err); }
});


// ── Agenda routes — all static paths must come before /:id ───────────────────
// (These are sub-resource routes on /:id, but expressed at top level to avoid
//  shadowing issues with /:id — they're mounted under /meetings anyway.)

// GET  /meetings/:id/agenda
// POST /meetings/:id/agenda/generate
// POST /meetings/:id/agenda/items
// PATCH /meetings/:id/agenda/items/:iid
// DELETE /meetings/:id/agenda/items/:iid
// POST /meetings/:id/agenda/reorder

router.get('/:id/agenda',                          canReadPack, agenda.getAgenda);
router.post('/:id/agenda/generate',                canWrite,  agenda.generateAgenda);
router.post('/:id/agenda/items',                   canWrite,  agenda.addItem);
router.patch('/:id/agenda/items/:iid',             canWrite,  agenda.updateItem);
router.delete('/:id/agenda/items/:iid',            canWrite,  agenda.deleteItem);
router.post('/:id/agenda/reorder',                 canWrite,  agenda.reorderItems);
router.post('/:id/agenda/items/:iid/decision',     canDecide, agenda.recordDecision);

// ── Attachment routes ─────────────────────────────────────────────────────────
router.post('/:id/attachments', canRead, (req, res, next) => {
  attachCtrl.uploadMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds the 25 MB limit.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) return next(err);
    attachCtrl.uploadAttachment(req, res, next);
  });
});
router.get('/:id/attachments',                     canReadPack, attachCtrl.listAttachments);
router.get('/:id/attachments/:aid/download',       canReadPack, attachCtrl.downloadAttachment);
router.delete('/:id/attachments/:aid',             canRead,  attachCtrl.deleteAttachment);

// ── GET /meetings/:id/pack ────────────────────────────────────────────────────
// Personalised meeting pack: agenda items classified into three sections for
// the calling user. Stamps last_viewed_pack_at on their attendee record.
//
// Sections:
//   your_prep       — items the caller is assigned to present
//   read_in_advance — role-relevant categories not already in your_prep
//   full_agenda     — everything else

const ROLE_READ_ADVANCE_CATS = {
  ciso:          new Set(['risk_validation','action_adoption','exceptions','verification','cycle_overview','new_risks','action_progress','sap_health']),
  risk_analyst:  new Set(['new_risks','action_progress','risk_validation','action_adoption','verification','sap_health']),
  siro:          new Set(['cycle_overview','risk_validation','action_adoption','exceptions']),
  information_asset_manager: new Set(['new_risks','action_progress','exceptions']),
  information_asset_owner: new Set(['new_risks','action_progress']),
  security_consultant: new Set(['assurance']),
};

router.get('/:id/pack', canReadPack, async (req, res, next) => {
  try {
    const { id: meetingId }    = req.params;
    const { id: userId, role } = req.user;

    // Load meeting
    const mRes = await query(`
      SELECT m.*,
        rc.name AS cycle_name,
        u_chair.full_name AS chaired_by_name,
        u_sec.full_name   AS secretary_name,
        CASE
          WHEN m.minutes_issued_at IS NOT NULL THEN 'minutes_issued'
          WHEN m.closed_at         IS NOT NULL THEN 'closed'
          WHEN m.planned_at        IS NOT NULL THEN 'planned'
          ELSE 'draft'
        END AS state
      FROM working_group_meetings m
      LEFT JOIN review_cycles rc   ON rc.id = m.linked_cycle_id
      LEFT JOIN users u_chair      ON u_chair.id = m.chaired_by
      LEFT JOIN users u_sec        ON u_sec.id   = m.secretary_user_id
      WHERE m.id = $1
    `, [meetingId]);
    if (!mRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });

    // Load all agenda items (same query as getAgenda)
    const itemsRes = await query(`
      SELECT
        mai.*,
        EXISTS(
          SELECT 1 FROM meeting_attendees ma
          WHERE ma.meeting_id = mai.meeting_id
            AND ma.user_id = $2
            AND ma.presenting_agenda_item_id = mai.id
        ) AS is_presenter,
        CASE
          WHEN mai.entity_type = 'risk' THEN
            jsonb_build_object(
              'threat_name', t.name, 'system_name', s.name,
              'department',  d.name, 'risk_score',  r.risk_score
            )
          ELSE NULL
        END AS risk_data,
        CASE
          WHEN mai.entity_type = 'security_action' THEN
            jsonb_build_object('title', sa.title, 'status', sa.status)
          ELSE NULL
        END AS action_data,
        CASE
          WHEN mai.entity_type = 'risk_exception' THEN
            jsonb_build_object(
              'threat_name', et.name, 'system_name', es.name,
              'expires_at',  re.expires_at
            )
          ELSE NULL
        END AS exception_data
      FROM meeting_agenda_items mai
      LEFT JOIN risks           r   ON r.id   = mai.entity_id AND mai.entity_type = 'risk'
      LEFT JOIN threats         t   ON t.id   = r.threat_id
      LEFT JOIN systems         s   ON s.id   = r.system_id
      LEFT JOIN departments     d   ON d.id   = s.department_id
      LEFT JOIN security_actions sa ON sa.id  = mai.entity_id AND mai.entity_type = 'security_action'
      LEFT JOIN exceptions  re ON re.id  = mai.entity_id AND mai.entity_type = 'risk_exception'
      LEFT JOIN risks           er  ON er.id  = re.risk_id
      LEFT JOIN threats         et  ON et.id  = er.threat_id
      LEFT JOIN systems         es  ON es.id  = er.system_id
      WHERE mai.meeting_id = $1
      ORDER BY mai.order_index
    `, [meetingId, userId]);

    const items = itemsRes.rows;
    const readCats = ROLE_READ_ADVANCE_CATS[role] ?? new Set();

    const yourPrep      = [];
    const readInAdvance = [];
    const fullAgenda    = [];

    for (const item of items) {
      if (item.is_presenter) {
        yourPrep.push(item);
      } else if (readCats.has(item.category)) {
        readInAdvance.push(item);
      } else {
        fullAgenda.push(item);
      }
    }

    // Stamp last_viewed_pack_at on the attendee record (best-effort)
    query(
      `UPDATE meeting_attendees SET last_viewed_pack_at = now()
       WHERE meeting_id = $1 AND user_id = $2`,
      [meetingId, userId]
    ).catch(() => {});

    res.json({
      meeting:          mRes.rows[0],
      your_prep:        yourPrep,
      read_in_advance:  readInAdvance,
      full_agenda:      fullAgenda,
    });
  } catch (err) { next(err); }
});



// ── GET /meetings/cycles/available ────────────────────────────────────────────
// Cycles that can be linked: status 'draft' or 'active' with no existing open
// meeting. An SWG meeting reviews the *active* (in-progress) cycle — issuing its
// minutes freezes the cycle to 'under_review' (active → under_review, mirroring
// freeze_review_cycle). 'draft' is included for a cycle planned before activation.
// (under_review/completed/archived are past the review point — not linkable.)
// Used to populate the cycle picker in the Plan Meeting wizard.
// MUST be declared before /:id to prevent 'cycles' matching as an id.
router.get('/cycles/available', canWrite, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT rc.id, rc.name, rc.status, rc.created_at
      FROM review_cycles rc
      WHERE rc.status IN ('draft', 'active')
        AND NOT EXISTS (
          SELECT 1 FROM working_group_meetings m
          WHERE m.linked_cycle_id = rc.id AND m.closed_at IS NULL
        )
      ORDER BY rc.created_at DESC
    `);
    res.json({ cycles: result.rows });
  } catch (err) { next(err); }
});


// ── GET /meetings/users/available ─────────────────────────────────────────────
// All active system users — for the attendee picker.
// MUST be declared before /:id to prevent 'users' matching as an id.
router.get('/users/available', canManageAttendees, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.full_name, u.email, u.role, d.name AS department_name
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.is_active = TRUE
      ORDER BY u.full_name
    `);
    res.json({ users: result.rows });
  } catch (err) { next(err); }
});


// ── GET /meetings/:id ─────────────────────────────────────────────────────────
// Full meeting detail: metadata + attendees + agenda item count.
router.get('/:id', canReadPack, async (req, res, next) => {
  try {
    const { id } = req.params;

    const meetingRes = await query(`
      SELECT
        m.*,
        rc.name                AS cycle_name,
        rc.status              AS cycle_status,
        u_chair.full_name      AS chaired_by_name,
        u_sec.full_name        AS secretary_name,
        CASE
          WHEN m.minutes_issued_at IS NOT NULL THEN 'minutes_issued'
          WHEN m.closed_at         IS NOT NULL THEN 'closed'
          WHEN m.planned_at        IS NOT NULL THEN 'planned'
          ELSE                                      'draft'
        END AS state
      FROM working_group_meetings m
      LEFT JOIN review_cycles rc ON rc.id = m.linked_cycle_id
      LEFT JOIN users u_chair    ON u_chair.id = m.chaired_by
      LEFT JOIN users u_sec      ON u_sec.id   = m.secretary_user_id
      WHERE m.id = $1
    `, [id]);

    if (!meetingRes.rows.length) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }

    const attendeesRes = await query(`
      SELECT
        ma.id,
        ma.user_id,
        ma.named_name,
        ma.role_at_meeting,
        ma.present,
        ma.last_viewed_pack_at,
        ma.presenting_agenda_item_id,
        mai.title              AS presenting_item_title,
        u.full_name            AS user_full_name,
        u.email                AS user_email,
        u.role                 AS user_role,
        d.name                 AS department_name
      FROM meeting_attendees ma
      LEFT JOIN users u                 ON u.id  = ma.user_id
      LEFT JOIN departments d           ON d.id  = u.department_id
      LEFT JOIN meeting_agenda_items mai ON mai.id = ma.presenting_agenda_item_id
      WHERE ma.meeting_id = $1
      ORDER BY
        CASE ma.role_at_meeting
          WHEN 'chair'     THEN 1
          WHEN 'secretary' THEN 2
          WHEN 'presenter' THEN 3
          WHEN 'member'    THEN 4
          ELSE                  5
        END,
        COALESCE(u.full_name, ma.named_name)
    `, [id]);

    res.json({
      meeting: meetingRes.rows[0],
      attendees: attendeesRes.rows
    });
  } catch (err) { next(err); }
});


// ── POST /meetings/:id/close ──────────────────────────────────────────────────
// Secretary closes the meeting. Freezes agenda + attendees; minutes editing opens.
// Body: { quorate: boolean, quorate_notes?: string }
router.post('/:id/close', canWrite, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { quorate, quorate_notes } = req.body;

    const meetingRes = await query(
      `SELECT id, planned_at, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    const meeting = meetingRes.rows[0];
    if (!meeting.planned_at) return res.status(409).json({ error: 'Meeting has not been planned yet.' });
    if (meeting.closed_at)   return res.status(409).json({ error: 'Meeting is already closed.' });

    const result = await query(
      `UPDATE working_group_meetings
          SET closed_at = now(), closed_by = $2,
              quorate = $3, quorate_notes = $4,
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id, userId, quorate ?? null, quorate_notes || null]
    );

    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, human_narrative)
       VALUES ($1, 'close_meeting', 'working_group_meetings', $2, $3)`,
      [userId, id, `Meeting closed. Quorate: ${quorate ? 'yes' : 'no'}`]
    );

    res.json({ meeting: result.rows[0] });
  } catch (err) { next(err); }
});


// ── PATCH /meetings/:id/minutes ───────────────────────────────────────────────
// Secretary saves the minutes draft. Only while closed (not yet issued).
// Body: { minutes_body: string }
router.patch('/:id/minutes', canWrite, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { minutes_body } = req.body;

    const meetingRes = await query(
      `SELECT id, closed_at, minutes_issued_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    const meeting = meetingRes.rows[0];
    if (!meeting.closed_at)         return res.status(409).json({ error: 'Meeting must be closed before editing minutes.' });
    if (meeting.minutes_issued_at)  return res.status(409).json({ error: 'Minutes have been issued and are now sealed.' });

    const result = await query(
      `UPDATE working_group_meetings SET minutes_body = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, minutes_body ?? null]
    );
    res.json({ meeting: result.rows[0] });
  } catch (err) { next(err); }
});


// ── POST /meetings/:id/issue-minutes ──────────────────────────────────────────
// Secretary issues the minutes. Seals the meeting. Transitions linked cycle to under_review.
// minutes_body must be set.
router.post('/:id/issue-minutes', canWrite, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const meetingRes = await query(
      `SELECT id, closed_at, minutes_issued_at, minutes_body, linked_cycle_id
         FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    const meeting = meetingRes.rows[0];
    if (!meeting.closed_at)          return res.status(409).json({ error: 'Meeting must be closed before issuing minutes.' });
    if (meeting.minutes_issued_at)   return res.status(409).json({ error: 'Minutes have already been issued.' });
    if (!meeting.minutes_body?.trim()) {
      return res.status(400).json({ error: 'Minutes body is empty. Write the minutes before issuing.' });
    }

    const conn = await pool.connect();
    try {
      await conn.query('BEGIN');

      const result = await conn.query(
        `UPDATE working_group_meetings
            SET minutes_issued_at = now(), minutes_issued_by = $2, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [id, userId]
      );

      if (meeting.linked_cycle_id) {
        await conn.query(
          `UPDATE review_cycles SET status = 'under_review' WHERE id = $1 AND status != 'under_review'`,
          [meeting.linked_cycle_id]
        );
      }

      await conn.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, human_narrative)
         VALUES ($1, 'issue_minutes', 'working_group_meetings', $2, $3)`,
        [userId, id, 'Minutes issued. Meeting sealed.']
      );

      await conn.query('COMMIT');
      res.json({ meeting: result.rows[0] });
    } catch (err) {
      await conn.query('ROLLBACK');
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
});


// ── PATCH /meetings/:id ───────────────────────────────────────────────────────
// Update meeting metadata (date, chair, cycle link, target duration). Only while planned state.
// Body: { meeting_date?, chaired_by?, linked_cycle_id?, target_duration_min? }
router.patch('/:id', canWrite, async (req, res, next) => {
  try {
    const { id } = req.params;

    const meetingRes = await query(
      `SELECT id, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }
    if (meetingRes.rows[0].closed_at) {
      return res.status(409).json({ error: 'Meeting is closed and cannot be edited.' });
    }

    const { meeting_date, chaired_by, linked_cycle_id, target_duration_min } = req.body;
    if (target_duration_min !== undefined && target_duration_min !== null
        && (!Number.isInteger(target_duration_min) || target_duration_min < 1)) {
      return res.status(400).json({ error: 'target_duration_min must be a positive integer.' });
    }
    const sets = [];
    const params = [];
    let p = 1;

    if (meeting_date   !== undefined) { sets.push(`meeting_date = $${p++}`);    params.push(meeting_date); }
    if (chaired_by     !== undefined) { sets.push(`chaired_by = $${p++}`);      params.push(chaired_by); }
    if (linked_cycle_id !== undefined) { sets.push(`linked_cycle_id = $${p++}`); params.push(linked_cycle_id); }
    if (target_duration_min !== undefined) { sets.push(`target_duration_min = $${p++}`); params.push(target_duration_min); }

    if (!sets.length) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    sets.push(`updated_at = now()`);
    params.push(id);

    const result = await query(
      `UPDATE working_group_meetings SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    );
    res.json({ meeting: result.rows[0] });
  } catch (err) { next(err); }
});


// ── PATCH /meetings/:id/section-timeboxes ─────────────────────────────────────
// Update section-level time budgets. Allowed until minutes are issued.
// Body: { section_timeboxes: { opening: 5, new_risks: 20, ... } }
router.patch('/:id/section-timeboxes', canWrite, async (req, res, next) => {
  try {
    const { id } = req.params;
    const meetingRes = await query(
      `SELECT id, minutes_issued_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }
    if (meetingRes.rows[0].minutes_issued_at) {
      return res.status(409).json({ error: 'Minutes have been issued and cannot be edited.' });
    }

    const { section_timeboxes } = req.body;
    if (!section_timeboxes || typeof section_timeboxes !== 'object' || Array.isArray(section_timeboxes)) {
      return res.status(400).json({ error: 'section_timeboxes must be an object.' });
    }

    const result = await query(
      `UPDATE working_group_meetings SET section_timeboxes = $1, updated_at = now() WHERE id = $2 RETURNING section_timeboxes`,
      [JSON.stringify(section_timeboxes), id]
    );
    res.json({ section_timeboxes: result.rows[0].section_timeboxes });
  } catch (err) { next(err); }
});


// ── POST /meetings/:id/attendees ──────────────────────────────────────────────
// Add an attendee (system user or named external).
// Body: { user_id?, named_name?, role_at_meeting? }
router.post('/:id/attendees', canManageAttendees, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_id, named_name, role_at_meeting = 'member' } = req.body;

    if (!user_id && !named_name) {
      return res.status(400).json({ error: 'Either user_id or named_name is required.' });
    }
    if (user_id && named_name) {
      return res.status(400).json({ error: 'Provide either user_id or named_name, not both.' });
    }

    const meetingRes = await query(
      `SELECT id, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }
    if (meetingRes.rows[0].closed_at) {
      return res.status(409).json({ error: 'Meeting is closed — attendee list is frozen.' });
    }

    // Prevent duplicate system-user entries
    if (user_id) {
      const dup = await query(
        `SELECT id FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2`,
        [id, user_id]
      );
      if (dup.rows.length) {
        return res.status(409).json({ error: 'User is already an attendee.' });
      }
    }

    const result = await query(
      `INSERT INTO meeting_attendees (meeting_id, user_id, named_name, role_at_meeting)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, user_id || null, named_name || null, role_at_meeting]
    );
    res.status(201).json({ attendee: result.rows[0] });
  } catch (err) { next(err); }
});


// ── DELETE /meetings/:id/attendees/:aid ───────────────────────────────────────
router.delete('/:id/attendees/:aid', canManageAttendees, async (req, res, next) => {
  try {
    const { id, aid } = req.params;

    const meetingRes = await query(
      `SELECT id, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    if (meetingRes.rows[0].closed_at) {
      return res.status(409).json({ error: 'Meeting is closed — attendee list is frozen.' });
    }

    const del = await query(
      `DELETE FROM meeting_attendees WHERE id = $1 AND meeting_id = $2 RETURNING id`,
      [aid, id]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Attendee not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});


// ── PATCH /meetings/:id/attendees/:aid ────────────────────────────────────────
// Update role_at_meeting or present flag.
router.patch('/:id/attendees/:aid', canManageAttendees, async (req, res, next) => {
  try {
    const { id, aid } = req.params;
    const { role_at_meeting, present, presenting_agenda_item_id } = req.body;

    const meetingRes = await query(
      `SELECT id, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    if (meetingRes.rows[0].closed_at) {
      return res.status(409).json({ error: 'Meeting is closed.' });
    }

    const sets = [];
    const params = [];
    let p = 1;
    if (role_at_meeting !== undefined) { sets.push(`role_at_meeting = $${p++}`); params.push(role_at_meeting); }
    if (present        !== undefined) { sets.push(`present = $${p++}`);          params.push(present); }
    if (presenting_agenda_item_id !== undefined) {
      sets.push(`presenting_agenda_item_id = $${p++}`);
      params.push(presenting_agenda_item_id || null);
    }

    if (!sets.length) return res.status(400).json({ error: 'No fields to update.' });
    params.push(aid);
    params.push(id);

    const result = await query(
      `UPDATE meeting_attendees SET ${sets.join(', ')} WHERE id = $${p} AND meeting_id = $${p+1} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Attendee not found.' });
    res.json({ attendee: result.rows[0] });
  } catch (err) { next(err); }
});


module.exports = router;
