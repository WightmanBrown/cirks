'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Scopes (v126): named sets of systems in which a control objective can apply —
// e.g. the cardholder data environment. The whole organisation is not a scope row:
// it is the default, every active system.
//
// Reading: controls.read (anyone who can read the SoA can see where it applies).
// Drawing a scope — creating, renaming, deleting it, putting systems in or out —
// is a governance statement: scopes.manage (admin, ciso, siro).
// Saying which scopes an OBJECTIVE applies in is part of the SoA decision and
// lives on PATCH /soa/:id and POST /soa/decisions (controls.write).

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const uuidParam    = require('../../middleware/uuidParam');
const { query, withActor } = require('../../db/pool');

const router = Router();
router.use(authenticate);
for (const [name, guard] of uuidParam('id', 'systemId')) router.param(name, guard);

const canRead   = requireCapability('controls.read');
const canManage = requireCapability('scopes.manage');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nameConflict(err, name) {
  if (err && err.code === '23505' && /uq_scopes_name/.test(err.constraint || err.message || '')) {
    return `A scope called "${name}" already exists.`;
  }
  return null;
}

async function audit(db, userId, action, scopeId, label, narrative, extra = {}) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, entity_label, field_name, old_value, new_value, human_narrative)
     VALUES ($1, $2, 'scope', $3, $4, $5, $6, $7, $8)`,
    [userId, action, scopeId, label, extra.field ?? null, extra.old ?? null, extra.new ?? null, narrative]
  );
}

// ── GET /scopes — every scope, with its counts, plus the organisation baseline ──
router.get('/', canRead, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT sc.id, sc.name, sc.description, sc.created_at,
             (SELECT count(*)::int FROM scope_systems ss JOIN systems s ON s.id = ss.system_id AND s.is_active
               WHERE ss.scope_id = sc.id) AS system_count,
             (SELECT count(*)::int FROM soa_entry_scopes x JOIN soa_entries se ON se.control_id = x.control_id AND se.applicable
               WHERE x.scope_id = sc.id) AS objective_count
        FROM scopes sc
       ORDER BY lower(sc.name)`);
    const org = await query(`SELECT count(*)::int AS n FROM systems WHERE is_active`);
    res.json({ scopes: rows, organisation_system_count: org.rows[0].n });
  } catch (err) { next(err); }
});

// ── GET /scopes/:id — a scope, its systems and the objectives narrowed to it ────
router.get('/:id', canRead, async (req, res, next) => {
  try {
    const sc = await query(`SELECT id, name, description, created_at FROM scopes WHERE id = $1`, [req.params.id]);
    if (!sc.rows.length) return res.status(404).json({ error: 'Scope not found.' });
    const [systems, objectives] = await Promise.all([
      query(`
        SELECT s.id, s.name, s.is_active, d.name AS department_name, ss.added_at
          FROM scope_systems ss
          JOIN systems s ON s.id = ss.system_id
          LEFT JOIN departments d ON d.id = s.department_id
         WHERE ss.scope_id = $1
         ORDER BY lower(s.name)`, [req.params.id]),
      query(`
        SELECT c.id AS control_id, c.title,
               COALESCE((SELECT sc2.ref_code FROM control_mappings cm
                           JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
                           JOIN standards st ON st.id = sc2.standard_id
                          WHERE cm.control_id = c.id ORDER BY st.sort_index, sc2.sort_index LIMIT 1),
                        c.reference_code) AS ref
          FROM soa_entry_scopes x
          JOIN soa_entries se ON se.control_id = x.control_id AND se.applicable
          JOIN controls c ON c.id = x.control_id
         WHERE x.scope_id = $1
         ORDER BY ref NULLS LAST, c.title`, [req.params.id]),
    ]);
    res.json({ scope: sc.rows[0], systems: systems.rows, objectives: objectives.rows });
  } catch (err) { next(err); }
});

