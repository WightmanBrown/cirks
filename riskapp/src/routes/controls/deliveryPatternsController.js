'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Security solutions (v145 delivery patterns, shared since v147 —
// docs/control-delivery-patterns.md, docs/system-security-view.md): the valid
// ways of delivering control objectives. A solution is either a set of PARTS —
// each on the system itself, on a named security service (a system), or once for
// the organisation — or "provided by the supplier", met by the supplier's
// evidence. Alternatives are between solutions, never within one.
//
// One solution delivers one or more objectives (delivery_pattern_objectives), so
// these routes, which hang off an objective, link and unlink solutions; renaming a
// solution or changing its parts changes it for every objective it delivers.
//
// Written by the security team (controls.write), like the rest of the library.
// Report only: what is derived from them never changes a status or a score.

const { query, withActor } = require('../../db/pool');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCATIONS = ['on_system', 'service', 'organisation'];

async function audit(db, userId, action, controlId, label, narrative) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
     VALUES ($1, $2, 'delivery_pattern', $3, $4, $5)`, [userId, action, controlId, label, narrative]);
}

// A solution with its parts and every objective it delivers.
const SOLUTION_SQL = `
  SELECT p.id, p.name, p.kind, p.notes,
         COALESCE((SELECT json_agg(json_build_object(
                    'id', pp.id, 'component_id', cc.id, 'component_name', cc.name, 'component_type', cc.component_type,
                    'location', pp.location, 'service_system_id', pp.service_system_id, 'service_system_name', s.name)
                    ORDER BY pp.location, cc.name)
                     FROM delivery_pattern_parts pp
                     JOIN control_components cc ON cc.id = pp.component_id
                     LEFT JOIN systems s ON s.id = pp.service_system_id
                    WHERE pp.pattern_id = p.id), '[]') AS parts,
         -- The objective's code: its own, else its first standard mapping (DE.CM-09).
         COALESCE((SELECT json_agg(json_build_object('id', c.id, 'title', c.title, 'reference_code',
                      COALESCE(c.reference_code,
                               (SELECT sc.ref_code FROM control_mappings cm
                                  JOIN standard_controls sc ON sc.id = cm.standard_control_id
                                  JOIN standards st ON st.id = sc.standard_id
                                 WHERE cm.control_id = c.id ORDER BY st.sort_index, sc.sort_index LIMIT 1)))
                    ORDER BY c.title)
                     FROM delivery_pattern_objectives o JOIN controls c ON c.id = o.control_id
                    WHERE o.pattern_id = p.id), '[]') AS objectives
    FROM delivery_patterns p`;

/** The solutions delivering one objective. Used by GET /controls/:id. */
async function patternsFor(controlId) {
  const { rows } = await query(`${SOLUTION_SQL}
     WHERE EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.pattern_id = p.id AND o.control_id = $1)
     ORDER BY p.kind, lower(p.name)`, [controlId]);
  return rows;
}

// GET /controls/solutions — the library of security solutions, for choosing one.
async function listSolutions(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT x.*, COALESCE(n.systems, 0) AS systems_in_place
        FROM (${SOLUTION_SQL}) x
        LEFT JOIN (SELECT pattern_id, count(DISTINCT system_id)::int AS systems
                     FROM v_delivery_pattern_state WHERE in_play GROUP BY pattern_id) n ON n.pattern_id = x.id
       ORDER BY x.kind, lower(x.name)`);
    res.json({ solutions: rows });
  } catch (err) { next(err); }
}

