'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A system's pattern (v177, docs/system-patterns.md):
//
//   PATCH /systems/:id/pattern                { system_pattern }  S1–S8, or null
//   PATCH /systems/:id/components/:cid/slot   { slot_key }        a slot of its pattern, or null
//
// Both are edits to the system, so they take systems.write and the department
// seat (assertWriteScope), as the system's components do. Audited. The pattern
// decides which slots the system must answer (v178: from the pattern alone, read
// against the components' roles); it moves a status or a score only where a
// security pattern trigger names it, as a trigger component would.

const { query, withActor } = require('../../db/pool');
const { assertWriteScope } = require('../../auth/scoping');
const { PATTERNS, patternOf, slotOf, fitOf } = require('../../lib/systemPatterns');
// The overview of every system against its pattern is GET /architecture/system-patterns
// (controls.read, organisation-wide readers), not here: GET /systems is scoped by department.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function guard(...names) {
  return (req, res, next) => {
    for (const n of names) {
      if (!UUID_RE.test(req.params[n] || '')) return res.status(400).json({ error: `Invalid ${n}.` });
    }
    return next();
  };
}

async function audit(db, userId, systemId, label, narrative) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, human_narrative)
     VALUES ($1, 'update', 'system', $2, $3, $4)`, [userId, systemId, label, narrative]);
}

/**
 * The fit of each system against its pattern, read in one pass.
 * @param {string[]} ids  system ids
 * @returns {Promise<Map<string, object>>} system id → fitOf() result
 */
async function systemFits(ids) {
  if (!ids.length) return new Map();
  const [systems, components, suppliers] = await Promise.all([
    query('SELECT id, system_pattern FROM systems WHERE id = ANY($1::uuid[])', [ids]),
    query(`
      SELECT x.system_id, cc.id, cc.name, cc.component_type, x.slot_key, cc.roles
        FROM system_components x JOIN control_components cc ON cc.id = x.component_id
       WHERE x.system_id = ANY($1::uuid[])
       ORDER BY lower(cc.name)`, [ids]),
    // The suppliers that run a system: a live relationship naming it.
    query(`
      SELECT DISTINCT r.system_id, sp.id, sp.name
        FROM supplier_relationships r JOIN suppliers sp ON sp.id = r.supplier_id
       WHERE r.system_id = ANY($1::uuid[]) AND r.status IN ('active', 'exiting')
       ORDER BY sp.name`, [ids]),
  ]);
  const by = (rows) => rows.reduce((m, r) => m.set(r.system_id, [...(m.get(r.system_id) || []), r]), new Map());
  const comps = by(components.rows); const sups = by(suppliers.rows);
  return new Map(systems.rows.map((s) => [s.id, fitOf({
    system_pattern: s.system_pattern, components: comps.get(s.id) || [], suppliers: sups.get(s.id) || [],
  })]));
}

module.exports = function mount(router, { canCreate }) {
  router.patch('/:id/pattern', canCreate, guard('id'), async (req, res, next) => {
    const code = (req.body || {}).system_pattern;
    if (code !== null && !patternOf(code)) {
      return res.status(400).json({ error: `system_pattern is one of ${PATTERNS.map((p) => p.code).join(', ')}, or null.` });
    }
    try {
      await assertWriteScope(req, { table: 'systems', id: req.params.id });
      const found = await withActor(req.user.id, async (db) => {
        const { rows } = await db.query('SELECT name, system_pattern FROM systems WHERE id = $1', [req.params.id]);
        if (!rows.length) return false;
        const was = rows[0].system_pattern;
        if (was === code) return true;
        await db.query('UPDATE systems SET system_pattern = $2, updated_at = now() WHERE id = $1', [req.params.id, code]);
        const label = (c) => (c ? `${c} ${patternOf(c).name}` : 'not stated');
        await audit(db, req.user.id, req.params.id, rows[0].name,
          `System "${rows[0].name}": pattern ${label(was)} → ${label(code)}`);
        return true;
      });
      if (!found) return res.status(404).json({ error: 'System not found.' });
      const fits = await systemFits([req.params.id]);
      res.json({ system_pattern: code, pattern_fit: fits.get(req.params.id) });
    } catch (err) { next(err); }
  });

  router.patch('/:id/components/:cid/slot', canCreate, guard('id', 'cid'), async (req, res, next) => {
    const key = (req.body || {}).slot_key;
    if (key !== null && typeof key !== 'string') return res.status(400).json({ error: 'slot_key is a slot of the system\'s pattern, or null.' });
    try {
      await assertWriteScope(req, { table: 'systems', id: req.params.id });
      const result = await withActor(req.user.id, async (db) => {
        const { rows } = await db.query(`
          SELECT s.name AS system_name, s.system_pattern, cc.name AS component_name, cc.component_type, x.slot_key
            FROM system_components x
            JOIN systems s ON s.id = x.system_id
            JOIN control_components cc ON cc.id = x.component_id
           WHERE x.system_id = $1 AND x.component_id = $2`, [req.params.id, req.params.cid]);
        if (!rows.length) return { status: 404, error: 'Component is not on this system.' };
        const r = rows[0];
        if (key !== null) {
          if (!r.system_pattern) return { status: 400, error: 'Choose the system\'s pattern before saying which slot a component fills.' };
          const slot = slotOf(r.system_pattern, key);
          if (!slot) return { status: 400, error: `${patternOf(r.system_pattern).name} has no slot ${key}.` };
          if (slot.fill === 'supplier') return { status: 400, error: `${slot.label} is read from the system's supplier relationships.` };
          if (slot.types && !slot.types.includes(r.component_type)) {
            return { status: 400, error: `${slot.label} takes a ${slot.types.join(' or ')} component; ${r.component_name} is ${r.component_type}.` };
          }
        }
        if (r.slot_key === key) return { status: 200 };
        await db.query('UPDATE system_components SET slot_key = $3 WHERE system_id = $1 AND component_id = $2',
          [req.params.id, req.params.cid, key]);
        const label = (k) => (k ? slotOf(r.system_pattern, k)?.label || k : 'none');
        await audit(db, req.user.id, req.params.id, r.system_name,
          `System "${r.system_name}": ${r.component_name} fills ${label(key)} (was ${label(r.slot_key)})`);
        return { status: 200 };
      });
      if (result.error) return res.status(result.status).json({ error: result.error });
      const fits = await systemFits([req.params.id]);
      res.json({ slot_key: key, pattern_fit: fits.get(req.params.id) });
    } catch (err) { next(err); }
  });
};

module.exports.systemFits = systemFits;
