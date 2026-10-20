'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { assertWriteScope } = require('../../auth/scoping');
const { query, withActor }    = require('../../db/pool');
const { departmentIao, departmentIam } = require('../../lib/departmentRoles');

const router = Router();
router.use(authenticate);

// information_asset_owner can read their own dept's assets (DEPT_SCOPED filters automatically).
const canView   = requireCapability('assets.read');
const canCreate = requireCapability('assets.write');
const canAdmin  = requireCapability('assets.delete');

const DEPT_SCOPED = new Set(['information_asset_manager', 'information_asset_owner']);

// ── helpers ────────────────────────────────────────────────────────────────

// Shared with routes/bil, which must recompute when an impact table's level
// statements change. See recomputeAssetCia.js.
const { recomputeAssetCia } = require('./recomputeAssetCia');


// ── GET /assets ─────────────────────────────────────────────────────────────

router.get('/', canView, async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    const params = [];
    let deptFilter = '';

    // `?mine=1` asks for the caller's OWN assets regardless of the isolation
    // flag. Isolation off means "you may SEE everything" (a permission), not
    // "everything is yours" (ownership), and the dashboard's "My Information
    // Assets" widget asks the second — it was getting 44 for an IAO whose
    // department owns 5. Same expression as the isolation branch, so "mine"
    // cannot come to mean two different things depending on the mode.
    const mineOnly = req.query.mine === '1' || req.query.mine === 'true';

    if (mineOnly || (isDepartmentIsolationEnabled() && DEPT_SCOPED.has(role))) {
      const { rows: u } = await query('SELECT department_id FROM users WHERE id = $1', [userId]);
      const deptId = u[0]?.department_id;
      // No department means you own nothing, which is not the same as all.
      if (!deptId) return res.json([]);
      // own dept OR shared — matches the systems list (v67) and the seat model.
      deptFilter = 'AND (ia.department_id = $1 OR ia.is_shared = TRUE)';
      params.push(deptId);
    }

    // max_risk_score rolls up the MAX active risk score (1–25) across every
    // system this asset is linked to; the frontend derives the band.
    const { rows } = await query(`
      SELECT
        ia.id, ia.name, ia.description,
        ia.confidentiality, ia.integrity, ia.availability,
        ia.rating_method, ia.is_active, ia.is_shared, ia.created_at,
        d.id   AS department_id,
        d.name AS department_name,
        u.id        AS owner_id,
        u.full_name AS owner_name,
        m.id        AS manager_id,
        m.full_name AS manager_name,
        -- Owner (IAO) / Manager (IAM) derived from the owning department,
        -- consistent with the systems + services list endpoints.
        (SELECT STRING_AGG(du.full_name, ', ' ORDER BY du.full_name)
           FROM users du WHERE du.department_id = ia.department_id
             AND du.role = 'information_asset_owner' AND du.is_active = TRUE) AS iao_name,
        (SELECT STRING_AGG(du.full_name, ', ' ORDER BY du.full_name)
           FROM users du WHERE du.department_id = ia.department_id
             AND du.role = 'information_asset_manager' AND du.is_active = TRUE) AS iam_name,
        -- The STORED assignment. iao_name/iam_name above are the department's
        -- role-holders, which is a different question: the list shows who is
        -- actually assigned and marks where that is not the role-holder.
        m.full_name AS managed_by_name,
        (SELECT dd.name FROM departments dd WHERE dd.id = u.department_id) AS owner_department_name,
        (SELECT dd.name FROM departments dd WHERE dd.id = m.department_id) AS manager_department_name,
        COUNT(DISTINCT bs_svc.id)::int AS service_count,
        -- Rating completeness. A mandatory impact table applies to EVERY asset
        -- (decision 2026-09-16, docs/reporting-requirements.md), so coverage is
        -- a count against a fixed denominator rather than anything per-asset.
        --
        -- This matters beyond tidiness: recomputeAssetCia takes MAX over
        -- whatever ratings exist, so a missing mandatory table can only
        -- UNDERSTATE the asset's CIA — and that flows into systems.impact_* and
        -- every risk score on the system. An asset rated against something must
        -- not read as simply "rated" when a mandatory table is absent.
        -- Rated means a LEVEL: linking a table writes a level-less row, which
        -- contributes nothing to impact, so it counts as nothing here either —
        -- the same rule as v_asset_rating_findings (v134).
        (SELECT COUNT(*) FROM impact_tables mt WHERE mt.mandatory)::int
                                                          AS mandatory_tables_total,
        (SELECT COUNT(*) FROM impact_tables mt
          WHERE mt.mandatory
            AND EXISTS (SELECT 1 FROM asset_impact_ratings air
                         WHERE air.asset_id = ia.id AND air.impact_table_id = mt.id
                           AND COALESCE(air.rated_level, air.c_level, air.i_level, air.a_level) IS NOT NULL))::int
                                                          AS mandatory_tables_rated,
        (SELECT COUNT(*) FROM asset_impact_ratings air WHERE air.asset_id = ia.id)::int
                                                          AS rated_tables_total,
        rl.max_risk_score
      FROM information_assets ia
      LEFT JOIN departments d ON d.id = ia.department_id
      LEFT JOIN users u ON u.id = ia.owner_user_id
      LEFT JOIN users m ON m.id = ia.managed_by_user_id
      -- v104: a service links SYSTEMS, so the services an asset supports are
      -- derived — those on the systems holding it, whose department matches.
      LEFT JOIN system_assets sa_svc ON sa_svc.asset_id = ia.id
      LEFT JOIN business_service_systems bss ON bss.system_id = sa_svc.system_id
      LEFT JOIN business_services bs_svc ON bs_svc.id = bss.service_id
                AND (ia.department_id = bs_svc.department_id OR ia.is_shared)
      LEFT JOIN LATERAL (
        SELECT MAX(r.risk_score) AS max_risk_score
        FROM system_assets sa
        JOIN risks r ON r.system_id = sa.system_id AND r.is_active = TRUE
        WHERE sa.asset_id = ia.id
      ) rl ON TRUE
      WHERE ia.is_active = TRUE ${deptFilter}
      GROUP BY ia.id, d.id, d.name, u.id, u.full_name, m.id, m.full_name, rl.max_risk_score
      ORDER BY d.name, ia.name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /assets ─────────────────────────────────────────────────────────────

router.post('/', canCreate, async (req, res, next) => {
  try {
    const {
      name, description, department_id,
      owner_user_id, managed_by_user_id, rating_notes, is_shared,
    } = req.body;
    if (!name?.trim())   return res.status(400).json({ error: 'name is required.' });
    if (!department_id)  return res.status(400).json({ error: 'department_id is required.' });

    await query('BEGIN');

    // Owner (IAO) defaults to the department's Information Asset Owner — the
    // user holding that ROLE in the department, not `departments.owner_user_id`,
    // which is a denormalised copy that has already drifted (one department's
    // names a risk_analyst while its actual IAO is someone else). One helper for
    // systems and assets alike, so a third answer cannot appear.
    const ownerId = owner_user_id || await departmentIao(department_id);
    // Same rule as the owner, and the same bug it replaces: this used to fall
    // back to the creating user when they happened to be an IAM, so the manager
    // recorded who did the data entry rather than who manages the asset.
    const managerId = managed_by_user_id || await departmentIam(department_id);

    // C/I/A are derived from per-impact-table ratings (recomputeAssetCia), never
    // set directly on create. A new asset is unrated (NULL) until rated against
    // its impact tables.
    const { rows } = await query(
      `INSERT INTO information_assets
         (name, description, department_id,
          owner_user_id, managed_by_user_id, rating_notes, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        name.trim(), description || null, department_id,
        ownerId, managerId, rating_notes || null, is_shared === true,
      ]
    );
    const assetId = rows[0].id;

      // service_ids on create removed in v104: a service is composed of
      // SYSTEMS, so an asset joins a service by being placed in one of its
      // systems. Nothing to link from here.

    await query('COMMIT');
    res.status(201).json({ id: assetId });
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    next(err);
  }
});