// ── POST /scopes — create ─────────────────────────────────────────────────────
router.post('/', canManage, async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? (req.body.description.trim() || null) : null;
  if (!name) return res.status(400).json({ error: 'A scope needs a name.' });
  if (name.length > 200) return res.status(400).json({ error: 'The name must be 200 characters or fewer.' });
  try {
    const scope = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO scopes (name, description, created_by) VALUES ($1, $2, $3)
         RETURNING id, name, description, created_at`, [name, description, req.user.id]);
      await audit(db, req.user.id, 'create', rows[0].id, name, `Scope "${name}" created`);
      return rows[0];
    });
    res.status(201).json({ scope: { ...scope, system_count: 0, objective_count: 0 } });
  } catch (err) {
    const conflict = nameConflict(err, name);
    if (conflict) return res.status(409).json({ error: conflict });
    next(err);
  }
});

// ── PATCH /scopes/:id — rename / redescribe ──────────────────────────────────
router.patch('/:id', canManage, async (req, res, next) => {
  const body = req.body || {};
  let name;
  if (body.name !== undefined) {
    name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'A scope needs a name.' });
    if (name.length > 200) return res.status(400).json({ error: 'The name must be 200 characters or fewer.' });
  }
  const description = body.description === undefined ? undefined
    : (typeof body.description === 'string' ? (body.description.trim() || null) : null);
  if (name === undefined && description === undefined) return res.status(400).json({ error: 'Nothing to update.' });
  try {
    const scope = await withActor(req.user.id, async (db) => {
      const before = await db.query(`SELECT name, description FROM scopes WHERE id = $1`, [req.params.id]);
      if (!before.rows.length) return null;
      const { rows } = await db.query(
        `UPDATE scopes SET name = COALESCE($2, name),
                           description = CASE WHEN $4 THEN $3 ELSE description END,
                           updated_at = now()
          WHERE id = $1 RETURNING id, name, description, created_at`,
        [req.params.id, name ?? null, description ?? null, description !== undefined]);
      if (name !== undefined && name !== before.rows[0].name) {
        await audit(db, req.user.id, 'update', req.params.id, name, `Scope renamed`,
          { field: 'name', old: before.rows[0].name, new: name });
      }
      return rows[0];
    });
    if (!scope) return res.status(404).json({ error: 'Scope not found.' });
    res.json({ scope });
  } catch (err) {
    const conflict = nameConflict(err, name);
    if (conflict) return res.status(409).json({ error: conflict });
    next(err);
  }
});

// ── DELETE /scopes/:id ───────────────────────────────────────────────────────
// Refused while any objective applies in it: deleting it would silently widen
// each of them to the whole organisation. The objectives are named in the reply.
router.delete('/:id', canManage, async (req, res, next) => {
  try {
    const used = await query(
      `SELECT c.title FROM soa_entry_scopes x JOIN controls c ON c.id = x.control_id
        WHERE x.scope_id = $1 ORDER BY c.title LIMIT 6`, [req.params.id]);
    if (used.rows.length) {
      return res.status(409).json({
        error: 'Objectives still apply in this scope. Move them to another scope, or to the whole organisation, first.',
        objectives: used.rows.map(r => r.title),
      });
    }
    const deleted = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(`DELETE FROM scopes WHERE id = $1 RETURNING name`, [req.params.id]);
      if (rows.length) await audit(db, req.user.id, 'delete', req.params.id, rows[0].name, `Scope "${rows[0].name}" deleted`);
      return rows[0];
    });
    if (!deleted) return res.status(404).json({ error: 'Scope not found.' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── POST /scopes/:id/systems — put systems in the scope ─────────────────────
router.post('/:id/systems', canManage, async (req, res, next) => {
  const ids = req.body?.system_ids;
  if (!Array.isArray(ids) || !ids.length || ids.some(i => typeof i !== 'string' || !UUID_RE.test(i))) {
    return res.status(400).json({ error: 'system_ids must be a non-empty list of system ids.' });
  }
  const unique = [...new Set(ids)];
  try {
    const result = await withActor(req.user.id, async (db) => {
      const sc = await db.query(`SELECT name FROM scopes WHERE id = $1`, [req.params.id]);
      if (!sc.rows.length) return { status: 404, error: 'Scope not found.' };
      const found = await db.query(`SELECT id, name FROM systems WHERE id = ANY($1::uuid[])`, [unique]);
      if (found.rows.length !== unique.length) return { status: 404, error: 'One or more systems were not found.' };
      const { rows } = await db.query(
        `INSERT INTO scope_systems (scope_id, system_id, added_by)
         SELECT $1, id, $2 FROM unnest($3::uuid[]) AS id
         ON CONFLICT DO NOTHING RETURNING system_id`, [req.params.id, req.user.id, unique]);
      const names = new Map(found.rows.map(r => [r.id, r.name]));
      for (const r of rows) {
        await audit(db, req.user.id, 'create', req.params.id, sc.rows[0].name,
          `System "${names.get(r.system_id)}" added to scope "${sc.rows[0].name}"`, { field: 'system', new: r.system_id });
      }
      return { added: rows.length };
    });
    if (result.status) return res.status(result.status).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ── DELETE /scopes/:id/systems/:systemId — take a system out ────────────────
router.delete('/:id/systems/:systemId', canManage, async (req, res, next) => {
  try {
    const removed = await withActor(req.user.id, async (db) => {
      const { rows } = await db.query(
        `DELETE FROM scope_systems ss USING scopes sc, systems s
          WHERE ss.scope_id = $1 AND ss.system_id = $2 AND sc.id = ss.scope_id AND s.id = ss.system_id
          RETURNING sc.name AS scope_name, s.name AS system_name`, [req.params.id, req.params.systemId]);
      if (rows.length) {
        await audit(db, req.user.id, 'delete', req.params.id, rows[0].scope_name,
          `System "${rows[0].system_name}" removed from scope "${rows[0].scope_name}"`, { field: 'system', old: req.params.systemId });
      }
      return rows[0];
    });
    if (!removed) return res.status(404).json({ error: 'That system is not in this scope.' });
    res.json({ removed: true });
  } catch (err) { next(err); }
});

module.exports = router;
