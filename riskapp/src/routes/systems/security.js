'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A system's security, as the architecture sees it (v148,
// docs/system-security-view.md §4.5–§4.6 and §6):
//
//   GET    /systems/:id/security                       what it is, what it wants and why
//   PUT    /systems/:id/solution-choices/:controlId    choose a solution for an objective
//   DELETE /systems/:id/solution-choices/:controlId
//   GET    /systems/:id/builds/:buildId/apply          what applying a build would do
//   POST   /systems/:id/builds/:buildId/apply          { status } — copy it on
//
// Choosing and applying are edits to the system, so they take systems.write and
// the department seat (assertWriteScope) — the IAM for their own department.
// Report only: nothing here moves a status or a score.

const { query, withActor } = require('../../db/pool');
const { assertWriteScope }  = require('../../auth/scoping');
const { neededComponentsSql } = require('../../lib/neededComponents');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A build's components are copied with a status the person states (§4.4). There
// is no default: `unknown` makes every one a mandatory remediation candidate.
const APPLY_STATUSES = ['operational', 'degraded', 'missing', 'unknown'];

function guard(...names) {
  return (req, res, next) => {
    for (const n of names) {
      if (!UUID_RE.test(req.params[n] || '')) return res.status(400).json({ error: `Invalid ${n}.` });
    }
    return next();
  };
}

async function audit(db, userId, systemId, label, action, narrative) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
     VALUES ($1, $2, 'system_security', $3, $4, $5)`, [userId, action, systemId, label, narrative]);
}

// A solution's parts and their state ON THIS SYSTEM ($1).
const PARTS_SQL = (patternExpr) => `
  COALESCE((SELECT json_agg(json_build_object(
              'component_id', cc.id, 'component_name', cc.name, 'location', pp.location,
              'service_system_name', ss.name,
              'status', CASE pp.location
                          WHEN 'on_system' THEN (SELECT x.status::text FROM system_components x
                                                  WHERE x.system_id = $1 AND x.component_id = pp.component_id)
                          WHEN 'service'   THEN (SELECT x.status::text FROM system_components x
                                                  WHERE x.system_id = pp.service_system_id AND x.component_id = pp.component_id)
                          ELSE (SELECT st.status FROM v_component_state st WHERE st.component_id = pp.component_id)
                        END) ORDER BY pp.location, cc.name)
              FROM delivery_pattern_parts pp
              JOIN control_components cc ON cc.id = pp.component_id
              LEFT JOIN systems ss ON ss.id = pp.service_system_id
             WHERE pp.pattern_id = ${patternExpr}), '[]')`;

async function systemSecurity(systemId) {
  // v150: a complete solution in place counts as chosen. Settled where it is
  // read, since completeness can change by many routes; writes the choice and
  // an audit row giving the reason. Idempotent.
  await query('SELECT settle_system_security($1)', [systemId]);
  const [memberships, solutions, objectives] = await Promise.all([
    // Every membership group that applies to the system, with what it records.
    query(`
      SELECT g.id, g.name, g.sort_index, doc.name AS standard_name,
             COALESCE((SELECT json_agg(json_build_object('id', cc.id, 'name', cc.name) ORDER BY cc.name)
                         FROM membership_group_members m
                         JOIN system_components x ON x.component_id = m.component_id AND x.system_id = $1
                         JOIN control_components cc ON cc.id = m.component_id
                        WHERE m.group_id = g.id), '[]') AS recorded,
             COALESCE((SELECT json_agg(json_build_object('id', cc.id, 'name', cc.name, 'instantiation', cc.instantiation) ORDER BY cc.name)
                         FROM membership_group_members m JOIN control_components cc ON cc.id = m.component_id
                        WHERE m.group_id = g.id), '[]') AS members
        FROM membership_groups g JOIN control_components doc ON doc.id = g.standard_id
       WHERE NOT EXISTS (SELECT 1 FROM membership_group_triggers t WHERE t.group_id = g.id)
          OR EXISTS (SELECT 1 FROM membership_group_triggers t
                       JOIN system_components x ON x.component_id = t.component_id AND x.system_id = $1
                      WHERE t.group_id = g.id)
       ORDER BY g.sort_index, lower(g.name)`, [systemId]),
    // Each wanted solution once, with every reason it is wanted.
    query(`
      SELECT w.pattern_id, p.name AS pattern_name, p.kind,
             json_agg(json_build_object(
               'reason', w.reason, 'rule_id', w.rule_id, 'standard_name', w.standard_name,
               'trigger_component_name', w.trigger_component_name,
               'control_id', w.control_id, 'control_title', c.title, 'reference_code', c.reference_code)
               ORDER BY w.reason, w.standard_name, w.trigger_component_name) AS reasons,
             COALESCE((SELECT json_agg(json_build_object('id', oc.id, 'title', oc.title, 'reference_code', oc.reference_code)
                                       ORDER BY oc.reference_code, oc.title)
                         FROM delivery_pattern_objectives o JOIN controls oc ON oc.id = o.control_id
                        WHERE o.pattern_id = w.pattern_id), '[]') AS objectives,
             ${PARTS_SQL('w.pattern_id')} AS parts
        FROM v_system_wanted_solutions w
        JOIN delivery_patterns p ON p.id = w.pattern_id
        LEFT JOIN controls c ON c.id = w.control_id
       WHERE w.system_id = $1
       GROUP BY w.pattern_id, p.name, p.kind
       ORDER BY lower(p.name)`, [systemId]),
    // Each wanted objective: its state, the solutions that could deliver it, the
    // threats calling for it, and — a suggestion only — the solution in play.
    query(`
      SELECT w.control_id, c.title, c.reference_code, w.state, w.for_threat, w.recorded,
             w.pattern_ids, w.chosen_pattern_id,
             ch.notes AS choice_notes, ch.chosen_at, cu.full_name AS chosen_by_name, ch.source AS choice_source,
             (SELECT d.pattern_id FROM v_system_control_delivery d
               WHERE d.system_id = w.system_id AND d.control_id = w.control_id) AS suggested_pattern_id,
             COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'kind', p.kind) ORDER BY lower(p.name))
                         FROM delivery_pattern_objectives o JOIN delivery_patterns p ON p.id = o.pattern_id
                        WHERE o.control_id = w.control_id), '[]') AS solutions,
             COALESCE((SELECT json_agg(DISTINCT t.name)
                         FROM system_threats st
                         JOIN control_threats ct ON ct.threat_id = st.threat_id AND ct.control_id = w.control_id
                         JOIN threats t ON t.id = st.threat_id
                        WHERE st.system_id = w.system_id), '[]') AS threats
        FROM v_system_wanted_objectives w
        JOIN controls c ON c.id = w.control_id
        LEFT JOIN system_solution_choices ch ON ch.system_id = w.system_id AND ch.control_id = w.control_id
        LEFT JOIN users cu ON cu.id = ch.chosen_by
       WHERE w.system_id = $1
       ORDER BY CASE w.state WHEN 'conflict' THEN 0 WHEN 'needs_solution' THEN 1 ELSE 2 END,
                c.reference_code, c.title`, [systemId]),
  ]);
  return {
    memberships: memberships.rows.map((g) => ({ ...g, answered: g.recorded.length > 0 })),
    solutions: solutions.rows,
    objectives: objectives.rows,
  };
}

// What copying a build onto the system would add, and — if the copies are not
// operational — how many remediation candidates that creates on its risks.
async function buildPreview(db, systemId, buildId) {
  const { rows: [b] } = await db.query('SELECT name FROM system_builds WHERE id = $1', [buildId]);
  if (!b) return null;
  const { rows: comps } = await db.query(`
    SELECT cc.id, cc.name, cc.component_type, cc.instantiation,
           EXISTS (SELECT 1 FROM system_components x WHERE x.system_id = $1 AND x.component_id = cc.id) AS already
      FROM system_build_components bc JOIN control_components cc ON cc.id = bc.component_id
     WHERE bc.build_id = $2
     ORDER BY cc.component_type, cc.name`, [systemId, buildId]);
  const adding = comps.filter((c) => !c.already).map((c) => c.id);
  // A component that is not operational is a mandatory candidate on every active
  // risk whose threat a control needing it counters (the Build-from-gap rule).
  // Organisational components are never per-system candidates (v137).
  const { rows: cand } = adding.length ? await db.query(`
    SELECT count(DISTINCT (r.id, n.component_id))::int AS pairs,
           count(DISTINCT r.id)::int AS risks,
           count(DISTINCT n.component_id)::int AS components
      FROM risks r
      JOIN control_threats ct ON ct.threat_id = r.threat_id
      JOIN ${neededComponentsSql('$1')} n ON n.control_id = ct.control_id
      JOIN control_components cc ON cc.id = n.component_id AND cc.instantiation IS DISTINCT FROM 'organisational'
     WHERE r.system_id = $1 AND r.is_active AND n.component_id = ANY($2::uuid[])`, [systemId, adding])
    : { rows: [{ pairs: 0, risks: 0, components: 0 }] };
  return {
    build: { id: buildId, name: b.name },
    components: comps,
    adding: adding.length,
    // Only if the copies are added as anything other than operational.
    candidates_if_not_operational: cand[0],
  };
}

module.exports = function mount(router, { canView, canCreate }) {
  router.get('/:id/security', canView, guard('id'), async (req, res, next) => {
    try {
      const { rows } = await query('SELECT id FROM systems WHERE id = $1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'System not found.' });
      res.json(await systemSecurity(req.params.id));
    } catch (err) { next(err); }
  });

  // PUT /systems/:id/solution-choices/:controlId — { pattern_id, notes? }
  router.put('/:id/solution-choices/:controlId', canCreate, guard('id', 'controlId'), async (req, res, next) => {
    const { pattern_id, notes } = req.body || {};
    if (!UUID_RE.test(pattern_id || '')) return res.status(400).json({ error: 'Choose a security solution.' });
    try {
      await assertWriteScope(req, { table: 'systems', id: req.params.id });
      const out = await withActor(req.user.id, async (db) => {
        const { rows: [ctx] } = await db.query(`
          SELECT s.name AS system_name, c.title, p.name AS pattern_name,
                 (SELECT op.name FROM system_solution_choices ch JOIN delivery_patterns op ON op.id = ch.pattern_id
                   WHERE ch.system_id = s.id AND ch.control_id = c.id) AS previous
            FROM systems s, controls c, delivery_patterns p
           WHERE s.id = $1 AND c.id = $2 AND p.id = $3`, [req.params.id, req.params.controlId, pattern_id]);
        if (!ctx) return { status: 404, error: 'System, control objective or security solution not found.' };
        await db.query(`
          INSERT INTO system_solution_choices (system_id, control_id, pattern_id, notes, chosen_by)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (system_id, control_id) DO UPDATE
             SET pattern_id = EXCLUDED.pattern_id, notes = EXCLUDED.notes,
                 chosen_by = EXCLUDED.chosen_by, chosen_at = now(), source = 'person'`,
          [req.params.id, req.params.controlId, pattern_id,
           typeof notes === 'string' && notes.trim() ? notes.trim() : null, req.user.id]);
        // A person's choice replaces one counted automatically; `source` returns to
        // 'person' and the audit row below names who.
        await audit(db, req.user.id, req.params.id, ctx.system_name, ctx.previous ? 'update' : 'create',
          `${ctx.system_name}: "${ctx.pattern_name}" chosen for "${ctx.title}"`
          + (ctx.previous && ctx.previous !== ctx.pattern_name ? ` (was "${ctx.previous}")` : ''));
        return { ok: true };
      });
      if (out.error) return res.status(out.status).json({ error: out.error });
      res.json(await systemSecurity(req.params.id));
    } catch (err) {
      if (err?.hint === 'choice_not_delivering') return res.status(400).json({ error: 'That security solution does not deliver this control objective.' });
      next(err);
    }
  });

  router.delete('/:id/solution-choices/:controlId', canCreate, guard('id', 'controlId'), async (req, res, next) => {
    try {
      await assertWriteScope(req, { table: 'systems', id: req.params.id });
      const gone = await withActor(req.user.id, async (db) => {
        const { rows } = await db.query(`
          DELETE FROM system_solution_choices ch USING systems s, controls c, delivery_patterns p
           WHERE ch.system_id = $1 AND ch.control_id = $2 AND s.id = ch.system_id AND c.id = ch.control_id AND p.id = ch.pattern_id
           RETURNING s.name AS system_name, c.title, p.name AS pattern_name`, [req.params.id, req.params.controlId]);
        if (!rows.length) return false;
        await audit(db, req.user.id, req.params.id, rows[0].system_name, 'delete',
          `${rows[0].system_name}: choice of "${rows[0].pattern_name}" for "${rows[0].title}" withdrawn`);
        return true;
      });
      if (!gone) return res.status(404).json({ error: 'No choice is recorded for that objective.' });
      res.json(await systemSecurity(req.params.id));
    } catch (err) { next(err); }
  });

  router.get('/:id/builds/:buildId/apply', canCreate, guard('id', 'buildId'), async (req, res, next) => {
    try {
      const p = await buildPreview({ query }, req.params.id, req.params.buildId);
      if (!p) return res.status(404).json({ error: 'Build not found.' });
      res.json(p);
    } catch (err) { next(err); }
  });

  // POST /systems/:id/builds/:buildId/apply — { status }. Copies the build's
  // components that the system does not already record; nothing links back.
  router.post('/:id/builds/:buildId/apply', canCreate, guard('id', 'buildId'), async (req, res, next) => {
    const { status } = req.body || {};
    if (!APPLY_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Say what state the copied components are in: operational, degraded, missing (should be here, not yet in place) or unknown. A component that is not operational becomes a remediation candidate on this system\'s risks.' });
    }
    try {
      await assertWriteScope(req, { table: 'systems', id: req.params.id });
      const out = await withActor(req.user.id, async (db) => {
        const p = await buildPreview(db, req.params.id, req.params.buildId);
        if (!p) return null;
        const { rows: [s] } = await db.query('SELECT name FROM systems WHERE id = $1', [req.params.id]);
        const { rows } = await db.query(`
          INSERT INTO system_components (system_id, component_id, status, added_by)
          SELECT $1, bc.component_id, $3::system_element_status, $4
            FROM system_build_components bc WHERE bc.build_id = $2
          ON CONFLICT DO NOTHING
          RETURNING component_id`, [req.params.id, req.params.buildId, status, req.user.id]);
        await audit(db, req.user.id, req.params.id, s.name, 'update',
          `${s.name}: build "${p.build.name}" applied — ${rows.length} component${rows.length === 1 ? '' : 's'} added as ${status}`
          + (p.components.length > rows.length ? `, ${p.components.length - rows.length} already recorded` : ''));
        return { added: rows.length, already: p.components.length - rows.length };
      });
      if (!out) return res.status(404).json({ error: 'Build not found.' });
      res.status(201).json(out);
    } catch (err) { next(err); }
  });
};