// ── GET /assets/:id ──────────────────────────────────────────────────────────

router.get('/:id', canView, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        ia.id, ia.name, ia.description,
        ia.confidentiality, ia.integrity, ia.availability,
        ia.rating_method, ia.rating_notes, ia.is_active, ia.is_shared,
        ia.created_at, ia.updated_at,
        d.id   AS department_id,
        d.name AS department_name,
        u.id        AS owner_id,
        u.full_name AS owner_name,
        u.email     AS owner_email,
        m.id        AS manager_id,
        m.full_name AS manager_name,
        m.email     AS manager_email,
        rb.full_name AS rated_by_name,
        ia.rated_at,
        COALESCE(
          json_agg(DISTINCT
            jsonb_build_object('id', bs.id, 'name', bs.name, 'department_name', dept2.name)
          ) FILTER (WHERE bs.id IS NOT NULL),
          '[]'
        ) AS linked_services,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id',          it.id,
              'name',        it.name,
              'scope',       it.scope,
              'mandatory',   it.mandatory,
              'department_name', itd.name,
              'description', it.description,
              'bil_levels',  (
                SELECT COALESCE(json_agg(
                  json_build_object('level', bl.level, 'statement', bl.statement)
                  ORDER BY bl.level), '[]')
                FROM impact_table_bil_levels bl WHERE bl.impact_table_id = it.id
              ),
              'cia_levels',  (
                SELECT COALESCE(json_agg(
                  json_build_object('level', cl.level, 'dimension', cl.dimension, 'statement', cl.statement)
                  ORDER BY cl.level), '[]')
                FROM impact_table_cia_levels cl WHERE cl.impact_table_id = it.id
              ),
              'rating', json_build_object(
                'level',     air.rated_level,
                'c_level',   air.c_level,
                'i_level',   air.i_level,
                'a_level',   air.a_level,
                'c_dropped', air.c_dropped,
                'i_dropped', air.i_dropped,
                'a_dropped', air.a_dropped
              )
            ) ORDER BY it.name
          )
          FROM asset_impact_ratings air
          JOIN impact_tables it ON it.id = air.impact_table_id
          LEFT JOIN departments itd ON itd.id = it.department_id
          WHERE air.asset_id = ia.id
          ),
          '[]'
        ) AS impact_ratings,
        -- Risks reaching this asset: the active risks on the systems it belongs
        -- to. Shape mirrors services' risk_paths (no asset dimension — it IS the
        -- asset); the frontend renders these grouped by system.
        COALESCE(
          (SELECT json_agg(rp ORDER BY rp.risk_score DESC NULLS LAST)
           FROM (
             SELECT DISTINCT ON (sys.id, r.threat_id)
                    r.id         AS risk_id,
                    r.risk_score AS risk_score,
                    sys.id       AS system_id,
                    sys.name     AS system_name,
                    t.id         AS threat_id,
                    t.name       AS threat_name
             FROM system_assets sap
             JOIN systems sys ON sys.id = sap.system_id
             JOIN risks   r   ON r.system_id = sys.id AND r.is_active = TRUE
             JOIN threats t   ON t.id = r.threat_id
             WHERE sap.asset_id = ia.id
             ORDER BY sys.id, r.threat_id, r.risk_score DESC NULLS LAST
           ) rp
          ),
          '[]'
        ) AS risk_paths,
        -- The assurance finding on this asset, if it holds (v134), and the
        -- open action answering it — so the page offers to raise one only when
        -- there is none, and links to it when there is.
        (SELECT json_build_object('missing_table_names', f.missing_table_names,
                                  'missing_count', f.missing_count, 'band', f.band)
           FROM v_asset_rating_findings f WHERE f.asset_id = ia.id) AS rating_finding,
        (SELECT json_build_object('id', a.id, 'status', a.status, 'title', a.title)
           FROM security_actions a
          WHERE a.origin = 'rating_incomplete' AND a.subject_type = 'asset'
            AND a.subject_id = ia.id
            AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')) AS rating_action,
        -- ...or the acceptance of it (v136) — the other answer a finding can have.
        (SELECT json_build_object('id', e.id, 'expires_at', e.expires_at,
                                  'justification', e.justification, 'accepted_by_name', eu.full_name)
           FROM exceptions e LEFT JOIN users eu ON eu.id = e.accepted_by
          WHERE e.origin = 'rating_incomplete' AND e.subject_type = 'asset'
            AND e.subject_id = ia.id AND e.status = 'active') AS rating_exception
      FROM information_assets ia
      LEFT JOIN departments d ON d.id = ia.department_id
      LEFT JOIN users u ON u.id = ia.owner_user_id
      LEFT JOIN users m ON m.id = ia.managed_by_user_id
      LEFT JOIN users rb ON rb.id = ia.rated_by
      -- v104: derived via the systems holding this asset — see the list query.
      LEFT JOIN system_assets sa_svc ON sa_svc.asset_id = ia.id
      LEFT JOIN business_service_systems bss ON bss.system_id = sa_svc.system_id
      LEFT JOIN business_services bs ON bs.id = bss.service_id
                AND (ia.department_id = bs.department_id OR ia.is_shared)
      LEFT JOIN departments dept2 ON dept2.id = bs.department_id
      WHERE ia.id = $1
      GROUP BY ia.id, d.id, d.name, u.id, u.full_name, u.email, m.id, m.full_name, m.email, rb.full_name
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Asset not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PUT /assets/:id ──────────────────────────────────────────────────────────

router.put('/:id', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'information_assets', id: req.params.id });
    const {
      name, description, department_id,
      owner_user_id, managed_by_user_id, rating_notes, is_active, is_shared,
    } = req.body;
    if (!name?.trim())  return res.status(400).json({ error: 'name is required.' });
    if (!department_id) return res.status(400).json({ error: 'department_id is required.' });

    // C/I/A are derived from impact-table ratings (recomputeAssetCia) — the
    // edit form no longer sets them directly, so they are left untouched here.
    // Attributed, so the v106 audit trigger names who changed accountability.
    //
    // is_active and is_shared are both NOT NULL booleans, so COALESCE gives the
    // three-way behaviour a partial update needs: absent (undefined → NULL) keeps
    // the stored value, true and false are written as sent. is_active was
    // `is_active ?? true`, which silently REACTIVATED a deactivated asset for any
    // caller that did not send the field; is_shared was not writable at all, so
    // the flag could not be set from anywhere and the `OR ia.is_shared` branch in
    // the scoping and service-impact rules was unreachable.
    const { rowCount } = await withActor(req.user.id, (db) => db.query(
      `UPDATE information_assets SET
         name = $1, description = $2, department_id = $3,
         owner_user_id = $4, managed_by_user_id = $5, rating_notes = $6,
         is_active = COALESCE($7, is_active),
         is_shared = COALESCE($8, is_shared),
         updated_at = now()
       WHERE id = $9`,
      [
        name.trim(), description || null, department_id,
        owner_user_id || null, managed_by_user_id || null, rating_notes || null,
        is_active ?? null, is_shared ?? null,
        req.params.id,
      ]
    ));
    if (rowCount === 0) return res.status(404).json({ error: 'Asset not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── PUT /assets/:id/rate ──────────────────────────────────────────────────────

router.put('/:id/rate', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'information_assets', id: req.params.id });
    const { ratings } = req.body;
    if (!Array.isArray(ratings)) return res.status(400).json({ error: 'ratings array is required' });

    for (const r of ratings) {
      if (!r.impact_table_id || !r.level || r.level < 1 || r.level > 5)
        return res.status(400).json({ error: 'each rating needs impact_table_id and level 1–5' });
    }

    await query('BEGIN');

    for (const r of ratings) {
      await query(
        `INSERT INTO asset_impact_ratings
           (asset_id, impact_table_id, rated_level,
            c_level, i_level, a_level,
            c_dropped, i_dropped, a_dropped, rated_by, rated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (asset_id, impact_table_id)
         DO UPDATE SET rated_level = EXCLUDED.rated_level,
                       c_level     = EXCLUDED.c_level,
                       i_level     = EXCLUDED.i_level,
                       a_level     = EXCLUDED.a_level,
                       c_dropped   = EXCLUDED.c_dropped,
                       i_dropped   = EXCLUDED.i_dropped,
                       a_dropped   = EXCLUDED.a_dropped,
                       rated_by    = EXCLUDED.rated_by,
                       rated_at    = now()`,
        [
          req.params.id, r.impact_table_id, r.level,
          r.c_level ?? null, r.i_level ?? null, r.a_level ?? null,
          r.c_dropped ?? false, r.i_dropped ?? false, r.a_dropped ?? false,
          req.user.id,
        ]
      );
    }

    await recomputeAssetCia(req.params.id, req.user.id);
    await query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    next(err);
  }
});

