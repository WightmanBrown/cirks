'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const requireRole  = require('../../middleware/requireRole');
const { requireCapability, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { assertWriteScope } = require('../../auth/scoping');
const { query, withActor }    = require('../../db/pool');

const router = Router();
router.use(authenticate);

const canView   = requireCapability('services.read');
const canEdit   = requireCapability('services.write');
const canDelete = requireCapability('services.delete');
const canCreate = requireCapability('services.write');
const canAdopt  = requireCapability('services.adopt');

// Max CIA over the assets THIS SERVICE'S DEPARTMENT holds in the systems it
// uses (v104). Deliberately not MAX over the systems' own impact: that is a
// whole-system figure across every department, so MIGNet at 5/5/5 would flatten
// every service to 5/5/5. Mirrors recompute_service_impact exactly — see
// docs/business-service-model.md.
const ASSET_CIA_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT MAX(ia.confidentiality) AS c_max,
           MAX(ia.integrity)       AS i_max,
           MAX(ia.availability)    AS a_max
    FROM business_service_systems bss_cia
    JOIN system_assets      sa_cia ON sa_cia.system_id = bss_cia.system_id
    JOIN information_assets ia     ON ia.id = sa_cia.asset_id AND ia.is_active = TRUE
    WHERE bss_cia.service_id = bs.id
      AND (ia.department_id = bs.department_id OR ia.is_shared)
  ) asset_cia ON TRUE`;

// Worst active risk on the systems this service uses — one hop (v104).
// The old path went service → assets → EVERY system holding those assets →
// risks, so a service inherited risks from systems it had nothing to do with;
// 30 of 31 assets sit in more than one system, so that was not a corner case.
const RISK_LEVEL_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT MAX(r.risk_score) AS max_risk_score
    FROM business_service_systems bss_rl
    JOIN risks r ON r.system_id = bss_rl.system_id AND r.is_active = TRUE
    WHERE bss_rl.service_id = bs.id
  ) risk_rollup ON TRUE`;

// Shared SELECT fragment for list queries.
// effective_c/i/a = the service's stored CIA, maintained by the
// recompute_service_impact() trigger (v61) as the MAX over linked information
// assets. cia_source is 'assets' when any value is present, else 'none'.
const LIST_COLS = `
  bs.id, bs.name, bs.description, bs.department_id,
  d.name  AS department_name,
  bs.is_shared, bs.owner_department_id,
  od.name AS owner_department_name,
  -- Owner (IAO) / Manager (IAM) derived from the owning department,
  -- consistent with the systems + assets list endpoints.
  (SELECT STRING_AGG(u.full_name, ', ' ORDER BY u.full_name)
     FROM users u
    WHERE u.department_id = bs.department_id
      AND u.role = 'information_asset_owner'
      AND u.is_active = TRUE
  ) AS iao_name,
  (SELECT STRING_AGG(u.full_name, ', ' ORDER BY u.full_name)
     FROM users u
    WHERE u.department_id = bs.department_id
      AND u.role = 'information_asset_manager'
      AND u.is_active = TRUE
  ) AS iam_name,
  -- The STORED manager. iam_name above is the department's role-holder,
  -- a different question: the list shows who is actually assigned. A
  -- service has no person OWNER (only owner_department_id), so the
  -- Owner column stays department-derived.
  (SELECT full_name FROM users mu WHERE mu.id = bs.managed_by_user_id) AS managed_by_name,
  (SELECT dd.name FROM departments dd JOIN users mu2 ON mu2.department_id = dd.id WHERE mu2.id = bs.managed_by_user_id) AS manager_department_name,
  bs.confidentiality, bs.integrity, bs.availability,
  asset_cia.c_max AS asset_c_max,
  asset_cia.i_max AS asset_i_max,
  asset_cia.a_max AS asset_a_max,
  bs.confidentiality AS effective_c,
  bs.integrity       AS effective_i,
  bs.availability    AS effective_a,
  CASE
    WHEN bs.confidentiality IS NULL AND bs.integrity IS NULL AND bs.availability IS NULL THEN 'none'
    ELSE 'assets'
  END AS cia_source,
  bs.is_active, bs.created_at,
  -- Derived (v99): a service has impact tables when its information assets are
  -- rated against some. The old stored link fed no score and was broadcast to
  -- every service whenever a table was made mandatory, so it was true almost
  -- everywhere and meant nothing.
  EXISTS (
    SELECT 1
      FROM business_service_systems bss_it
      JOIN system_assets sa_it ON sa_it.system_id = bss_it.system_id
      JOIN information_assets ia_it ON ia_it.id = sa_it.asset_id AND ia_it.is_active
      JOIN asset_impact_ratings air_it ON air_it.asset_id = ia_it.id
     WHERE bss_it.service_id = bs.id
       AND (ia_it.department_id = bs.department_id OR ia_it.is_shared)
  ) AS has_impact_tables,
  risk_rollup.max_risk_score`;