// GET /controls/solutions/recorded-on?component_id= — the systems a component is
// recorded on, for placing a solution's part "on a security system". A part there
// takes its state from that record (v145), so a system that does not record the
// component could only ever read as missing. Systems already used as a security
// system come first.
async function recordedOn(req, res, next) {
  const id = req.query.component_id;
  if (!UUID_RE.test(id || '')) return res.status(400).json({ error: 'component_id is required.' });
  try {
    const { rows } = await query(`
      SELECT s.id, s.name, x.status::text AS status,
             s.is_security_system
        FROM system_components x JOIN systems s ON s.id = x.system_id AND s.is_active
       WHERE x.component_id = $1
       ORDER BY 4 DESC, lower(s.name)`, [id]);
    res.json({ systems: rows });
  } catch (err) { next(err); }
}


// Where a part can be follows from the component's scope (v137), and a part on a
// security system can only go where the component is recorded (v145). Returns a
// refusal { status, error }, or null when the part may be added. One check for
// both ways in (from an objective, and from the solution's own page).
async function checkPart(db, { component_id, location, service_system_id }) {
  // A component that exists once per system is on the system; one that exists
  // once for the organisation is either once for the organisation or on the
  // security system that runs it. Unstated, it has to be stated first.
  const comp = (await db.query('SELECT name, instantiation FROM control_components WHERE id = $1', [component_id])).rows[0];
  if (!comp) return { status: 400, error: 'The component does not exist.' };
  if (!comp.instantiation) {
    return { status: 400, error: `Say first whether "${comp.name}" exists once for the organisation or once per system — that decides where it can be.` };
  }
  if (comp.instantiation === 'per_system' && location !== 'on_system') {
    return { status: 400, error: `"${comp.name}" exists once per system, so in a security solution it is on the system itself.` };
  }
  if (comp.instantiation === 'organisational' && location === 'on_system') {
    return { status: 400, error: `"${comp.name}" exists once for the organisation, so it is either once for the organisation or on the security system that runs it — not on each system.` };
  }
  if (location === 'service') {
    const rec = await db.query(
      `SELECT s.name, EXISTS (SELECT 1 FROM system_components x WHERE x.system_id = s.id AND x.component_id = $2) AS recorded
         FROM systems s WHERE s.id = $1`, [service_system_id, component_id]);
    if (!rec.rows.length) return { status: 400, error: 'The security system does not exist.' };
    if (!rec.rows[0].recorded) {
      return { status: 400, error: `"${comp.name}" is not recorded on ${rec.rows[0].name}, so it would always read as missing there. Record it on that system first.` };
    }
  }
  return null;
}

/** The solution, if it delivers this objective; else null. */
async function linked(db, patternId, controlId) {
  const { rows } = await db.query(
    `SELECT p.name, (SELECT count(*)::int FROM delivery_pattern_objectives x WHERE x.pattern_id = p.id) AS objectives
       FROM delivery_patterns p JOIN delivery_pattern_objectives o ON o.pattern_id = p.id AND o.control_id = $2
      WHERE p.id = $1`, [patternId, controlId]);
  return rows[0] || null;
}

// "shared by 6 objectives" — said wherever a change reaches beyond this objective.
const sharedNote = (n) => (n > 1 ? ` (shared by ${n} objectives)` : '');

/** How the objective is delivered on each system it is deployed on. */
async function deliveryFor(controlId) {
  const { rows } = await query(`
    SELECT d.system_id, s.name AS system_name, d.marked_status, d.pattern_name, d.pattern_kind, d.delivery,
           d.degraded_parts, d.missing_parts, d.disagreement
      FROM v_system_control_delivery d JOIN systems s ON s.id = d.system_id
     WHERE d.control_id = $1 AND d.delivery IS NOT NULL
     ORDER BY lower(s.name)`, [controlId]);
  return rows;
}

function refusal(err) {
  if (err?.code === '23505') {
    if (/uq_delivery_pattern_name/.test(err.constraint || '')) return [409, 'A security solution with that name already exists. Add it from the list instead, or choose another name.'];
    if (/uq_delivery_pattern_part/.test(err.constraint || '')) return [409, 'That part is already in this security solution.'];
  }
  if (err?.code === '23514' && err.hint === 'supplier_pattern_parts') return [400, 'A "provided by the supplier" solution has no parts: it is met by the supplier\'s evidence.'];
  if (err?.code === '23503') return [400, 'The component or service system does not exist.'];
  return null;
}

