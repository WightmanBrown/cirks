'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { pool, query } = require('../../db/pool');
const { can } = require('../../auth/permissions');

// Category order determines the meeting flow. 1000-spaced so entity items
// within a category (e.g. one item per risk) never bleed into the next category.
const CATEGORY_BASE = {
  opening:          1000,
  previous_minutes: 2000,
  change_briefing:  3000,
  cycle_overview:   4000,
  isms_objectives:  5000,
  // Identified exposures the group has not yet assessed. Sits immediately
  // before new_risks so the agenda follows the order the work flows:
  // identified → assessed → validated.
  threat_identification: 5500,
  new_risks:        6000,
  action_progress:  7000,
  sap_health:       8000,
  assurance:        9000,
  risk_validation:  10000,
  action_adoption:  11000,
  exceptions:       12000,
  verification:     13000,
  aob:              14000,
  close:            15000,
};

// Default per-section time budget (minutes), applied at agenda generation so the
// secretary starts with a sensible split rather than a blank grid. Sums to 90 —
// the working_group_meetings.target_duration_min default (v80). Soft: the UI
// warns when the allocated total exceeds the target, it never blocks. Existing
// (secretary-edited) section values are preserved on regeneration.
const DEFAULT_SECTION_TIMEBOXES = {
  opening:          5,
  previous_minutes: 5,
  change_briefing:  10,
  cycle_overview:   5,
  isms_objectives:  5,
  new_risks:        5,
  action_progress:  10,
  sap_health:       5,
  assurance:        5,
  risk_validation:  10,
  action_adoption:  5,
  exceptions:       5,
  verification:     5,
  aob:              3,
  close:            2,
};