// GET /services[?for_dept=:deptId]
router.get('/', canView, async (req, res, next) => {
  try {
    // When department isolation is off (spreadsheet mode) there are no dept
    // walls — every role sees all services, exactly like the cross-dept roles.
    const isCrossDept = !isDepartmentIsolationEnabled()
      || ['admin', 'ciso', 'security_consultant', 'soc_analyst', 'security_architect'].includes(req.user.role);
    const canViewAny  = ['admin', 'security_consultant', 'ciso', 'risk_analyst', 'soc_analyst', 'security_architect'].includes(req.user.role);

    if (isCrossDept && !req.query.for_dept) {
      const { rows } = await query(
        `SELECT ${LIST_COLS},
                FALSE AS adopted
         FROM business_services bs
         JOIN departments d  ON d.id  = bs.department_id
         LEFT JOIN departments od ON od.id = bs.owner_department_id
         ${ASSET_CIA_LATERAL}
         ${RISK_LEVEL_LATERAL}
         WHERE bs.is_active = TRUE
         ORDER BY d.name, bs.name`
      );
      return res.json(rows);
    }

    let deptId;
    if (canViewAny && req.query.for_dept) {
      deptId = req.query.for_dept;
    } else {
      const { rows: u } = await query('SELECT department_id FROM users WHERE id=$1', [req.user.id]);
      deptId = u[0]?.department_id;
    }
    if (!deptId) return res.json([]);

    const { rows } = await query(
      `SELECT ${LIST_COLS},
              FALSE AS adopted
       FROM business_services bs
       JOIN departments d ON d.id = bs.department_id
       LEFT JOIN departments od ON od.id = bs.owner_department_id
       ${ASSET_CIA_LATERAL}
       ${RISK_LEVEL_LATERAL}
       WHERE bs.department_id = $1 AND bs.is_active = TRUE

       UNION ALL

       SELECT ${LIST_COLS},
              TRUE AS adopted
       FROM department_service_adoptions dsa
       JOIN business_services bs ON bs.id = dsa.service_id
       JOIN departments d ON d.id = bs.department_id
       LEFT JOIN departments od ON od.id = bs.owner_department_id
       ${ASSET_CIA_LATERAL}
       ${RISK_LEVEL_LATERAL}
       WHERE dsa.department_id = $1
         AND bs.is_active = TRUE
         AND bs.department_id != $1

       ORDER BY name`,
      [deptId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /services/shared[?for_dept=:deptId]
router.get('/shared', canView, async (req, res, next) => {
  try {
    const canViewAny = ['admin', 'security_consultant', 'ciso', 'risk_analyst', 'soc_analyst', 'security_architect'].includes(req.user.role);
    let deptId;
    if (canViewAny && req.query.for_dept) {
      deptId = req.query.for_dept;
    } else {
      const { rows: u } = await query('SELECT department_id FROM users WHERE id=$1', [req.user.id]);
      deptId = u[0]?.department_id;
    }
    const effectiveDept = deptId || '00000000-0000-0000-0000-000000000000';

    const { rows } = await query(
      `SELECT bs.id, bs.name, bs.description,
              bs.owner_department_id,
              d.name AS owner_department_name,
              bs.confidentiality, bs.integrity, bs.availability,
              asset_cia.c_max AS asset_c_max,
              asset_cia.i_max AS asset_i_max,
              asset_cia.a_max AS asset_a_max,
              bs.confidentiality AS effective_c,
              bs.integrity       AS effective_i,
              bs.availability    AS effective_a,
              EXISTS (
                SELECT 1
                  FROM business_service_systems bss_it
                  JOIN system_assets sa_it ON sa_it.system_id = bss_it.system_id
                  JOIN information_assets ia_it ON ia_it.id = sa_it.asset_id AND ia_it.is_active
                  JOIN asset_impact_ratings air_it ON air_it.asset_id = ia_it.id
                 WHERE bss_it.service_id = bs.id
                   AND (ia_it.department_id = bs.department_id OR ia_it.is_shared)
              ) AS has_impact_tables,
              EXISTS (
                SELECT 1 FROM department_service_adoptions dsa2
                WHERE dsa2.service_id = bs.id AND dsa2.department_id = $1
              ) AS already_adopted
       FROM business_services bs
       JOIN departments d ON d.id = bs.owner_department_id
       ${ASSET_CIA_LATERAL}
       ${RISK_LEVEL_LATERAL}
       WHERE bs.is_shared = TRUE
         AND bs.is_active = TRUE
         AND bs.owner_department_id != $1
       ORDER BY d.name, bs.name`,
      [effectiveDept]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /services
router.post('/', canCreate, async (req, res, next) => {
  try {
    const { name, description, is_shared, managed_by_user_id, department_id: bodyDeptId } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const canTargetAnyDept = ['admin', 'ciso', 'security_consultant'].includes(req.user.role);
    let deptId = canTargetAnyDept && bodyDeptId ? bodyDeptId : null;

    if (!deptId) {
      const { rows: u } = await query('SELECT department_id FROM users WHERE id=$1', [req.user.id]);
      deptId = u[0]?.department_id;
    }
    if (!deptId) return res.status(400).json({ error: 'department could not be determined' });

    // No transaction: this is a single statement, and the pool-level BEGIN that
    // used to be here was not one anyway — see the note in the transfer below.

    const { rows } = await query(
      `INSERT INTO business_services
         (name, description, department_id, owner_department_id, is_shared, managed_by_user_id)
       VALUES ($1, $2, $3, $3, $4, $5)
       RETURNING *`,
      [name, description || null, deptId, is_shared === true, managed_by_user_id || null]
    );

    // (v99) No impact-table links to attach — the tables relevant to a service
    // are derived on read from the assets linked to it.

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `"${req.body.name}" already exists in this department.` });
    next(err);
  }
});

// GET /services/:id — returns service with full impact_tables array (bil_levels, cia_levels, rating)
router.get('/:id', canView, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT bs.*,
              d.name  AS department_name,
              od.name AS owner_department_name,
              m.id    AS managed_by_id,
              m.full_name AS managed_by_name,
              (
                SELECT COALESCE(json_agg(tbl ORDER BY tbl.name), '[]'::json)
                FROM (
                  SELECT it.id, it.name, it.scope, it.department_id, it.mandatory, it.description,
                    (
                      SELECT COALESCE(json_agg(
                        json_build_object('level', bl.level, 'statement', bl.statement)
                        ORDER BY bl.level
                      ), '[]'::json)
                      FROM impact_table_bil_levels bl WHERE bl.impact_table_id = it.id
                    ) AS bil_levels,
                    (
                      SELECT COALESCE(json_agg(
                        json_build_object('level', cl.level, 'dimension', cl.dimension, 'statement', cl.statement)
                        ORDER BY cl.level, cl.dimension
                      ), '[]'::json)
                      FROM impact_table_cia_levels cl WHERE cl.impact_table_id = it.id
                    ) AS cia_levels,
                    -- Which of the service's assets bring this table in, and at
                    -- what level. A service is never rated itself (v61 — its
                    -- C/I/A is MAX over these assets), so this is the honest
                    -- answer to "which impact tables apply here": the ones its
                    -- assets are actually rated against.
                    (
                      SELECT COALESCE(json_agg(
                        json_build_object(
                          'asset_id',    ia2.id,
                          'asset_name',  ia2.name,
                          'rated_level', air2.rated_level,
                          'c_level',     air2.c_level,
                          'i_level',     air2.i_level,
                          'a_level',     air2.a_level
                        ) ORDER BY ia2.name
                      ), '[]'::json)
                      FROM business_service_systems bss2
                      JOIN system_assets sa2 ON sa2.system_id = bss2.system_id
                      JOIN information_assets ia2 ON ia2.id = sa2.asset_id AND ia2.is_active
                      JOIN asset_impact_ratings air2
                        ON air2.asset_id = ia2.id AND air2.impact_table_id = it.id
                      WHERE bss2.service_id = bs.id
                        AND (ia2.department_id = bs.department_id OR ia2.is_shared)
                    ) AS rated_by_assets
                  FROM impact_tables it
                  WHERE EXISTS (
                    SELECT 1
                      FROM business_service_systems bss3
                      JOIN system_assets sa3 ON sa3.system_id = bss3.system_id
                      JOIN information_assets ia3 ON ia3.id = sa3.asset_id AND ia3.is_active
                      JOIN asset_impact_ratings air3
                        ON air3.asset_id = ia3.id AND air3.impact_table_id = it.id
                     WHERE bss3.service_id = bs.id
                       AND (ia3.department_id = bs.department_id OR ia3.is_shared)
                  )
                ) tbl
              ) AS impact_tables,
              (
                -- DISTINCT is needed (an asset can sit in several of the
                -- service's systems) but json_agg(DISTINCT …) forbids an
                -- ORDER BY outside the argument list, so dedupe first and
                -- aggregate the rows.
                SELECT COALESCE(json_agg(a ORDER BY a.name), '[]'::json)
                FROM (
                  SELECT DISTINCT
                         ia.id,
                         ia.name,
                         ia.description,
                         ia.confidentiality,
                         ia.integrity,
                         ia.availability,
                         ia.is_shared,
                         ia.impact_changed_in_cycle,
                         iad.name AS department_name
                    FROM business_service_systems bss_a
                    JOIN system_assets sa_a ON sa_a.system_id = bss_a.system_id
                    JOIN information_assets ia ON ia.id = sa_a.asset_id AND ia.is_active = TRUE
                    LEFT JOIN departments iad ON iad.id = ia.department_id
                   WHERE bss_a.service_id = bs.id
                     AND (ia.department_id = bs.department_id OR ia.is_shared)
                ) a
              ) AS linked_information_assets,
              (
                SELECT COALESCE(json_agg(
                  json_build_object(
                    'id',              sysl.id,
                    'name',            sysl.name,
                    'description',     sysl.description,
                    'is_shared',       sysl.is_shared,
                    'department_id',   sysl.department_id,
                    'department_name', sysd.name,
                    'impact_c',        sysl.impact_c,
                    'impact_i',        sysl.impact_i,
                    'impact_a',        sysl.impact_a,
                    'own_asset_count', (
                      SELECT count(*)::int
                        FROM system_assets sa_l
                        JOIN information_assets ia_l ON ia_l.id = sa_l.asset_id AND ia_l.is_active
                       WHERE sa_l.system_id = sysl.id
                         AND (ia_l.department_id = bs.department_id OR ia_l.is_shared)
                    ),
                    'own_max_bil', (
                      SELECT MAX(GREATEST(ia_m.confidentiality, ia_m.integrity, ia_m.availability))
                        FROM system_assets sa_m
                        JOIN information_assets ia_m ON ia_m.id = sa_m.asset_id AND ia_m.is_active
                       WHERE sa_m.system_id = sysl.id
                         AND (ia_m.department_id = bs.department_id OR ia_m.is_shared)
                    ),
                    'max_risk_score', (
                      SELECT MAX(r_l.risk_score) FROM risks r_l
                       WHERE r_l.system_id = sysl.id AND r_l.is_active
                    )
                  ) ORDER BY sysl.name
                ), '[]'::json)
                FROM business_service_systems bss_s
                JOIN systems sysl ON sysl.id = bss_s.system_id AND sysl.is_active = TRUE
                LEFT JOIN departments sysd ON sysd.id = sysl.department_id
                WHERE bss_s.service_id = bs.id
              ) AS linked_systems,
              (
                SELECT COALESCE(json_agg(rp ORDER BY rp.risk_score DESC NULLS LAST), '[]'::json)
                FROM (
                  SELECT DISTINCT ON (ia3.id, sys.id, r.threat_id)
                         r.id            AS risk_id,
                         r.risk_score    AS risk_score,
                         ia3.id          AS asset_id,
                         ia3.name        AS asset_name,
                         sys.id          AS system_id,
                         sys.name        AS system_name,
                         t.id            AS threat_id,
                         t.name          AS threat_name
                  -- v104: one hop, service → its systems → their risks. The old
                  -- path went service → assets → EVERY system holding those
                  -- assets, so a service inherited risks from systems it had
                  -- nothing to do with. ia3 is now the asset the service holds
                  -- IN that system (department-filtered), for display only — it
                  -- no longer selects which risks appear.
                  FROM business_service_systems bss_p
                  JOIN systems sys ON sys.id = bss_p.system_id
                  JOIN risks r ON r.system_id = sys.id AND r.is_active = TRUE
                  JOIN threats t ON t.id = r.threat_id
                  LEFT JOIN system_assets sap ON sap.system_id = sys.id
                  LEFT JOIN information_assets ia3
                         ON ia3.id = sap.asset_id AND ia3.is_active = TRUE
                        AND (ia3.department_id = bs.department_id OR ia3.is_shared)
                  WHERE bss_p.service_id = bs.id
                  ORDER BY ia3.id, sys.id, r.threat_id, r.risk_score DESC NULLS LAST
                ) rp
              ) AS risk_paths,
              -- Q4/Q6: is anything being done, and how is it going? Actions
              -- reach a service the same way risks do — through its systems.
              -- Item counts are the progress measure because an action finishes
              -- when its last item completes (v97), so "3 of 5 items" is the
              -- honest state; the action's own status alone would not show
              -- movement between acceptance and completion.
              (
                SELECT COALESCE(json_agg(act ORDER BY act.target_date NULLS LAST, act.title), '[]'::json)
                FROM (
                  SELECT DISTINCT
                         sa.id,
                         sa.title,
                         sa.status::text  AS status,
                         sa.target_date,
                         sa.accepted_at,
                         ua.full_name     AS owner_name,
                         (SELECT count(*)::int FROM security_action_items i
                           WHERE i.action_id = sa.id) AS items_total,
                         (SELECT count(*)::int FROM security_action_items i
                           WHERE i.action_id = sa.id AND i.status = 'completed') AS items_completed,
                         (sa.target_date IS NOT NULL
                          AND sa.target_date < CURRENT_DATE
                          AND sa.status NOT IN ('completed','verified','cancelled','rejected')) AS overdue
                    FROM business_service_systems bss_x
                    JOIN risks rx ON rx.system_id = bss_x.system_id AND rx.is_active = TRUE
                    JOIN security_action_risks sar ON sar.risk_id = rx.id
                    JOIN security_actions sa ON sa.id = sar.action_id
                    LEFT JOIN users ua ON ua.id = sa.primary_owner_user_id
                   WHERE bss_x.service_id = bs.id
                ) act
              ) AS security_actions,
              -- Q5: the question the register cannot answer by omission. A risk
              -- counts as untreated when nothing is LIVE against it — proposed,
              -- planned or in_progress. Completed and cancelled actions do not
              -- count: if a completed action left the risk standing then nothing
              -- is being done about it NOW, which is the point of asking.
              (
                SELECT COALESCE(json_agg(un ORDER BY un.risk_score DESC NULLS LAST), '[]'::json)
                FROM (
                  SELECT DISTINCT
                         ry.id         AS risk_id,
                         ry.risk_score,
                         ty.name       AS threat_name,
                         sy.id         AS system_id,
                         sy.name       AS system_name
                    FROM business_service_systems bss_y
                    JOIN systems sy ON sy.id = bss_y.system_id
                    JOIN risks  ry ON ry.system_id = sy.id AND ry.is_active = TRUE
                    JOIN threats ty ON ty.id = ry.threat_id
                   WHERE bss_y.service_id = bs.id
                     AND NOT EXISTS (
                       SELECT 1
                         FROM security_action_risks sar2
                         JOIN security_actions sa2 ON sa2.id = sar2.action_id
                        WHERE sar2.risk_id = ry.id
                          AND sa2.status IN ('proposed','planned','in_progress')
                     )
                ) un
              ) AS untreated_risks,
              asset_cia_detail.c_max AS asset_c_max,
              asset_cia_detail.i_max AS asset_i_max,
              asset_cia_detail.a_max AS asset_a_max,
              bs.confidentiality AS effective_c,
              bs.integrity       AS effective_i,
              bs.availability    AS effective_a,
              CASE
                WHEN bs.confidentiality IS NULL AND bs.integrity IS NULL AND bs.availability IS NULL THEN 'none'
                ELSE 'assets'
              END AS cia_source
       FROM business_services bs
       JOIN departments d  ON d.id  = bs.department_id
       LEFT JOIN departments od ON od.id = bs.owner_department_id
       LEFT JOIN users       m  ON m.id  = bs.managed_by_user_id
       LEFT JOIN LATERAL (
         SELECT MAX(ia2.confidentiality) AS c_max,
                MAX(ia2.integrity)       AS i_max,
                MAX(ia2.availability)    AS a_max
         FROM business_service_systems bss_d
         JOIN system_assets sa_d ON sa_d.system_id = bss_d.system_id
         JOIN information_assets ia2 ON ia2.id = sa_d.asset_id AND ia2.is_active = TRUE
         WHERE bss_d.service_id = bs.id
           AND (ia2.department_id = bs.department_id OR ia2.is_shared)
       ) asset_cia_detail ON TRUE
       WHERE bs.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /services/:id/available-systems
// The picker. Returns every system the service could use, each carrying the
// number of assets THIS SERVICE'S DEPARTMENT holds in it — which is what lets
// the UI group the list by what a choice actually does:
//
//   own_asset_count > 0  → contributes impact AND probability
//   own_asset_count = 0  → contributes probability only (a dependency)
//
// That grouping is the linking discipline made visible at the moment of
// choosing, rather than left to the training material. See
// docs/business-service-model.md.
router.get('/:id/available-systems', canEdit, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT s.id, s.name, s.description, s.is_shared,
             s.department_id, d.name AS department_name,
             s.impact_c, s.impact_i, s.impact_a,
             (SELECT count(*)::int
                FROM system_assets sa
                JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active
               WHERE sa.system_id = s.id
                 AND (ia.department_id = bs.department_id OR ia.is_shared)
             ) AS own_asset_count,
             (SELECT MAX(GREATEST(ia.confidentiality, ia.integrity, ia.availability))
                FROM system_assets sa
                JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active
               WHERE sa.system_id = s.id
                 AND (ia.department_id = bs.department_id OR ia.is_shared)
             ) AS own_max_bil,
             (SELECT MAX(r.risk_score) FROM risks r
               WHERE r.system_id = s.id AND r.is_active) AS max_risk_score
        FROM systems s
        CROSS JOIN business_services bs
        LEFT JOIN departments d ON d.id = s.department_id
       WHERE bs.id = $1
         AND s.is_active = TRUE
         AND s.id NOT IN (SELECT system_id FROM business_service_systems WHERE service_id = $1)
       ORDER BY own_asset_count DESC, s.name
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /services/:id/systems
router.post('/:id/systems', canEdit, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'business_services', id: req.params.id });
    const { system_id } = req.body;
    if (!system_id) return res.status(400).json({ error: 'system_id is required.' });

    // The trigger on business_service_systems re-derives the service's impact.
    await query(
      `INSERT INTO business_service_systems (service_id, system_id, created_by)
       VALUES ($1, $2, $3) ON CONFLICT (service_id, system_id) DO NOTHING`,
      [req.params.id, system_id, req.user.id]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// DELETE /services/:id/systems/:sysId
router.delete('/:id/systems/:sysId', canEdit, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'business_services', id: req.params.id });
    await query(
      'DELETE FROM business_service_systems WHERE service_id = $1 AND system_id = $2',
      [req.params.id, req.params.sysId]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

router.put('/:id', canEdit, async (req, res, next) => {
  try {
    const { rows: svc } = await query(
      'SELECT owner_department_id FROM business_services WHERE id=$1', [req.params.id]
    );
    if (!svc.length) return res.status(404).json({ error: 'Not found' });

    const { rows: u } = await query('SELECT department_id FROM users WHERE id=$1', [req.user.id]);
    const canManageAnyDept = ['admin', 'ciso'].includes(req.user.role);
    if (!canManageAnyDept && u[0]?.department_id !== svc[0].owner_department_id)
      return res.status(403).json({ error: 'only the owning department can edit this service' });

    const { name, description, is_shared, rating_rationale, managed_by_user_id, department_id: newDeptId } = req.body;

    // managed_by_user_id was assigned unconditionally while every other column
    // here is COALESCEd, so any caller that omitted it CLEARED the service
    // manager. COALESCE alone will not do: the column is nullable and NULL is a
    // meaningful value — "no manager assigned" is a state a user can choose — so
    // absent and explicitly-null must stay distinguishable. $8 carries whether
    // the field was supplied at all; only then is $7 written.
    const managerSupplied = managed_by_user_id !== undefined;

    const { rows } = await query(
      `UPDATE business_services
       SET name                = COALESCE($1, name),
           description         = COALESCE($2, description),
           is_shared           = COALESCE($3, is_shared),
           rating_rationale    = COALESCE($4, rating_rationale),
           managed_by_user_id  = CASE WHEN $8 THEN $7 ELSE managed_by_user_id END,
           department_id       = COALESCE($6, department_id),
           owner_department_id = COALESCE($6, owner_department_id)
       WHERE id = $5 RETURNING *`,
      [name || null, description || null, is_shared ?? null, rating_rationale || null, req.params.id,
       canManageAnyDept && newDeptId ? newDeptId : null, managed_by_user_id || null, managerSupplied]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /services/:id/transfer — move service to a new department
router.post('/:id/transfer', requireCapability('services.transfer'), async (req, res, next) => {
  try {
    const { department_id: newDeptId } = req.body;
    if (!newDeptId) return res.status(400).json({ error: 'department_id is required.' });

    // Fetch current service
    const { rows: svcRows } = await query(
      `SELECT bs.id, bs.department_id, bs.owner_department_id,
              d.name AS department_name
       FROM business_services bs
       JOIN departments d ON d.id = bs.department_id
       WHERE bs.id = $1`,
      [req.params.id]
    );
    if (!svcRows.length) return res.status(404).json({ error: 'Not found.' });
    const svc = svcRows[0];

    if (svc.department_id === newDeptId)
      return res.status(400).json({ error: 'Service is already in that department.' });

    // Validate target department exists
    const { rows: deptRows } = await query(
      `SELECT id, name FROM departments WHERE id = $1`, [newDeptId]
    );
    if (!deptRows.length) return res.status(404).json({ error: 'Target department not found.' });

    // (v99) A transfer used to unlink the old department's dept-scoped tables.
    // With the stored link gone the question does not arise: the tables shown
    // for a service follow its assets, and those move with it.

    // Find departments that have adopted this service
    const { rows: adoptions } = await query(
      `SELECT d.name AS department_name
       FROM department_service_adoptions dsa
       JOIN departments d ON d.id = dsa.department_id
       WHERE dsa.service_id = $1`,
      [req.params.id]
    );

    // Execute transfer
    // This was `await query('BEGIN')` on the POOL, which is not a transaction:
    // query() checks out a connection per call, so BEGIN, the UPDATE and COMMIT
    // could each land on a different connection — an idle transaction left open
    // on one and an autocommitted UPDATE on another. Harmless only because the
    // body is a single statement, and a trap for whoever adds the second.
    //
    // withActor gives a real single-client transaction AND lets the v106 audit
    // trigger attribute the department change to whoever asked for it.
    const { rows: updated } = await withActor(req.user.id, (db) => db.query(
      `UPDATE business_services
          SET department_id = $1, owner_department_id = $1, updated_at = now()
        WHERE id = $2
        RETURNING *`,
      [newDeptId, req.params.id]
    ));

    res.json({
      service:            updated[0],
      from_department:    { id: svc.department_id,  name: svc.department_name },
      to_department:      { id: deptRows[0].id,     name: deptRows[0].name },
      adoptions_affected: adoptions,
    });
  } catch (err) { next(err); }
});

// DELETE /services/:id
router.delete('/:id', canDelete, async (req, res, next) => {
  try {
    const { rows: svc } = await query(
      'SELECT owner_department_id FROM business_services WHERE id=$1', [req.params.id]
    );
    if (!svc.length) return res.status(404).json({ error: 'Not found' });

    const { rows: u } = await query('SELECT department_id FROM users WHERE id=$1', [req.user.id]);
    const isOwner = u[0]?.department_id === svc[0].owner_department_id;
    if (!isOwner && req.user.role !== 'admin' && req.user.role !== 'security_consultant')
      return res.status(403).json({ error: 'Only the owning department can delete this service' });

    await query('DELETE FROM business_services WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST/DELETE /services/:id/impact-tables were removed in v99. A service's
// impact tables are no longer a thing you set — they are derived from the
// tables its information assets are rated against, and returned read-only by
// GET /services/:id. Rate the assets to change what appears here.

// POST /services/:id/adopt
router.post('/:id/adopt', requireRole('risk_analyst', 'ciso', 'information_asset_manager', 'admin', 'security_consultant'), async (req, res, next) => {
  try {
    const { rows: svc } = await query(
      'SELECT id, is_shared, owner_department_id FROM business_services WHERE id=$1 AND is_active=TRUE', [req.params.id]
    );
    if (!svc.length) return res.status(404).json({ error: 'Not found' });
    if (!svc[0].is_shared) return res.status(400).json({ error: 'Service is not marked as shared' });

    const canTargetAnyDept = ['admin', 'ciso', 'security_consultant'].includes(req.user.role);
    let deptId;
    if (canTargetAnyDept && req.body.department_id) {
      deptId = req.body.department_id;
    } else {
      const { rows: u } = await query('SELECT department_id FROM users WHERE id=$1', [req.user.id]);
      deptId = u[0]?.department_id;
    }
    if (!deptId) return res.status(400).json({ error: 'department could not be determined' });

    if (svc[0].owner_department_id === deptId)
      return res.status(400).json({ error: 'Cannot adopt a service owned by your own department' });

    await query(
      `INSERT INTO department_service_adoptions (department_id, service_id, adopted_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [deptId, req.params.id, req.user.id]
    );
    res.status(201).json({ adopted: true });
  } catch (err) { next(err); }
});

// DELETE /services/:id/adopt
router.delete('/:id/adopt', canAdopt, async (req, res, next) => {
  try {
    const { rows: u } = await query('SELECT department_id FROM users WHERE id=$1', [req.user.id]);
    await query(
      'DELETE FROM department_service_adoptions WHERE department_id=$1 AND service_id=$2',
      [u[0]?.department_id, req.params.id]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