// POST /controls/:id/patterns — add a security solution to this objective:
//   { pattern_id }               an existing solution, now delivering this objective too;
//   { name, kind?, notes? }      a new solution. kind "supplier" reuses the one
//                                "provided by the supplier" solution if it exists.
async function createPattern(req, res, next) {
  const { pattern_id, name, kind = 'parts', notes } = req.body || {};
  if (pattern_id !== undefined && !UUID_RE.test(pattern_id || '')) return res.status(400).json({ error: 'Choose a security solution.' });
  if (pattern_id === undefined) {
    if (!['parts', 'supplier'].includes(kind)) return res.status(400).json({ error: 'kind is "parts" or "supplier".' });
    if (kind === 'parts' && (typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'Give the security solution a name, e.g. "CrowdStrike EDR".' });
  }
  try {
    const out = await withActor(req.user.id, async (db) => {
      const c = await db.query('SELECT title FROM controls WHERE id = $1', [req.params.id]);
      if (!c.rows.length) return { status: 404, error: 'Control objective not found.' };
      let id = pattern_id;
      let label;
      if (id) {
        const p = await db.query('SELECT name FROM delivery_patterns WHERE id = $1', [id]);
        if (!p.rows.length) return { status: 404, error: 'Security solution not found.' };
        label = p.rows[0].name;
      } else if (kind === 'supplier') {
        const p = await db.query(`SELECT id, name FROM delivery_patterns WHERE kind = 'supplier'`);
        if (p.rows.length) { id = p.rows[0].id; label = p.rows[0].name; }
      }
      if (!id) {
        label = kind === 'supplier' ? (typeof name === 'string' && name.trim() ? name.trim() : 'Provided by the supplier') : name.trim();
        const { rows } = await db.query(
          `INSERT INTO delivery_patterns (name, kind, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
          [label, kind, typeof notes === 'string' && notes.trim() ? notes.trim() : null, req.user.id]);
        id = rows[0].id;
      }
      const ins = await db.query(
        `INSERT INTO delivery_pattern_objectives (pattern_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, req.params.id]);
      if (!ins.rowCount) return { status: 409, error: `"${label}" already delivers this objective.` };
      await audit(db, req.user.id, 'create', req.params.id, c.rows[0].title,
        `Security solution "${label}" now delivers "${c.rows[0].title}"`);
      return { id };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json({ id: out.id, patterns: await patternsFor(req.params.id) });
  } catch (err) {
    const r = refusal(err); if (r) return res.status(r[0]).json({ error: r[1] });
    next(err);
  }
}

// PATCH /controls/:id/patterns/:patternId — { name?, notes? }
async function updatePattern(req, res, next) {
  const b = req.body || {};
  const sets = []; const params = [req.params.patternId];
  if ('name' in b) {
    if (typeof b.name !== 'string' || !b.name.trim()) return res.status(400).json({ error: 'A security solution needs a name.' });
    params.push(b.name.trim()); sets.push(`name = $${params.length}`);
  }
  if ('notes' in b) { params.push(typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null); sets.push(`notes = $${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
  try {
    const done = await withActor(req.user.id, async (db) => {
      const l = await linked(db, req.params.patternId, req.params.id);
      if (!l) return false;
      const { rows } = await db.query(
        `UPDATE delivery_patterns SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING name`, params);
      await audit(db, req.user.id, 'update', req.params.id, rows[0].name,
        `Security solution "${l.name}" changed${l.name !== rows[0].name ? ` — now "${rows[0].name}"` : ''}${sharedNote(l.objectives)}`);
      return true;
    });
    if (!done) return res.status(404).json({ error: 'Security solution not found on this objective.' });
    res.json({ patterns: await patternsFor(req.params.id) });
  } catch (err) {
    const r = refusal(err); if (r) return res.status(r[0]).json({ error: r[1] });
    next(err);
  }
}

// DELETE /controls/:id/patterns/:patternId — this objective no longer uses the
// solution. A solution left delivering nothing is removed from the library.
async function deletePattern(req, res, next) {
  try {
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM delivery_pattern_objectives o USING delivery_patterns p, controls c
          WHERE o.pattern_id = $1 AND o.control_id = $2 AND p.id = o.pattern_id AND c.id = o.control_id
          RETURNING p.name, c.title`, [req.params.patternId, req.params.id]);
      if (!rows.length) return false;
      // Left delivering nothing, it leaves the library — unless the security
      // architecture still requires it (v148): the rule stays, and says so.
      const left = await db.query(
        `DELETE FROM delivery_patterns p WHERE p.id = $1
            AND NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.pattern_id = p.id)
            AND NOT EXISTS (SELECT 1 FROM architecture_rules r WHERE r.pattern_id = p.id) RETURNING id`, [req.params.patternId]);
      await audit(db, req.user.id, 'delete', req.params.id, rows[0].name,
        `Security solution "${rows[0].name}" no longer delivers "${rows[0].title}"${left.rowCount ? ' — it delivered nothing else and was removed' : ''}`);
      return true;
    });
    if (!gone) return res.status(404).json({ error: 'Security solution not found on this objective.' });
    res.json({ patterns: await patternsFor(req.params.id) });
  } catch (err) { next(err); }
}

// POST /controls/:id/patterns/:patternId/parts — { component_id, location, service_system_id? }
async function addPart(req, res, next) {
  const { component_id, location, service_system_id } = req.body || {};
  if (!UUID_RE.test(component_id || '')) return res.status(400).json({ error: 'Choose a component.' });
  if (!LOCATIONS.includes(location)) return res.status(400).json({ error: 'Say where the part must be: on the system, on a security system, or once for the organisation.' });
  if (location === 'service' && !UUID_RE.test(service_system_id || '')) return res.status(400).json({ error: 'Choose the security system this part is on.' });
  try {
    const out = await withActor(req.user.id, async (db) => {
      const l = await linked(db, req.params.patternId, req.params.id);
      if (!l) return null;
      const bad = await checkPart(db, { component_id, location, service_system_id });
      if (bad) return bad;
      await db.query(
        `INSERT INTO delivery_pattern_parts (pattern_id, component_id, location, service_system_id) VALUES ($1, $2, $3, $4)`,
        [req.params.patternId, component_id, location, location === 'service' ? service_system_id : null]);
      const cc = await db.query('SELECT name FROM control_components WHERE id = $1', [component_id]);
      await audit(db, req.user.id, 'update', req.params.id, l.name,
        `Part "${cc.rows[0]?.name}" (${location.replace('_', ' ')}) added to security solution "${l.name}"${sharedNote(l.objectives)}`);
      return true;
    });
    if (!out) return res.status(404).json({ error: 'Security solution not found on this objective.' });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json({ patterns: await patternsFor(req.params.id) });
  } catch (err) {
    const r = refusal(err); if (r) return res.status(r[0]).json({ error: r[1] });
    next(err);
  }
}

// DELETE /controls/:id/patterns/:patternId/parts/:partId
async function removePart(req, res, next) {
  try {
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM delivery_pattern_parts pp USING delivery_patterns p, delivery_pattern_objectives o, control_components cc
          WHERE pp.id = $1 AND p.id = pp.pattern_id AND p.id = $2 AND o.pattern_id = p.id AND o.control_id = $3 AND cc.id = pp.component_id
          RETURNING p.name, cc.name AS component,
                    (SELECT count(*)::int FROM delivery_pattern_objectives x WHERE x.pattern_id = p.id) AS objectives`,
        [req.params.partId, req.params.patternId, req.params.id]);
      if (rows.length) await audit(db, req.user.id, 'update', req.params.id, rows[0].name,
        `Part "${rows[0].component}" removed from security solution "${rows[0].name}"${sharedNote(rows[0].objectives)}`);
      return rows.length > 0;
    });
    if (!gone) return res.status(404).json({ error: 'Part not found.' });
    res.json({ patterns: await patternsFor(req.params.id) });
  } catch (err) { next(err); }
}

// ── The solution's own page (/security-solutions) ────────────────────────────
// The same library seen from the other side: one solution, every objective it
// delivers, its parts, and where it is in place.

const solutionAudit = (db, userId, action, patternId, label, narrative) => db.query(
  `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
   VALUES ($1, $2, 'delivery_pattern', $3, $4, $5)`, [userId, action, patternId, label, narrative]);

// Per system: is the solution in place there, and how complete is it? A parts
// solution reads the same for every objective; a supplier one differs by
// objective (evidence covers some), so the worst state is shown.
const SYSTEMS_SQL = `
  SELECT ps.system_id, s.name AS system_name, d.name AS department_name,
         bool_or(ps.in_play) AS in_play,
         (array_agg(ps.state ORDER BY CASE ps.state WHEN 'incomplete' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END))[1] AS state,
         count(DISTINCT ps.control_id)::int AS objectives,
         (SELECT array_agg(DISTINCT x) FROM v_delivery_pattern_state q, unnest(q.missing_parts) x
           WHERE q.pattern_id = ps.pattern_id AND q.system_id = ps.system_id) AS missing_parts,
         (SELECT array_agg(DISTINCT x) FROM v_delivery_pattern_state q, unnest(q.degraded_parts) x
           WHERE q.pattern_id = ps.pattern_id AND q.system_id = ps.system_id) AS degraded_parts
    FROM v_delivery_pattern_state ps
    JOIN systems s ON s.id = ps.system_id
    LEFT JOIN departments d ON d.id = s.department_id
   WHERE ps.pattern_id = $1
   GROUP BY ps.system_id, ps.pattern_id, s.name, d.name
  HAVING bool_or(ps.in_play)
   ORDER BY lower(s.name)`;

async function solutionById(id) {
  const { rows } = await query(`${SOLUTION_SQL} WHERE p.id = $1`, [id]);
  if (!rows.length) return null;
  const { rows: systems } = await query(SYSTEMS_SQL, [id]);
  return { ...rows[0], systems };
}

// GET /controls/solutions/:patternId
async function getSolution(req, res, next) {
  try {
    const s = await solutionById(req.params.patternId);
    if (!s) return res.status(404).json({ error: 'Security solution not found.' });
    res.json({ solution: s });
  } catch (err) { next(err); }
}

// POST /controls/solutions — { name, kind?, notes? }. Delivers nothing until an
// objective is added to it.
async function createSolution(req, res, next) {
  const { kind = 'parts', notes } = req.body || {};
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!['parts', 'supplier'].includes(kind)) return res.status(400).json({ error: 'kind is "parts" or "supplier".' });
  if (kind === 'parts' && !name) return res.status(400).json({ error: 'Give the security solution a name, e.g. "CrowdStrike EDR".' });
  try {
    const id = await withActor(req.user.id, async (db) => {
      const label = name || 'Provided by the supplier';
      const { rows: [r] } = await db.query(
        `INSERT INTO delivery_patterns (name, kind, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [label, kind, typeof notes === 'string' && notes.trim() ? notes.trim() : null, req.user.id]);
      await solutionAudit(db, req.user.id, 'create', r.id, label, `Security solution "${label}" created`);
      return r.id;
    });
    res.status(201).json({ solution: await solutionById(id) });
  } catch (err) {
    if (err?.code === '23505' && /uq_delivery_pattern_supplier/.test(err.constraint || '')) {
      return res.status(409).json({ error: 'There is already a "provided by the supplier" solution — add objectives to it instead.' });
    }
    const r = refusal(err); if (r) return res.status(r[0]).json({ error: r[1] });
    next(err);
  }
}