// ── DELETE /assets/:id ────────────────────────────────────────────────────────

router.delete('/:id', canAdmin, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'information_assets', id: req.params.id });
    const { rowCount } = await query(
      `UPDATE information_assets SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Asset not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// NOTE: POST /assets/:id/services and DELETE /assets/:id/services/:sid were
// removed in v104. A service is composed of SYSTEMS, so an asset reaches a
// service by being in one of that service's systems — the relationship is
// derived, not curated, and there is nothing to link from this side. Use
// POST /systems/:id/information-assets to place the asset, and
// POST /services/:id/systems to compose the service.

router.get('/:id/suggested-impact-tables', canView, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT it.id, it.name, it.scope, it.department_id,
              d.name AS department_name, it.mandatory
           -- v104: a "sibling" is an asset sharing a SYSTEM with this one.
           -- Services no longer link assets, so sharing a service is itself
           -- derived from sharing a system; this removes the middle step and
           -- gives the same answer.
           FROM system_assets my
           JOIN system_assets sib
             ON sib.system_id = my.system_id AND sib.asset_id <> my.asset_id
         JOIN asset_impact_ratings air ON air.asset_id = sib.asset_id
         JOIN impact_tables it ON it.id = air.impact_table_id
         LEFT JOIN departments d ON d.id = it.department_id
        WHERE my.asset_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM asset_impact_ratings a2
             WHERE a2.asset_id = $1 AND a2.impact_table_id = it.id
          )
        ORDER BY it.scope DESC, it.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /assets/:id/impact-tables ───────────────────────────────────────────
// Link one or more impact tables to the asset (rated_level = NULL → "linked but
// unrated"). They then appear in the rating panel ready to be rated.

router.post('/:id/impact-tables', canCreate, async (req, res, next) => {
  try {
    const { table_ids } = req.body;
    if (!Array.isArray(table_ids) || !table_ids.length)
      return res.status(400).json({ error: 'table_ids array is required.' });

    await query('BEGIN');
    for (const tid of table_ids) {
      await query(
        `INSERT INTO asset_impact_ratings (asset_id, impact_table_id)
         VALUES ($1, $2) ON CONFLICT (asset_id, impact_table_id) DO NOTHING`,
        [req.params.id, tid]
      );
    }
    await query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    next(err);
  }
});

// ── DELETE /assets/:id/impact-tables/:tid ────────────────────────────────────
// Unlink an impact table from the asset. Only permitted while unrated, so a
// rating is never silently discarded.

router.delete('/:id/impact-tables/:tid', canCreate, async (req, res, next) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM asset_impact_ratings
        WHERE asset_id = $1 AND impact_table_id = $2 AND rated_level IS NULL`,
      [req.params.id, req.params.tid]
    );
    if (rowCount === 0)
      return res.status(409).json({ error: 'Table is rated — clear its rating before removing it.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