// ── GET /meetings/:id/agenda ──────────────────────────────────────────────────
// All agenda items for a meeting with rich entity data. Visible to all attendees
// (and global roles: ciso, siro, risk_analyst).
async function getAgenda(req, res, next) {
  try {
    const { id } = req.params;

    const meetingCheck = await query(
      `SELECT id, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingCheck.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    const closedAt = meetingCheck.rows[0].closed_at;

    // Items with joined entity display data
    const result = await query(`
      SELECT
        ai.id,
        ai.meeting_id,
        ai.source,
        ai.category,
        ai.entity_type,
        ai.entity_id,
        ai.title,
        ai.notes,
        ai.suggested_timebox_min,
        ai.order_index,
        ai.secretary_notes,
        ai.decision_text,
        ai.decision_recorded_at,
        ai.discussed_at,
        -- Risk entity data
        CASE WHEN ai.entity_type = 'risk' THEN
          jsonb_build_object(
            'threat_name', t.name,
            'system_name', sys.name,
            'department',  d.name,
            'validation_status', r.validation_status
          )
        END AS risk_data,
        -- Action entity data
        CASE WHEN ai.entity_type = 'security_action' THEN
          jsonb_build_object(
            'title',  sa.title,
            'status', sa.status,
            'treatment_type', sa.treatment_type
          )
        END AS action_data,
        -- Exception entity data
        CASE WHEN ai.entity_type = 'risk_exception' THEN
          jsonb_build_object(
            'expires_at',   re.expires_at,
            'status',       re.status,
            'threat_name',  et.name,
            'system_name',  esys.name
          )
        END AS exception_data,
        -- Divergence: source entity mutated after the meeting was closed
        CASE WHEN $2::timestamptz IS NOT NULL AND ai.entity_id IS NOT NULL THEN
          EXISTS (
            SELECT 1 FROM audit_log al
            WHERE al.entity_id = ai.entity_id
              AND al.created_at > $2::timestamptz
          )
        ELSE FALSE
        END AS source_diverged
      FROM meeting_agenda_items ai
      LEFT JOIN risks r          ON r.id  = ai.entity_id AND ai.entity_type = 'risk'
      LEFT JOIN threats t        ON t.id  = r.threat_id
      LEFT JOIN systems sys      ON sys.id = r.system_id
      LEFT JOIN departments d    ON d.id  = sys.department_id
      LEFT JOIN security_actions sa  ON sa.id  = ai.entity_id AND ai.entity_type = 'security_action'
      LEFT JOIN exceptions re   ON re.id  = ai.entity_id AND ai.entity_type = 'risk_exception'
      LEFT JOIN risks er             ON er.id  = re.risk_id
      LEFT JOIN threats et           ON et.id  = er.threat_id
      LEFT JOIN systems esys         ON esys.id = er.system_id
      WHERE ai.meeting_id = $1
      ORDER BY ai.order_index ASC, ai.created_at ASC
    `, [id, closedAt ?? null]);

    res.json({ count: result.rows.length, items: result.rows });
  } catch (err) { next(err); }
}


// ── POST /meetings/:id/agenda/generate ────────────────────────────────────────
// Auto-populate agenda items from live system state.
// Deletes all existing `auto` items for this meeting and recreates.
// Pinned items are preserved. Only callable by meeting_secretary while planned.
async function generateAgenda(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const meetingRes = await query(
      `SELECT id, linked_cycle_id, planned_at, closed_at, section_timeboxes FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    const meeting = meetingRes.rows[0];

    if (!meeting.planned_at) return res.status(409).json({ error: 'Meeting must be planned before generating an agenda.' });
    if (meeting.closed_at)   return res.status(409).json({ error: 'Agenda cannot be regenerated after the meeting is closed.' });

    const cycleId = meeting.linked_cycle_id;

    // ── 1. Build items array ──────────────────────────────────────────────────
    const items = [];

    function push(category, title, opts = {}) {
      const base = CATEGORY_BASE[category] ?? 99000;
      const idx  = items.filter(i => i.category === category).length;
      items.push({
        category,
        title,
        source:                'auto',
        entity_type:           opts.entity_type   ?? null,
        entity_id:             opts.entity_id     ?? null,
        suggested_timebox_min: opts.timebox        ?? null,
        notes:                 opts.notes          ?? null,
        order_index:           base + idx * 10,
      });
    }

    // ── Procedural ────────────────────────────────────────────────────────────
    push('opening',          'Opening — attendees, apologies, quorum check');
    push('previous_minutes', 'Previous minutes and actions arising');

    // ── Change briefings ──────────────────────────────────────────────────────
    push('change_briefing',  'New systems and services in scope');
    push('change_briefing',  'New and emerging threats');

    if (cycleId) {
      const cycleRes = await query(`SELECT name FROM review_cycles WHERE id = $1`, [cycleId]);
      const cycleName = cycleRes.rows[0]?.name ?? 'Cycle';
      push('cycle_overview', `Cycle overview — ${cycleName}`, {
        entity_type: 'review_cycle', entity_id: cycleId,
      });
    }

    // ISMS objectives standing item — always present (ISO 27001 9.3.2 evidence)
    push('isms_objectives',  'ISMS objectives and interested-party changes (standing item — "no change" is a valid outcome)');

    // ── Identified exposures awaiting assessment ──────────────────────────────
    // A threat identified against a system but never assessed is something the
    // organisation KNOWS about and has not evaluated. That is a governance
    // position, so the group takes a view on the size and shape of the backlog
    // — one headline item, not a recitation of every pair.
    //
    // Pushed even when the backlog is empty, for the same reason the ISMS
    // objectives item always appears: an absent item proves nothing, whereas an
    // item reading "none outstanding" is evidence the group looked.
    const backlog = await query(`
      SELECT COUNT(*)::int                                    AS total,
             COUNT(DISTINCT st.system_id)::int                AS systems,
             COUNT(*) FILTER (
               WHERE st.added_at < now() - make_interval(days => oc.meeting_max_interval_days)
             )::int                                           AS stale
        FROM system_threats st
        JOIN systems s ON s.id = st.system_id AND s.is_active = TRUE
        CROSS JOIN org_config oc
       WHERE NOT EXISTS (
         SELECT 1 FROM risks r
          WHERE r.system_id = st.system_id AND r.threat_id = st.threat_id AND r.is_active
       )
    `);
    const bl = backlog.rows[0] || { total: 0, systems: 0, stale: 0 };
    push('threat_identification',
      bl.total === 0
        ? 'Identified exposures awaiting assessment — none outstanding'
        : `Identified exposures awaiting assessment — ${bl.total} across ${bl.systems} system${bl.systems !== 1 ? 's' : ''}`
          + (bl.stale > 0 ? ` (${bl.stale} beyond one review cycle)` : ''),
      { notes: bl.stale > 0
          ? 'Exposures identified more than one full review cycle ago and still unassessed. The group is asked whether this backlog is acceptable.'
          : null });

    // ── New risks ─────────────────────────────────────────────────────────────
    const pendingRisks = await query(`
      SELECT r.id, t.name AS threat_name, sys.name AS system_name
      FROM risks r
      JOIN threats t   ON t.id  = r.threat_id
      JOIN systems sys ON sys.id = r.system_id
      WHERE r.is_active = TRUE
        AND r.validation_status = 'pending'
      ORDER BY sys.name, t.name
      LIMIT 30
    `);
    // Standing incident-review line. Incidents aren't a CIRKS entity — they live
    // in the IR/SOC tooling — so this is the SWG's review point per ISO 27001
    // A.5.27 (learning from incidents) / clause 9.3: discuss incidents since the
    // last meeting and raise any new threats/risks; the minute is the evidence.
    // "No incidents" is a valid standing-item outcome.
    push('new_risks', 'Incidents since the last meeting — review and raise any new threats/risks');

    // Single overview line for new risks — the per-risk items live in the Risk
    // validation decision section below (so we don't list each risk twice).
    const pendingCount = pendingRisks.rows.length;
    push('new_risks', pendingCount > 0
      ? `New risks this cycle — ${pendingCount} pending validation (decided under Risk validation below)`
      : 'New risks this cycle — none pending validation');

    // ── Action progress ───────────────────────────────────────────────────────
    const inFlightActions = await query(`
      SELECT sa.id, sa.title, sa.status
      FROM security_actions sa
      WHERE sa.status IN ('planned', 'in_progress')
      ORDER BY sa.status DESC, sa.title
      LIMIT 30
    `);
    for (const a of inFlightActions.rows) {
      push('action_progress', a.title, {
        entity_type: 'security_action', entity_id: a.id,
      });
    }

    // ── SAP health ────────────────────────────────────────────────────────────
    push('sap_health', 'Security Action Plan health review');

    // ── Assurance reports ─────────────────────────────────────────────────────
    // Reports from OUTSIDE CIRKS stay a standing line. The findings CIRKS derives
    // itself follow, one headline line per finding type — the shape
    // threat_identification uses for its backlog — rather than a recitation of
    // every asset or objective (docs/assurance-findings.md §7). This line used
    // to end "…audit findings", a heading with nothing behind it.
    push('assurance', 'Assurance reports — HR training compliance, phishing sims, patching');

    // Each finding line is pushed even when nothing is outstanding: "none
    // outstanding" in the minutes is evidence the group looked; an absent line
    // proves nothing. entity_type names the finding (no entity_id — it is a set,
    // not a row) so the agenda can link to where the detail lives.
    const rating = (await query(`
      SELECT (SELECT COUNT(*) FROM information_assets WHERE is_active)::int       AS assets,
             COUNT(*)::int                                                         AS total,
             COUNT(*) FILTER (WHERE f.band = 'never_rated')::int                   AS never_rated,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM security_actions a
                WHERE a.origin = 'rating_incomplete' AND a.subject_type = 'asset'
                  AND a.subject_id = f.asset_id
                  AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')))::int AS acted,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM exceptions e
                WHERE e.origin = 'rating_incomplete' AND e.subject_type = 'asset'
                  AND e.subject_id = f.asset_id AND e.status = 'active'))::int  AS accepted
        FROM v_asset_rating_findings f
    `)).rows[0];
    push('assurance',
      rating.total === 0
        ? 'Finding: information assets not fully rated — none outstanding'
        : `Finding: information assets not fully rated — ${rating.total} of ${rating.assets}`
          + (rating.never_rated ? ` (${rating.never_rated} never rated)` : '')
          + `; ${rating.acted} with an action raised, ${rating.accepted} accepted`,
      { entity_type: 'finding:rating_incomplete',
        notes: rating.total > rating.acted + rating.accepted
          ? 'An asset missing a mandatory impact table has its impact — and every risk score on the systems holding it — understated. For each asset with neither an action nor an acceptance, the group is asked to act or to accept.'
          : null });

    // v138 — systems missing per-system components their controls need. Counts
    // only components STATED per-system (§5): an unclassified one may be a single
    // shared policy, so it is reported as unclassified, never as a gap.
    // v150: the agenda counts what still needs a choice after complete in-place
    // solutions are counted as chosen.
    await query('SELECT settle_system_security()');
    const rec = (await query(`
      SELECT (SELECT COUNT(*) FROM systems WHERE is_active)::int              AS systems,
             COUNT(*)::int                                                     AS total,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM security_actions a
                WHERE a.origin = 'component_record' AND a.subject_id = f.system_id
                  AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')))::int AS acted,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM exceptions e
                WHERE e.origin = 'component_record' AND e.subject_id = f.system_id
                  AND e.status = 'active'))::int                               AS accepted,
             (SELECT COUNT(*) FROM (
                SELECT ccl.component_id
                  FROM system_controls syc
                  JOIN controls c ON c.id = syc.control_id AND COALESCE(c.delivery, 'system') = 'system'
                  JOIN control_component_links ccl ON ccl.control_id = syc.control_id
                  JOIN control_components cc ON cc.id = ccl.component_id AND cc.instantiation IS NULL
                 WHERE syc.status <> 'not_applicable'
                 GROUP BY ccl.component_id HAVING COUNT(DISTINCT syc.system_id) > 1) u)::int AS unclassified
        FROM v_system_component_findings f
    `)).rows[0];
    push('assurance',
      (rec.total === 0
        ? 'Finding: system component records incomplete — none outstanding'
        : `Finding: system component records incomplete — ${rec.total} of ${rec.systems} systems; `
          + `${rec.acted} with an action raised, ${rec.accepted} accepted`)
      + (rec.unclassified
        ? ` (${rec.unclassified} component${rec.unclassified !== 1 ? 's' : ''} not yet classified shared or per-system, so not counted)`
        : ''),
      { entity_type: 'finding:component_record',
        notes: rec.unclassified
          ? 'A component used on several systems must be classified before it can be counted as missing from any one of them: a single shared policy is not missing thirty times.'
          : null });

    // v140 — Published policies, standards and procedures past their review date.
    const docs = (await query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM security_actions a
                WHERE a.origin = 'document_review' AND a.subject_id = f.component_id
                  AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')))::int AS acted,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM exceptions e
                WHERE e.origin = 'document_review' AND e.subject_id = f.component_id
                  AND e.status = 'active'))::int                               AS accepted
        FROM v_document_review_findings f
    `)).rows[0];
    push('assurance',
      docs.total === 0
        ? 'Finding: policies & documents overdue for review — none outstanding'
        : `Finding: policies & documents overdue for review — ${docs.total}; `
          + `${docs.acted} with an action raised, ${docs.accepted} accepted`,
      { entity_type: 'finding:document_review' });

    // v153 — control objectives no security solution delivers.
    const objs = (await query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM security_actions a
                WHERE a.origin = 'objective_solution' AND a.subject_id = f.control_id
                  AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')))::int AS acted,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM exceptions e
                WHERE e.origin = 'objective_solution' AND e.subject_id = f.control_id
                  AND e.status = 'active'))::int                               AS accepted
        FROM v_objective_solution_findings f
    `)).rows[0];
    push('assurance',
      objs.total === 0
        ? 'Finding: control objectives with no security solution — none outstanding'
        : `Finding: control objectives with no security solution — ${objs.total}; `
          + `${objs.acted} with an action raised, ${objs.accepted} accepted`,
      { entity_type: 'finding:objective_solution' });

    // v144 — live supplier relationships not covered by current assurance evidence.
    const sup = (await query(`
      SELECT (SELECT COUNT(*) FROM supplier_relationships WHERE status IN ('active', 'exiting'))::int AS live,
             COUNT(*)::int                                          AS total,
             COUNT(*) FILTER (WHERE f.reason = 'expired')::int      AS expired,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM security_actions a
                WHERE a.origin = 'supplier_assurance' AND a.subject_id = f.relationship_id
                  AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')))::int AS acted,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM exceptions e
                WHERE e.origin = 'supplier_assurance' AND e.subject_id = f.relationship_id
                  AND e.status = 'active'))::int                   AS accepted
        FROM v_supplier_assurance_findings f
    `)).rows[0];
    push('assurance',
      sup.total === 0
        ? 'Finding: supplier assurance incomplete — none outstanding'
        : `Finding: supplier assurance incomplete — ${sup.total} of ${sup.live} live supplier relationships`
          + (sup.expired ? ` (${sup.expired} with evidence that has expired)` : '')
          + `; ${sup.acted} with an action raised, ${sup.accepted} accepted`,
      { entity_type: 'finding:supplier_assurance' });

    const soa = (await query(`
      SELECT COUNT(*)::int AS total, COUNT(DISTINCT control_id)::int AS objectives
        FROM v_soa_findings
    `)).rows[0];
    push('assurance',
      soa.total === 0
        ? 'Finding: Statement of Applicability contradictions — none outstanding'
        : `Finding: Statement of Applicability contradictions — ${soa.total} across ${soa.objectives} control objective${soa.objectives !== 1 ? 's' : ''}`,
      { entity_type: 'finding:soa' });   // links to /findings, which every attendee can open

    // ── Decisions: risk validation ────────────────────────────────────────────
    for (const r of pendingRisks.rows) {
      push('risk_validation', `Validate: ${r.threat_name} — ${r.system_name}`, {
        entity_type: 'risk', entity_id: r.id,
      });
    }

    // ── Decisions: action acceptance ──────────────────────────────────────────
    // Only actions that actually carry remediation items can be accepted —
    // acceptance freezes the items and snapshots the risk baseline.
    const proposedActions = await query(`
      SELECT sa.id, sa.title,
             (SELECT COUNT(*) FROM security_action_items sai
               WHERE sai.action_id = sa.id) AS item_count
      FROM security_actions sa
      WHERE sa.status = 'proposed'
      ORDER BY sa.title
    `);
    for (const a of proposedActions.rows) {
      if (Number(a.item_count) === 0) continue;
      push('action_adoption', `Accept: ${a.title} (${a.item_count} item${a.item_count === '1' ? '' : 's'})`, {
        entity_type: 'security_action', entity_id: a.id,
      });
    }

    // ── Decisions: exceptions ─────────────────────────────────────────────────
    const activeExceptions = await query(`
      SELECT re.id, t.name AS threat_name, sys.name AS system_name, re.status, re.expires_at
      FROM exceptions re
      JOIN risks r   ON r.id  = re.risk_id
      JOIN threats t ON t.id  = r.threat_id
      JOIN systems sys ON sys.id = r.system_id
      WHERE re.status IN ('active', 'renewed')
      ORDER BY re.expires_at ASC
    `);
    for (const e of activeExceptions.rows) {
      const expLabel = e.expires_at ? ` (expires ${new Date(e.expires_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })})` : '';
      push('exceptions', `Exception review: ${e.threat_name} — ${e.system_name}${expLabel}`, {
        entity_type: 'risk_exception', entity_id: e.id,
      });
    }

    // No verification section: completion is per-item and happens on the risk,
    // so there is nothing for the SWG to sign off after the fact. Progress on
    // accepted actions is covered by the 'action_progress' section above.

    // ── Procedural close ──────────────────────────────────────────────────────
    push('aob',   'Any other business / improvement opportunities');
    push('close', 'Close — confirm quorum recorded');

    // ── 2. Replace auto items in a transaction ────────────────────────────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `DELETE FROM meeting_agenda_items WHERE meeting_id = $1 AND source = 'auto'`,
        [id]
      );

      for (const item of items) {
        await client.query(
          `INSERT INTO meeting_agenda_items
             (meeting_id, source, category, entity_type, entity_id,
              title, notes, suggested_timebox_min, order_index, raised_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id, item.source, item.category,
            item.entity_type, item.entity_id,
            item.title, item.notes,
            item.suggested_timebox_min, item.order_index,
            userId,
          ]
        );
      }

      // Seed default per-section budgets for the categories we just generated,
      // without clobbering any the secretary already set (existing values win).
      const presentCats = [...new Set(items.map(i => i.category))];
      const seeded = {};
      for (const c of presentCats) {
        if (DEFAULT_SECTION_TIMEBOXES[c] != null) seeded[c] = DEFAULT_SECTION_TIMEBOXES[c];
      }
      const mergedTimeboxes = { ...seeded, ...(meeting.section_timeboxes || {}) };

      await client.query(
        `UPDATE working_group_meetings
            SET agenda_generated_at = now(), section_timeboxes = $2
          WHERE id = $1`,
        [id, JSON.stringify(mergedTimeboxes)]
      );

      await client.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, human_narrative)
         VALUES ($1, 'generate_agenda', 'working_group_meetings', $2, $3)`,
        [userId, id, `Agenda generated: ${items.length} items`]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ generated: items.length });
  } catch (err) { next(err); }
}