// PATCH /controls/solutions/:patternId — { name?, notes? }
async function updateSolution(req, res, next) {
  const b = req.body || {};
  const sets = []; const params = [req.params.patternId];
  if ('name' in b) {
    if (typeof b.name !== 'string' || !b.name.trim()) return res.status(400).json({ error: 'A security solution needs a name.' });
    params.push(b.name.trim()); sets.push(`name = $${params.length}`);
  }
  if ('notes' in b) { params.push(typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null); sets.push(`notes = $${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
  try {
    const found = await withActor(req.user.id, async (db) => {
      const before = await db.query('SELECT name FROM delivery_patterns WHERE id = $1', [req.params.patternId]);
      if (!before.rows.length) return false;
      const { rows: [r] } = await db.query(
        `UPDATE delivery_patterns SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING name`, params);
      await solutionAudit(db, req.user.id, 'update', req.params.patternId, r.name,
        `Security solution "${before.rows[0].name}" changed${before.rows[0].name !== r.name ? ` — now "${r.name}"` : ''}`);
      return true;
    });
    if (!found) return res.status(404).json({ error: 'Security solution not found.' });
    res.json({ solution: await solutionById(req.params.patternId) });
  } catch (err) {
    const r = refusal(err); if (r) return res.status(r[0]).json({ error: r[1] });
    next(err);
  }
}

// DELETE /controls/solutions/:patternId — out of the library, and so off every
// objective it delivered. Refused while anything else still depends on it.
async function deleteSolution(req, res, next) {
  try {
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `SELECT p.name, (SELECT count(*)::int FROM delivery_pattern_objectives o WHERE o.pattern_id = p.id) AS objectives
           FROM delivery_patterns p WHERE p.id = $1`, [req.params.patternId]);
      if (!rows.length) return false;
      await db.query('DELETE FROM delivery_patterns WHERE id = $1', [req.params.patternId]);
      await solutionAudit(db, req.user.id, 'delete', req.params.patternId, rows[0].name,
        `Security solution "${rows[0].name}" removed from the library${rows[0].objectives ? ` — it delivered ${rows[0].objectives} objective${rows[0].objectives === 1 ? '' : 's'}` : ''}`);
      return true;
    });
    if (!gone) return res.status(404).json({ error: 'Security solution not found.' });
    res.status(204).end();
  } catch (err) {
    if (err?.code === '23503') return res.status(409).json({ error: 'Something still depends on this security solution (an architecture rule, or a choice made on a system). Remove that first.' });
    next(err);
  }
}

// POST /controls/solutions/:patternId/objectives — { control_id }
async function addSolutionObjective(req, res, next) {
  const { control_id } = req.body || {};
  if (!UUID_RE.test(control_id || '')) return res.status(400).json({ error: 'Choose a control objective.' });
  try {
    const out = await withActor(req.user.id, async (db) => {
      const { rows: [ctx] } = await db.query(
        `SELECT p.name, c.title FROM delivery_patterns p, controls c WHERE p.id = $1 AND c.id = $2`, [req.params.patternId, control_id]);
      if (!ctx) return { status: 404, error: 'Security solution or control objective not found.' };
      const ins = await db.query(
        `INSERT INTO delivery_pattern_objectives (pattern_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.params.patternId, control_id]);
      if (!ins.rowCount) return { status: 409, error: `"${ctx.name}" already delivers that objective.` };
      await solutionAudit(db, req.user.id, 'update', req.params.patternId, ctx.name, `Security solution "${ctx.name}" now delivers "${ctx.title}"`);
      return {};
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json({ solution: await solutionById(req.params.patternId) });
  } catch (err) { next(err); }
}

