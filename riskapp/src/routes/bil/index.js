'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { assertWriteScope } = require('../../auth/scoping');
const { query }    = require('../../db/pool');
const { recomputeAssetCia } = require('../assets/recomputeAssetCia');

const router = Router();
router.use(authenticate);

const canView   = requireCapability('bil.read');
const canEdit   = requireCapability('bil.write');

// IAM may only write to department-scope tables (not org-scope).
async function denyIAMOnOrgScope(req, res, next) {
  if (req.user.role !== 'information_asset_manager') return next();
  try {
    const { rows } = await query('SELECT scope FROM impact_tables WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].scope === 'organisation')
      return res.status(403).json({ error: 'IAM role cannot modify organisation-scope tables' });
    next();
  } catch (err) { next(err); }
}

// Seat-based write: a dept-scoped role may only edit a DEPARTMENT-scope table
// belonging to its own department (org tables are already handled by
// denyIAMOnOrgScope, which must run first). No-op for global roles / isolation
// off. Mirrors assertWriteScope used elsewhere. See memory project_access_scoping.
async function seatScopeTable(req, res, next) {
  try {
    await assertWriteScope(req, { table: 'impact_tables', id: req.params.id });
    next();
  } catch (err) { next(err); }
}

// A PUBLISHED impact table's scale is frozen. Its level statements are what
// assets have been rated against, and — because statement-presence is what
// decides whether a dimension contributes at all — editing them silently
// changes the derived C/I/A of every asset rated against it. Publication is the
// point at which the scale becomes something other people depend on.
//
// This also closes a bypass of the publish rule: before it, an author blocked by
// the completeness check could publish a table stuffed with placeholder text and
// then edit the placeholders away. That is not hypothetical — it is how the
// availability-only table on the training instance got published.
//
// The escape hatch is POST /impact-tables/:id/unpublish: an explicit act by
// someone with publication authority, rather than a silent side effect.
async function requireUnpublished(req, res, next) {
  try {
    const { rows } = await query('SELECT published_at FROM impact_tables WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].published_at)
      return res.status(409).json({
        error: 'This impact table is published and its scale is frozen. '
             + 'Unpublish it first if the levels genuinely need to change — '
             + 'assets rated against it will be re-derived.',
      });
    next();
  } catch (err) { next(err); }
}

async function requirePublishRoleForTable(req, res, next) {
  try {
    const { rows } = await query('SELECT scope FROM impact_tables WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const { scope } = rows[0];
    const allowed = scope === 'organisation'
      ? ['ciso', 'siro', 'admin']
      : ['information_asset_manager', 'ciso', 'admin'];
    if (!allowed.includes(req.user.role))
      return res.status(403).json({ error: `${scope} table publication requires role: ${allowed.join(' or ')}` });
    next();
  } catch (err) { next(err); }
}

// ── GET /bil/reference ────────────────────────────────────────────────────────

router.get('/reference', canView, async (req, res, next) => {
  try {
    const { rows: cats } = await query(
      `SELECT bc.id, bc.name, bc.display_order,
              json_agg(
                json_build_object(
                  'id',            bs.id,
                  'name',          bs.name,
                  'display_order', bs.display_order,
                  'levels',        (
                    SELECT json_agg(
                      json_build_object('level', r.level, 'description', r.description)
                      ORDER BY r.level
                    )
                    FROM bil_reference_levels r WHERE r.subcategory_id = bs.id
                  )
                )
                ORDER BY bs.display_order
              ) AS subcategories
       FROM bil_categories bc
       JOIN bil_subcategories bs ON bs.category_id = bc.id
       JOIN org_config oc ON bc.org_type = oc.org_type
       GROUP BY bc.id
       ORDER BY bc.display_order`
    );
    res.json(cats);
  } catch (err) { next(err); }
});

// ── GET /bil/impact-tables[?dept_id=:deptId] ─────────────────────────────────

router.get('/impact-tables', canView, async (req, res, next) => {
  try {
    const BASE = `SELECT it.id, it.name, it.scope, it.department_id,
                         it.published_at, it.mandatory,
                         d.name AS department_name,
                         it.created_at, it.updated_at
                  FROM impact_tables it
                  LEFT JOIN departments d ON d.id = it.department_id`;

    let rows;
    if (req.query.dept_id) {
      ({ rows } = await query(
        `${BASE} WHERE it.department_id = $1 OR it.scope = 'organisation'
         ORDER BY it.scope DESC, it.name`,
        [req.query.dept_id]
      ));
    } else if (['admin', 'ciso'].includes(req.user.role)) {
      ({ rows } = await query(`${BASE} ORDER BY it.scope DESC, it.name`));
    } else {
      ({ rows } = await query(
        `${BASE} WHERE it.scope = 'organisation'
            OR it.department_id = (SELECT department_id FROM users WHERE id = $1)
         ORDER BY it.scope DESC, it.name`,
        [req.user.id]
      ));
    }
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /bil/impact-tables ───────────────────────────────────────────────────

router.post('/impact-tables', canEdit, async (req, res, next) => {
  try {
    const { name, description, scope, department_id } = req.body;
    if (!name || !scope) return res.status(400).json({ error: 'name and scope are required' });
    if (!['organisation', 'department'].includes(scope))
      return res.status(400).json({ error: 'scope must be organisation or department' });
    if (scope === 'organisation' && !['ciso', 'siro', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'only ciso, siro or admin can create organisation-scope tables' });

    // Every table has an owning department, at either scope (v102). `scope`
    // says how far the table reaches; department_id says who is accountable
    // for it. An organisation-scope table applies to everyone but is still
    // owned by someone — usually the CISO's department, which is where the
    // creator of an org-scope table sits, since only ciso/siro/admin may make
    // one. Falling back to the creator's own department keeps that true
    // without asking them to restate it.
    const dept = department_id
      || (await query('SELECT department_id FROM users WHERE id=$1', [req.user.id])).rows[0]?.department_id;

    if (!dept) {
      return res.status(400).json({
        error: scope === 'department'
          ? 'department_id required for department-scope tables'
          : 'department_id required — an organisation-scope table still needs an owning department, and your account has none',
      });
    }

    await query('BEGIN');

    const { rows } = await query(
      `INSERT INTO impact_tables (name, description, scope, department_id, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description || null, scope, dept, req.user.id]
    );

    const tableId = rows[0].id;

    await query(
      `INSERT INTO impact_table_bil_levels (impact_table_id, level)
       SELECT $1, s FROM generate_series(1, 5) s`,
      [tableId]
    );

    await query(
      `INSERT INTO impact_table_cia_levels (impact_table_id, level, dimension)
       SELECT $1, s, d
       FROM generate_series(1, 5) s
       CROSS JOIN (VALUES ('c'::CHAR(1)), ('i'::CHAR(1)), ('a'::CHAR(1))) dims(d)`,
      [tableId]
    );

    await query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    next(err);
  }
});

// ── GET /bil/impact-tables/:id ────────────────────────────────────────────────

router.get('/impact-tables/:id', canView, async (req, res, next) => {
  try {
    const { rows: tables } = await query(
      `SELECT it.*, d.name AS department_name,
              -- Ratings live on information ASSETS (v61 — services are never
              -- rated directly). Counting the retired service_impact_ratings
              -- here always reported 0.
              (SELECT COUNT(*)::int FROM asset_impact_ratings air WHERE air.impact_table_id = it.id) AS rating_count
       FROM impact_tables it LEFT JOIN departments d ON d.id = it.department_id
       WHERE it.id = $1`,
      [req.params.id]
    );
    if (!tables.length) return res.status(404).json({ error: 'Not found' });

    const { rows: bilLevels } = await query(
      `SELECT level, statement, updated_at
       FROM impact_table_bil_levels WHERE impact_table_id = $1 ORDER BY level`,
      [req.params.id]
    );

    const { rows: ciaLevels } = await query(
      `SELECT level, dimension, statement, updated_at
       FROM impact_table_cia_levels WHERE impact_table_id = $1 ORDER BY level, dimension`,
      [req.params.id]
    );

    res.json({ ...tables[0], bil_levels: bilLevels, cia_levels: ciaLevels });
  } catch (err) { next(err); }
});

// ── PUT /bil/impact-tables/:id ────────────────────────────────────────────────

router.put('/impact-tables/:id', canEdit, denyIAMOnOrgScope, seatScopeTable, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      `UPDATE impact_tables SET name=$1, description=$2 WHERE id=$3 RETURNING *`,
      [name, description ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PUT /bil/impact-tables/:id/bil-levels ─────────────────────────────────────
// Body: { levels: [{level, statement}] }

router.put('/impact-tables/:id/bil-levels', canEdit, denyIAMOnOrgScope, seatScopeTable, requireUnpublished, async (req, res, next) => {
  try {
    const tableId = parseInt(req.params.id, 10);
    const { levels } = req.body;
    if (!Array.isArray(levels) || !levels.length)
      return res.status(400).json({ error: 'levels array is required' });

    // Check before we write — if any BIL statement already exists this is an
    // edit, not first-time creation, so CIA propagation should be skipped.
    const { rows: priorBil } = await query(
      `SELECT 1 FROM impact_table_bil_levels
       WHERE impact_table_id = $1
         AND statement IS NOT NULL AND statement <> ''
       LIMIT 1`,
      [tableId]
    );
    const isFirstSave = priorBil.length === 0;

    await query('BEGIN');
    for (const l of levels) {
      if (l.level < 1 || l.level > 5)
        return res.status(400).json({ error: 'each level must be between 1 and 5' });
      await query(
        `INSERT INTO impact_table_bil_levels (impact_table_id, level, statement, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (impact_table_id, level)
         DO UPDATE SET statement  = EXCLUDED.statement,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()`,
        [tableId, l.level, l.statement || null, req.user.id]
      );
    }

    if (isFirstSave) {
      await query(
        `INSERT INTO impact_table_cia_levels
           (impact_table_id, level, dimension, statement, updated_by, updated_at)
         SELECT $1, bl.level, d.dim, bl.statement, $2, now()
         FROM impact_table_bil_levels bl
         CROSS JOIN (VALUES ('c'::char), ('i'::char), ('a'::char)) d(dim)
         WHERE bl.impact_table_id = $1
           AND (bl.statement IS NOT NULL AND bl.statement <> '')
         ON CONFLICT (impact_table_id, level, dimension)
         DO UPDATE SET statement  = EXCLUDED.statement,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()
         WHERE COALESCE(impact_table_cia_levels.statement, '') = ''`,
        [tableId, req.user.id]
      );
    }

    await query('COMMIT');

    const { rows } = await query(
      `SELECT level, statement, updated_at FROM impact_table_bil_levels
       WHERE impact_table_id = $1 ORDER BY level`,
      [tableId]
    );
    res.json(rows);
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    next(err);
  }
});

// ── PUT /bil/impact-tables/:id/cia-levels ─────────────────────────────────────
// Body: { levels: [{level, dimension, statement}] }

router.put('/impact-tables/:id/cia-levels', canEdit, denyIAMOnOrgScope, seatScopeTable, requireUnpublished, async (req, res, next) => {
  try {
    const tableId = parseInt(req.params.id, 10);
    const { levels } = req.body;
    if (!Array.isArray(levels) || !levels.length)
      return res.status(400).json({ error: 'levels array is required' });

    await query('BEGIN');
    for (const l of levels) {
      if (l.level < 1 || l.level > 5)
        return res.status(400).json({ error: 'each level must be between 1 and 5' });
      if (!['c', 'i', 'a'].includes(l.dimension))
        return res.status(400).json({ error: 'each dimension must be c, i, or a' });
      await query(
        `INSERT INTO impact_table_cia_levels (impact_table_id, level, dimension, statement, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (impact_table_id, level, dimension)
         DO UPDATE SET statement  = EXCLUDED.statement,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()`,
        [tableId, l.level, l.dimension, l.statement || null, req.user.id]
      );
    }
    await query('COMMIT');

    // Re-derive every asset rated against this table. A dimension contributes
    // only when the table has a non-empty statement at the asset's rated level,
    // so adding or clearing a statement changes the asset's C/I/A — and, through
    // the system and risk triggers, everything downstream. Without this the
    // register keeps scores the table no longer justifies.
    const { rows: rated } = await query(
      'SELECT DISTINCT asset_id FROM asset_impact_ratings WHERE impact_table_id = $1',
      [tableId]
    );
    for (const r of rated) await recomputeAssetCia(r.asset_id, req.user.id);

    const { rows } = await query(
      `SELECT level, dimension, statement, updated_at FROM impact_table_cia_levels
       WHERE impact_table_id = $1 ORDER BY level, dimension`,
      [tableId]
    );
    res.json(rows);
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    next(err);
  }
});

// NOTE: `PUT /bil/impact-tables/:id/rows/:rowId/cia` used to live here. It wrote
// to `impact_row_cia_analysis` and `impact_table_custom_subcategories`, both of
// which v38 DROPPED — the table does not exist in any live database, so the
// route could only ever 500. Removed rather than repaired: the per-dimension
// applicability it modelled is now expressed by whether a CIA level statement
// is present at all (see the publish rule below and recomputeAssetCia).

// ── DELETE /bil/impact-tables/:id ─────────────────────────────────────────────
// Blocked if mandatory=true. Cascade removes bil_levels, cia_levels, ratings.

router.delete('/impact-tables/:id', canEdit, denyIAMOnOrgScope, seatScopeTable, async (req, res, next) => {
  try {
    const tableId = parseInt(req.params.id, 10);

    const { rows: tbl } = await query(
      'SELECT mandatory FROM impact_tables WHERE id=$1',
      [tableId]
    );
    if (!tbl.length) return res.status(404).json({ error: 'Not found' });
    if (tbl[0].mandatory)
      return res.status(409).json({ error: 'Cannot delete a mandatory table — remove mandatory status first.' });

    // Count the ratings this delete will cascade away BEFORE removing the table.
    // This counted service_impact_ratings, which has been empty since v61, so it
    // always answered 0 while real asset ratings were being destroyed silently.
    const { rows: rc } = await query(
      'SELECT COUNT(*)::int AS count FROM asset_impact_ratings WHERE impact_table_id=$1',
      [tableId]
    );

    await query('DELETE FROM impact_tables WHERE id=$1', [tableId]);
    res.json({ deleted: true, ratings_removed: rc[0].count });
  } catch (err) { next(err); }
});

// ── POST /bil/impact-tables/:id/publish ───────────────────────────────────────

router.post('/impact-tables/:id/publish', requirePublishRoleForTable, seatScopeTable, async (req, res, next) => {
  try {
    const tableId = parseInt(req.params.id, 10);

    const { rows: tbl } = await query(
      'SELECT id, published_at FROM impact_tables WHERE id=$1',
      [tableId]
    );
    if (!tbl.length) return res.status(404).json({ error: 'Not found' });

    // Publishable when every dimension the author has DESCRIBED is described
    // completely — all five levels — and at least one dimension is described.
    //
    // A blank dimension is not an omission, it is a statement: "this dimension
    // carries no impact for this subject area", which is common and correct
    // (availability-only for a supply table, confidentiality-only for a privacy
    // one). The model already reads it that way — recomputeAssetCia only lets a
    // dimension contribute to an asset's C/I/A when the table has a NON-EMPTY
    // statement at the rated level, so a blank dimension simply does not
    // participate and floors to 1. Ten of the seeded Misty Isles tables cover
    // one or two dimensions for exactly this reason.
    //
    // The rule this replaced demanded a statement in every one of the fifteen
    // rows that POST seeds, which forced authors to type "n/a" — the single
    // worst answer available, because "n/a" is a non-empty string and therefore
    // makes the dimension inherit the rated level. It silently INFLATED the
    // score of every asset rated against the table, which is the opposite of
    // what the author meant.
    //
    // A PARTIALLY described dimension is the real error, and the old rule could
    // not see it: with levels 1–3 written and 4–5 blank, an asset's score for
    // that dimension would depend on which level it happened to be rated at.
    const { rows: partial } = await query(
      `SELECT dimension,
              count(*) FILTER (WHERE btrim(COALESCE(statement, '')) <> '') AS filled
         FROM impact_table_cia_levels
        WHERE impact_table_id = $1
        GROUP BY dimension
       HAVING count(*) FILTER (WHERE btrim(COALESCE(statement, '')) <> '') NOT IN (0, 5)
        ORDER BY dimension`,
      [tableId]
    );
    if (partial.length)
      return res.status(422).json({
        error: 'Each dimension must be described at all five levels or left entirely blank. '
             + partial.map(p => `${p.dimension.toUpperCase()} has ${p.filled} of 5`).join('; ')
             + '. Leave a dimension blank if it carries no impact here — do not write "n/a".',
        partial,
      });

    const { rows: described } = await query(
      `SELECT count(DISTINCT dimension) AS n
         FROM impact_table_cia_levels
        WHERE impact_table_id = $1
          AND btrim(COALESCE(statement, '')) <> ''`,
      [tableId]
    );
    if (parseInt(described[0].n, 10) === 0)
      return res.status(422).json({
        error: 'At least one CIA dimension must be described before publishing.',
      });

    const { rows: updated } = await query(
      `UPDATE impact_tables
       SET published_at = COALESCE(published_at, now()),
           published_by = COALESCE(published_by, $2)
       WHERE id = $1 RETURNING *`,
      [tableId, req.user.id]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// ── POST /bil/impact-tables/:id/unpublish ─────────────────────────────────────
// The counterpart to publish, and the only way to edit a published table's
// scale. Deliberately an explicit act by someone with publication authority for
// that scope: unpublishing takes a scale others are rating against out of
// service.
//
// Refuses while the table is MANDATORY — the mandatory_requires_publish CHECK
// would reject the UPDATE anyway, and "clear mandatory first" is a clearer
// answer than a constraint violation.

router.post('/impact-tables/:id/unpublish', requirePublishRoleForTable, seatScopeTable, async (req, res, next) => {
  try {
    const tableId = parseInt(req.params.id, 10);
    const { rows: tbl } = await query(
      'SELECT id, published_at, mandatory FROM impact_tables WHERE id=$1', [tableId]);
    if (!tbl.length) return res.status(404).json({ error: 'Not found' });
    if (!tbl[0].published_at)
      return res.status(409).json({ error: 'This impact table is not published.' });
    if (tbl[0].mandatory)
      return res.status(409).json({
        error: 'A mandatory impact table cannot be unpublished — clear its mandatory status first.',
      });

    const { rows } = await query(
      `UPDATE impact_tables
          SET published_at = NULL, published_by = NULL, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [tableId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /bil/impact-tables/:id/mandatory ────────────────────────────────────

router.patch('/impact-tables/:id/mandatory', requireCapability('bil.mandatory'), async (req, res, next) => {
  try {
    const { mandatory } = req.body;
    if (typeof mandatory !== 'boolean')
      return res.status(400).json({ error: 'mandatory must be a boolean' });

    const tableId = parseInt(req.params.id, 10);

    const { rows: tbl } = await query(
      'SELECT id, scope, published_at, mandatory FROM impact_tables WHERE id=$1',
      [tableId]
    );
    if (!tbl.length) return res.status(404).json({ error: 'Not found' });
    if (tbl[0].scope !== 'organisation')
      return res.status(400).json({ error: 'Only organisation-scope tables can be made mandatory' });
    if (mandatory && !tbl[0].published_at)
      return res.status(422).json({ error: 'Table must be published before it can be made mandatory' });

    await query('BEGIN');

    const { rows: updated } = await query(
      'UPDATE impact_tables SET mandatory=$1 WHERE id=$2 RETURNING *',
      [mandatory, tableId]
    );

    // Marking a table mandatory used to broadcast a link row to every active
    // service (business_service_impact_tables, dropped in v99). Those links fed
    // no score — a service's C/I/A is MAX over its assets — so the broadcast
    // only inflated a list and drove a "without impact table" prompt that
    // changed nothing. Mandatory now means what it says on the table itself.

    await query('COMMIT');
    res.json(updated[0]);
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    next(err);
  }
});

module.exports = router;