// ── POST /meetings/:id/agenda/items ──────────────────────────────────────────
// Add a manually pinned agenda item (secretary only, planned state).
// Body: { category, title, notes?, suggested_timebox_min?, order_index? }
async function addItem(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { category, title, notes, suggested_timebox_min, order_index } = req.body;

    if (!category) return res.status(400).json({ error: 'category is required.' });
    if (!title)    return res.status(400).json({ error: 'title is required.' });

    const meetingRes = await query(
      `SELECT id, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    if (meetingRes.rows[0].closed_at) return res.status(409).json({ error: 'Meeting is closed.' });

    // Default order_index: end of this category
    let finalOrderIndex = order_index;
    if (finalOrderIndex == null) {
      const maxRes = await query(
        `SELECT MAX(order_index) AS mx FROM meeting_agenda_items
          WHERE meeting_id = $1 AND category = $2`,
        [id, category]
      );
      const base = CATEGORY_BASE[category] ?? 99000;
      finalOrderIndex = (maxRes.rows[0]?.mx ?? base - 10) + 10;
    }

    const result = await query(
      `INSERT INTO meeting_agenda_items
         (meeting_id, source, category, title, notes, suggested_timebox_min, order_index, raised_by)
       VALUES ($1, 'pinned', $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, category, title, notes ?? null, suggested_timebox_min ?? null, finalOrderIndex, userId]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (err) { next(err); }
}


// ── PATCH /meetings/:id/agenda/items/:iid ─────────────────────────────────────
// Edit notes, timebox, secretary_notes, or order_index.
// Works on both auto and pinned items.
async function updateItem(req, res, next) {
  try {
    const { id, iid } = req.params;

    const meetingRes = await query(
      `SELECT id, closed_at, minutes_issued_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    if (meetingRes.rows[0].minutes_issued_at) return res.status(409).json({ error: 'Minutes have been issued — agenda is sealed.' });

    const { notes, secretary_notes, suggested_timebox_min, order_index, title } = req.body;
    const sets = [];
    const params = [];
    let p = 1;

    if (notes                 !== undefined) { sets.push(`notes = $${p++}`);                  params.push(notes); }
    if (secretary_notes       !== undefined) { sets.push(`secretary_notes = $${p++}`);        params.push(secretary_notes); }
    if (suggested_timebox_min !== undefined) { sets.push(`suggested_timebox_min = $${p++}`);  params.push(suggested_timebox_min); }
    if (order_index           !== undefined) { sets.push(`order_index = $${p++}`);            params.push(order_index); }
    if (title                 !== undefined) { sets.push(`title = $${p++}`);                  params.push(title); }

    if (!sets.length) return res.status(400).json({ error: 'No fields to update.' });

    sets.push(`updated_at = now()`);
    params.push(iid);
    params.push(id);

    const result = await query(
      `UPDATE meeting_agenda_items SET ${sets.join(', ')}
        WHERE id = $${p} AND meeting_id = $${p + 1}
        RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Agenda item not found.' });
    res.json({ item: result.rows[0] });
  } catch (err) { next(err); }
}


// ── DELETE /meetings/:id/agenda/items/:iid ────────────────────────────────────
// Remove an agenda item (secretary only, before close).
async function deleteItem(req, res, next) {
  try {
    const { id, iid } = req.params;

    const meetingRes = await query(
      `SELECT id, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    if (meetingRes.rows[0].closed_at) return res.status(409).json({ error: 'Meeting is closed — agenda is frozen.' });

    const del = await query(
      `DELETE FROM meeting_agenda_items WHERE id = $1 AND meeting_id = $2 RETURNING id`,
      [iid, id]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Agenda item not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
}


// ── POST /meetings/:id/agenda/reorder ────────────────────────────────────────
// Bulk update order_index for a set of items.
// Body: { items: [{ id, order_index }] }
async function reorderItems(req, res, next) {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'items array is required.' });
    }

    const meetingRes = await query(
      `SELECT id, closed_at FROM working_group_meetings WHERE id = $1`, [id]
    );
    if (!meetingRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });
    if (meetingRes.rows[0].closed_at) return res.status(409).json({ error: 'Meeting is closed.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id: itemId, order_index } of items) {
        await client.query(
          `UPDATE meeting_agenda_items SET order_index = $1, updated_at = now()
            WHERE id = $2 AND meeting_id = $3`,
          [order_index, itemId, id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ updated: items.length });
  } catch (err) { next(err); }
}

// ── POST /meetings/:id/agenda/items/:iid/decision ────────────────────────────
// Records the SWG's formal decision on an agenda item.
//   • decision_text  — what was decided (written to minutes)
//   • action         — source-entity operation (validate/return/adopt/cancel/verify/reject)
//   • notes          — extra notes for return/reject (≥10 chars, required by stored functions)
//   • secretary_notes — internal secretary observations
//
// Editability rules:
//   planned  → decision_text editable, source-entity actions allowed
//   closed   → decision_text editable (secretary refinement), no new entity actions
//   minutes_issued → locked
//
async function recordDecision(req, res, next) {
  try {
    const { id: meetingId, iid: itemId } = req.params;
    const { id: userId, role }           = req.user;
    const { decision_text, action, notes, secretary_notes } = req.body;

    // ── Meeting state check ─────────────────────────────────────────────────
    const mRes = await query(
      `SELECT id, closed_at, minutes_issued_at FROM working_group_meetings WHERE id = $1`,
      [meetingId]
    );
    if (!mRes.rows.length) return res.status(404).json({ error: 'Meeting not found.' });

    const { closed_at, minutes_issued_at } = mRes.rows[0];
    if (minutes_issued_at) {
      return res.status(409).json({ error: 'Minutes have been issued — decisions are locked.' });
    }
    if (closed_at && action) {
      return res.status(409).json({ error: 'Meeting is closed — source entity actions are no longer allowed. You may still edit decision text.' });
    }

    // ── Load agenda item ────────────────────────────────────────────────────
    const itemRes = await query(
      `SELECT * FROM meeting_agenda_items WHERE id = $1 AND meeting_id = $2`,
      [itemId, meetingId]
    );
    if (!itemRes.rows.length) return res.status(404).json({ error: 'Agenda item not found.' });
    const item = itemRes.rows[0];

    // ── Apply source-entity action ──────────────────────────────────────────
    if (action) {
      if (!item.entity_id) {
        return res.status(400).json({ error: 'This item has no linked entity; actions are not applicable.' });
      }
      await applyEntityAction(item, action, notes, userId, role);
    }

    // ── Update agenda item ──────────────────────────────────────────────────
    const sets   = [];
    const params = [];

    if (decision_text !== undefined) {
      params.push(decision_text || null);
      sets.push(`decision_text = $${params.length}`);
      sets.push(`decision_recorded_at = now()`);
      params.push(userId);
      sets.push(`decision_recorded_by = $${params.length}`);
    }

    if (secretary_notes !== undefined) {
      params.push(secretary_notes || null);
      sets.push(`secretary_notes = $${params.length}`);
    }

    // discussed_at: set on first interaction, never overwritten
    params.push(userId);
    sets.push(`discussed_at = COALESCE(discussed_at, now())`);
    sets.push(`discussed_by = COALESCE(discussed_by, $${params.length})`);
    sets.push(`updated_at = now()`);

    if (!sets.length) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    params.push(itemId);
    params.push(meetingId);

    const result = await query(
      `UPDATE meeting_agenda_items
          SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND meeting_id = $${params.length}
       RETURNING *`,
      params
    );

    res.json({ item: result.rows[0] });
  } catch (err) {
    // Surface application-level errors as 4xx
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

// ── Source-entity action dispatcher ──────────────────────────────────────────

async function applyEntityAction(item, action, notes, userId, role) {
  const { entity_type, entity_id } = item;
  const key = `${entity_type}:${action}`;

  switch (key) {
    case 'risk:validate': {
      // Capability gate (replaces the old DB-level CISO check in validate_risk).
      if (!can(role, 'risks.validate').allowed) {
        throw Object.assign(new Error('You do not have permission to validate risks.'), { status: 403 });
      }
      try {
        await query(`SELECT validate_risk($1, $2)`, [entity_id, userId]);
      } catch (dbErr) {
        const msg = (dbErr.message || '').toLowerCase();
        if (msg.includes('already validated')) throw Object.assign(new Error('Risk has already been validated.'), { status: 409 });
        if (msg.includes('not found'))         throw Object.assign(new Error('Risk not found.'), { status: 404 });
        throw dbErr;
      }
      break;
    }

    case 'risk:return': {
      // Capability gate (replaces the old DB-level CISO check in return_risk).
      if (!can(role, 'risks.validate').allowed) {
        throw Object.assign(new Error('You do not have permission to return risks.'), { status: 403 });
      }
      const trimmed = (notes || '').trim();
      if (trimmed.length < 10) {
        throw Object.assign(new Error('Notes are required when returning a risk (min 10 characters).'), { status: 400 });
      }
      try {
        await query(`SELECT return_risk($1, $2, $3)`, [entity_id, trimmed, userId]);
      } catch (dbErr) {
        const msg = (dbErr.message || '').toLowerCase();
        if (msg.includes('not found')) throw Object.assign(new Error('Risk not found.'), { status: 404 });
        throw dbErr;
      }
      break;
    }

    // Accepting an action in the meeting is the same governance act as
    // POST /risks/:id/actions/:aid/accept: it freezes the action's items,
    // owners and targets, and snapshots each linked risk's current scores as
    // the progress baseline. (The decision key stays 'adopt' — agenda items
    // recorded against past meetings still carry it.)
    case 'security_action:adopt': {
      const swgRoles = new Set(['ciso', 'siro', 'admin', 'meeting_secretary']);
      if (!swgRoles.has(role)) {
        throw Object.assign(new Error('Only SWG roles can accept actions.'), { status: 403 });
      }
      const aRes = await query(
        `SELECT sa.status,
                (SELECT COUNT(*) FROM security_action_items sai
                  WHERE sai.action_id = sa.id) AS item_count
           FROM security_actions sa WHERE sa.id = $1`, [entity_id]
      );
      if (!aRes.rows.length) throw Object.assign(new Error('Action not found.'), { status: 404 });
      if (aRes.rows[0].status !== 'proposed') {
        throw Object.assign(new Error(`Action cannot be accepted — current status is '${aRes.rows[0].status}'.`), { status: 409 });
      }
      if (Number(aRes.rows[0].item_count) === 0) {
        throw Object.assign(new Error('Action has no remediation items to accept.'), { status: 400 });
      }
      await query(
        `UPDATE security_actions
            SET status = 'planned', accepted_at = now(), accepted_by = $2, updated_at = now()
          WHERE id = $1`,
        [entity_id, userId]
      );
      await query(
        `UPDATE security_action_risks sar
            SET baseline_risk_c = r.risk_c, baseline_risk_i = r.risk_i,
                baseline_risk_a = r.risk_a, baseline_risk_score = r.risk_score
           FROM risks r
          WHERE sar.action_id = $1 AND r.id = sar.risk_id`,
        [entity_id]
      );
      break;
    }

    case 'security_action:cancel': {
      const aRes = await query(`SELECT status FROM security_actions WHERE id = $1`, [entity_id]);
      if (!aRes.rows.length) throw Object.assign(new Error('Action not found.'), { status: 404 });
      if (aRes.rows[0].status !== 'proposed') {
        throw Object.assign(new Error(`Action cannot be cancelled — current status is '${aRes.rows[0].status}'.`), { status: 409 });
      }
      await query(
        `UPDATE security_actions SET status = 'cancelled', updated_at = now() WHERE id = $1`,
        [entity_id]
      );
      break;
    }

    // 'security_action:verify' / ':reject' retired with the verify step — an
    // action now finishes when its last ITEM completes, which happens on the
    // risk (POST /risks/:id/action-items/:iid/complete), not in the meeting.

    default:
      throw Object.assign(
        new Error(`Unknown action '${action}' for entity type '${entity_type}'.`),
        { status: 400 }
      );
  }
}

module.exports = { getAgenda, generateAgenda, addItem, updateItem, deleteItem, reorderItems, recordDecision };