// DELETE /controls/solutions/:patternId/objectives/:controlId — the solution
// stays in the library, delivering its other objectives (or none, for now).
async function removeSolutionObjective(req, res, next) {
  if (!UUID_RE.test(req.params.controlId || '')) return res.status(400).json({ error: 'Invalid controlId.' });
  try {
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM delivery_pattern_objectives o USING delivery_patterns p, controls c
          WHERE o.pattern_id = $1 AND o.control_id = $2 AND p.id = o.pattern_id AND c.id = o.control_id
          RETURNING p.name, c.title`, [req.params.patternId, req.params.controlId]);
      if (!rows.length) return false;
      await solutionAudit(db, req.user.id, 'update', req.params.patternId, rows[0].name,
        `Security solution "${rows[0].name}" no longer delivers "${rows[0].title}"`);
      return true;
    });
    if (!gone) return res.status(404).json({ error: 'The solution does not deliver that objective.' });
    res.json({ solution: await solutionById(req.params.patternId) });
  } catch (err) { next(err); }
}

// POST /controls/solutions/:patternId/parts — { component_id, location, service_system_id? }
async function addSolutionPart(req, res, next) {
  const { component_id, location, service_system_id } = req.body || {};
  if (!UUID_RE.test(component_id || '')) return res.status(400).json({ error: 'Choose a component.' });
  if (!LOCATIONS.includes(location)) return res.status(400).json({ error: 'Say where the part must be: on the system, on a security system, or once for the organisation.' });
  if (location === 'service' && !UUID_RE.test(service_system_id || '')) return res.status(400).json({ error: 'Choose the security system this part is on.' });
  try {
    const out = await withActor(req.user.id, async (db) => {
      const { rows: [p] } = await db.query(`SELECT name, kind FROM delivery_patterns WHERE id = $1`, [req.params.patternId]);
      if (!p) return { status: 404, error: 'Security solution not found.' };
      const bad = await checkPart(db, { component_id, location, service_system_id });
      if (bad) return bad;
      await db.query(
        `INSERT INTO delivery_pattern_parts (pattern_id, component_id, location, service_system_id) VALUES ($1, $2, $3, $4)`,
        [req.params.patternId, component_id, location, location === 'service' ? service_system_id : null]);
      const cc = await db.query('SELECT name FROM control_components WHERE id = $1', [component_id]);
      await solutionAudit(db, req.user.id, 'update', req.params.patternId, p.name,
        `Part "${cc.rows[0]?.name}" (${location.replace('_', ' ')}) added to security solution "${p.name}"`);
      return {};
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json({ solution: await solutionById(req.params.patternId) });
  } catch (err) {
    const r = refusal(err); if (r) return res.status(r[0]).json({ error: r[1] });
    next(err);
  }
}

// DELETE /controls/solutions/:patternId/parts/:partId
async function removeSolutionPart(req, res, next) {
  try {
    const gone = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM delivery_pattern_parts pp USING delivery_patterns p, control_components cc
          WHERE pp.id = $1 AND pp.pattern_id = $2 AND p.id = pp.pattern_id AND cc.id = pp.component_id
          RETURNING p.name, cc.name AS component`, [req.params.partId, req.params.patternId]);
      if (!rows.length) return false;
      await solutionAudit(db, req.user.id, 'update', req.params.patternId, rows[0].name,
        `Part "${rows[0].component}" removed from security solution "${rows[0].name}"`);
      return true;
    });
    if (!gone) return res.status(404).json({ error: 'Part not found.' });
    res.json({ solution: await solutionById(req.params.patternId) });
  } catch (err) { next(err); }
}

module.exports = { getSolution, createSolution, updateSolution, deleteSolution, addSolutionObjective,
  removeSolutionObjective, addSolutionPart, removeSolutionPart, patternsFor, deliveryFor, listSolutions, recordedOn, createPattern, updatePattern, deletePattern, addPart, removePart };
