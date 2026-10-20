'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { assertWriteScope } = require('../../auth/scoping');
const { provisionControlComponents } = require('../controls/provisionComponents');
const { query, withActor }    = require('../../db/pool');
const { departmentIao, departmentIam } = require('../../lib/departmentRoles');

const router = Router();
router.use(authenticate);
// v152: a write here can change what a security solution delivers.
router.use(require('../../middleware/settleAfterWrite'));

const canView   = requireCapability('systems.read');
const canCreate = requireCapability('systems.write');
const canAdmin  = requireCapability('systems.delete');

// information_asset_owner is dept-scoped: they see only their department's systems.
const DEPT_SCOPED = new Set(['information_asset_manager', 'information_asset_owner']);

// ── helpers ───────────────────────────────────────────────────────────────────

async function getUserDept(userId) {
  const { rows } = await query('SELECT department_id FROM users WHERE id = $1', [userId]);
  return rows[0]?.department_id ?? null;
}

// ── GET /systems ──────────────────────────────────────────────────────────────

router.get('/', canView, async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    // The viewer's own department is resolved unconditionally, because it is
    // needed for viewer_asset_count (below) whether or not isolation is on.
    // $1 is therefore always the viewer's department, possibly NULL.
    const deptId = await getUserDept(userId);
    const params = [deptId];
    let deptFilter = '';

    // `?mine=1` asks for the caller's OWN remit regardless of the isolation
    // flag. Those are different questions: isolation off means "you may SEE
    // everything" (a permission), not "everything is yours" (ownership). The
    // dashboard's "Systems in my remit" widget asks the second and was getting
    // the answer to the first — 51 systems for an IAO whose department owns 4.
    //
    // The expression is deliberately the SAME one the isolation branch uses, so
    // "mine" cannot come to mean two different things depending on the mode.
    const mineOnly = req.query.mine === '1' || req.query.mine === 'true';

    if (mineOnly || (isDepartmentIsolationEnabled() && DEPT_SCOPED.has(role))) {
      // No department means you own nothing, which is not the same as all.
      if (!deptId) return res.json([]);
      deptFilter = 'AND (s.department_id = $1 OR s.is_shared = TRUE)';
    }

    const { rows } = await query(`
      SELECT
        s.id, s.name, s.description,
        s.impact_c, s.impact_i, s.impact_a,
        s.impact_changed_in_cycle, s.is_shared, s.is_security_system,
        s.is_active, s.created_at,
        d.id   AS department_id,
        d.name AS department_name,
        u.id        AS owner_id,
        u.full_name AS owner_name,
        m.id        AS managed_by_id,
        m.full_name AS managed_by_name,
        -- The assignee's own department, so the list can mark an assignment
        -- that reaches outside the owning department — the anomaly worth
        -- seeing. Comparing against the department's IAO/IAM instead would
        -- flag almost every row: managed_by_user_id has historically been
        -- filled with the IAO, not the IAM.
        (SELECT dd.name FROM departments dd WHERE dd.id = u.department_id) AS owner_department_name,
        (SELECT dd.name FROM departments dd WHERE dd.id = m.department_id) AS manager_department_name,
        -- Owner (IAO) / Manager (IAM) are derived from the owning department,
        -- not the per-row owner_user_id/managed_by_user_id FKs (which are sparse
        -- and role-inconsistent). One IAO + one IAM per department in practice.
        (SELECT STRING_AGG(du.full_name, ', ' ORDER BY du.full_name)
           FROM users du WHERE du.department_id = s.department_id
             AND du.role = 'information_asset_owner' AND du.is_active = TRUE) AS iao_name,
        (SELECT STRING_AGG(du.full_name, ', ' ORDER BY du.full_name)
           FROM users du WHERE du.department_id = s.department_id
             AND du.role = 'information_asset_manager' AND du.is_active = TRUE) AS iam_name,
        -- Threats identified against this system that have not yet been
        -- assessed (no active risk for the pair). Surfaces the "identified but
        -- not yet assessed" state on the list, so the work is findable across
        -- the estate rather than only on each system's own page.
        (SELECT COUNT(*)::int FROM system_threats st
          WHERE st.system_id = s.id
            AND NOT EXISTS (SELECT 1 FROM risks r
                             WHERE r.system_id = st.system_id
                               AND r.threat_id = st.threat_id
                               AND r.is_active)) AS unassessed_threats,
        -- Of those, the ones that have outlived a full SWG cycle. The threshold
        -- is the organisation's OWN longest acceptable gap between reviews
        -- (org_config.meeting_max_interval_days), so an org that meets monthly
        -- gets a tighter definition of stale for free. Past that line the
        -- backlog can no longer be explained as "we haven't met yet".
        (SELECT COUNT(*)::int FROM system_threats st
          WHERE st.system_id = s.id
            AND st.added_at < now() - make_interval(days => (SELECT meeting_max_interval_days FROM org_config))
            AND NOT EXISTS (SELECT 1 FROM risks r
                             WHERE r.system_id = st.system_id
                               AND r.threat_id = st.threat_id
                               AND r.is_active)) AS stale_threats,
        -- The VIEWER's stake: how many active information assets their own
        -- department holds in this system (a shared asset counts for every
        -- department, as everywhere else in the model). A shared system being
        -- available to you is not the same as your information being in it —
        -- "My Systems" means the ones you own or actually hold something in.
        (SELECT COUNT(*)::int
           FROM system_assets vsa
           JOIN information_assets via ON via.id = vsa.asset_id AND via.is_active
          WHERE vsa.system_id = s.id
            AND (via.department_id = $1 OR via.is_shared)) AS viewer_asset_count,
        COUNT(DISTINCT sa.asset_id)::int     AS information_asset_count,
        COUNT(DISTINCT sc.component_id)::int AS component_count,
        rg.max_risk_score
      FROM systems s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN users u       ON u.id = s.owner_user_id
      LEFT JOIN users m       ON m.id = s.managed_by_user_id
      LEFT JOIN system_assets sa ON sa.system_id = s.id
      LEFT JOIN system_components sc ON sc.system_id = s.id
      LEFT JOIN LATERAL (
        SELECT MAX(g.risk_score) AS max_risk_score
        FROM v_system_risk_grid g
        WHERE g.system_id = s.id
          AND g.risk_score IS NOT NULL
      ) rg ON TRUE
      WHERE s.is_active = TRUE ${deptFilter}
      GROUP BY s.id, d.id, d.name, u.id, u.full_name, m.id, m.full_name, rg.max_risk_score
      ORDER BY d.name, s.name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /systems ─────────────────────────────────────────────────────────────

router.post('/', canCreate, async (req, res, next) => {
  try {
    const { name, description, department_id, owner_user_id, managed_by_user_id, is_shared, is_security_system } = req.body;
    if (!name?.trim())  return res.status(400).json({ error: 'name is required.' });

    const { id: userId } = req.user;

    // Use the provided dept, or fall back to the user's own department.
    let effectiveDeptId = department_id || (await getUserDept(userId));
    if (!effectiveDeptId) return res.status(400).json({ error: 'department_id is required and your account has no department assigned.' });

    const { rows } = await query(
      `INSERT INTO systems (name, description, department_id, owner_user_id, managed_by_user_id, is_shared, is_security_system)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [name.trim(), description?.trim() || null, effectiveDeptId, owner_user_id || await departmentIao(effectiveDeptId), managed_by_user_id || await departmentIam(effectiveDeptId), is_shared === true, is_security_system === true]
    );

    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

// ── GET /systems/:id ──────────────────────────────────────────────────────────

router.get('/:id', canView, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        s.id, s.name, s.description,
        s.impact_c, s.impact_i, s.impact_a, s.impact_set_at,
        s.impact_changed_in_cycle, s.is_shared, s.is_security_system,
        s.probability_c, s.probability_i, s.probability_a,
        s.is_active, s.created_at, s.updated_at,
        d.id   AS department_id,
        d.name AS department_name,
        u.id        AS owner_id,
        u.full_name AS owner_name,
        m.id        AS managed_by_id,
        m.full_name AS managed_by_name
      FROM systems s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN users u       ON u.id = s.owner_user_id
      LEFT JOIN users m       ON m.id = s.managed_by_user_id
      WHERE s.id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'System not found.' });
    const system = rows[0];

    // PPITF components grouped by type
    const { rows: components } = await query(`
      SELECT
        cc.id, cc.name, cc.description, cc.component_type, cc.status AS component_status,
        cc.instantiation,
        -- v137: an organisational component reads the catalogue's state here,
        -- the same on every system — its recorded row's own status is not used.
        sc.status AS system_status, sc.role, sc.added_at, sc.via AS delivered_via,
        -- Recorded on this system (a row in system_components), as opposed to an
        -- organisation-wide component only IMPLIED here by a control (v137). A
        -- recorded one — the system's network zone, its server room — is the
        -- system's own answer and can be removed; an implied one cannot.
        EXISTS (SELECT 1 FROM system_components x
                 WHERE x.system_id = $1 AND x.component_id = cc.id) AS recorded,
        EXISTS (
          SELECT 1 FROM system_controls syc
          JOIN control_component_links ccl ON ccl.control_id = syc.control_id
          WHERE syc.system_id = $1 AND ccl.component_id = cc.id
        ) AS via_control
      FROM v_component_presence sc
      JOIN control_components cc ON cc.id = sc.component_id
      WHERE sc.system_id = $1
      ORDER BY cc.component_type, cc.name
    `, [req.params.id]);

    // Components a control on this system is DELIVERED BY, which nobody has
    // recorded here (defect 1d). `provisionControlComponents` runs at attach
    // time only, so a control that gains a component in the catalogue afterwards
    // — or one attached before that code existed — leaves the system's record
    // incomplete, and this page read `FROM system_components` so the omission was
    // invisible. Meanwhile the coverage panel counts every one of them as a gap,
    // marking down every risk on the system: 373 of 425 operational controls on
    // CIRKS-test are "needs improvement" ONLY because of an absent component,
    // against 21 with a genuinely unhealthy one.
    //
    // DERIVED, never materialised. Writing the rows would invent a status for
    // 1,097 components nobody has looked at, and a component that is not
    // `operational` is a mandatory remediation candidate on every risk for the
    // system — so materialising would manufacture the very work it claims to
    // describe. The decision stays a human one; this only makes it visible.
    // v145/v148: an objective WITH security solutions asks only for the on-system
    // parts of the solution in use here — the one the system wants, else the one
    // in play (v_system_solutions_in_use, the same rule as the component-record
    // finding, so the page and the finding cannot disagree); one without
    // solutions keeps the library-list rule.
    const { rows: expectedComponents } = await query(`
      WITH wanted AS (
        SELECT ccl.component_id, c.title AS required_by
          FROM system_controls syc
          JOIN controls c ON c.id = syc.control_id
          JOIN control_component_links ccl ON ccl.control_id = syc.control_id
          JOIN control_components cc ON cc.id = ccl.component_id
         WHERE syc.system_id = $1
           AND syc.status <> 'not_applicable'
           -- An organisational component is present wherever it is implied (v137);
           -- only a per-system one can be missing from a system's record.
           AND cc.instantiation IS DISTINCT FROM 'organisational'
           AND NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = syc.control_id)
        UNION ALL
        SELECT pp.component_id, c.title || ' — ' || p.name
          FROM v_system_solutions_in_use u
          JOIN controls c ON c.id = u.control_id
          JOIN delivery_patterns p ON p.id = u.pattern_id
          JOIN delivery_pattern_parts pp ON pp.pattern_id = u.pattern_id AND pp.location = 'on_system'
         WHERE u.system_id = $1
      )
      SELECT cc.id, cc.name, cc.description, cc.component_type,
             cc.status AS component_status,
             ARRAY_AGG(DISTINCT w.required_by ORDER BY w.required_by) AS required_by
        FROM wanted w
        JOIN control_components cc ON cc.id = w.component_id
       WHERE NOT EXISTS (SELECT 1 FROM system_components x WHERE x.system_id = $1 AND x.component_id = cc.id)
       GROUP BY cc.id, cc.name, cc.description, cc.component_type, cc.status
       ORDER BY cc.component_type, cc.name
    `, [req.params.id]);

    // v145: how each per-system control is actually delivered here — the best
    // delivery pattern in play — beside its hand-set status. Report only.
    const { rows: controlDelivery } = await query(`
      SELECT d.control_id, d.marked_status, d.pattern_id, d.pattern_name, d.pattern_kind, d.delivery,
             d.degraded_parts, d.missing_parts, d.disagreement
        FROM v_system_control_delivery d
       WHERE d.system_id = $1 AND d.delivery IS NOT NULL`, [req.params.id]);

    // The component-record finding on this system (v138) — only per-system
    // components count — and whatever answers it: an open action or an
    // active acceptance.
    // v150/v152: bring this system's security record up to date before reading
    // it — a complete solution counted as chosen, implied objectives recorded,
    // each status set from its solution. Catches what no write announces, such
    // as a supplier's evidence expiring.
    await query('SELECT settle_system_security($1)', [req.params.id]);
    const { rows: [componentFinding] } = await query(`
      SELECT f.missing_count, f.missing_component_names, f.needed_count,
             f.missing_membership_names, f.unrecorded_objective_names,
             f.needs_solution_count, f.conflict_count,
             -- which objectives: a count alone cannot be acted on (owner, 2026-10-06)
             (SELECT COALESCE(json_agg(json_build_object('id', wc.id, 'title', wc.title, 'reference_code', wc.reference_code)
                                       ORDER BY wc.title), '[]')
                FROM v_system_wanted_objectives w JOIN controls wc ON wc.id = w.control_id
               WHERE w.system_id = f.system_id AND w.state = 'needs_solution') AS needs_solution_objectives,
             (SELECT COALESCE(json_agg(json_build_object('id', wc.id, 'title', wc.title, 'reference_code', wc.reference_code)
                                       ORDER BY wc.title), '[]')
                FROM v_system_wanted_objectives w JOIN controls wc ON wc.id = w.control_id
               WHERE w.system_id = f.system_id AND w.state = 'conflict') AS conflict_objectives,
             (SELECT json_build_object('id', a.id, 'status', a.status, 'title', a.title)
                FROM security_actions a
               WHERE a.origin = 'component_record' AND a.subject_id = f.system_id
                 AND a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')) AS action,
             (SELECT json_build_object('id', e.id, 'expires_at', e.expires_at,
                                       'justification', e.justification, 'accepted_by_name', eu.full_name)
                FROM exceptions e LEFT JOIN users eu ON eu.id = e.accepted_by
               WHERE e.origin = 'component_record' AND e.subject_id = f.system_id
                 AND e.status = 'active') AS exception
        FROM v_system_component_findings f WHERE f.system_id = $1
    `, [req.params.id]);

    // Linked information assets
    const { rows: informationAssets } = await query(`
      SELECT
        ia.id, ia.name, ia.description,
        ia.confidentiality, ia.integrity, ia.availability,
        ia.is_shared, ia.impact_changed_in_cycle,
        ia.department_id,
        d.name AS department_name,
        sa.created_at AS added_at
      FROM system_assets sa
      JOIN information_assets ia ON ia.id = sa.asset_id
      LEFT JOIN departments d ON d.id = ia.department_id
      WHERE sa.system_id = $1 AND ia.is_active = TRUE
      ORDER BY ia.name
    `, [req.params.id]);

    // Linked threats, each carrying its ASSESSMENT STATE. A threat linked to a
    // system is an identified exposure; it is only assessed once a risk exists
    // for that system × threat pair, scoring the effect of the system's controls.
    // Without this the two states are indistinguishable in the UI and an
    // identified-but-unassessed threat silently looks like finished work.
    const { rows: threats } = await query(`
      SELECT t.id, t.name, t.description, st.added_at,
             r.id                AS risk_id,
             r.risk_score,
             r.validation_status,
             (r.id IS NOT NULL)  AS assessed
      FROM system_threats st
      JOIN threats t ON t.id = st.threat_id
      LEFT JOIN risks r
             ON r.system_id = st.system_id AND r.threat_id = st.threat_id AND r.is_active
      WHERE st.system_id = $1
      ORDER BY (r.id IS NOT NULL), t.name
    `, [req.params.id]);

    // Highest-scoring active risk attached to this system
    const { rows: topRiskRows } = await query(`
      SELECT
        r.id           AS risk_id,
        r.risk_score,
        t.name         AS threat_name,
        t.description  AS threat_description
      FROM risks r
      JOIN threats t ON t.id = r.threat_id
      WHERE r.system_id = $1 AND r.is_active = TRUE
      ORDER BY r.risk_score DESC NULLS LAST, r.created_at DESC
      LIMIT 1
    `, [req.params.id]);

    // All active risks on this system, used to render the risk-path strip
    // (top-1) and the risk-path tree (full list) on the system summary card
    // and detail page. Shape mirrors services' risk_paths but with no asset
    // or upstream system — for a system the chain is just Threat → pill.
    const { rows: riskPaths } = await query(`
      SELECT
        r.id      AS risk_id,
        r.risk_score,
        t.id      AS threat_id,
        t.name    AS threat_name
      FROM risks r
      JOIN threats t ON t.id = r.threat_id
      WHERE r.system_id = $1 AND r.is_active = TRUE
      ORDER BY r.risk_score DESC NULLS LAST, r.created_at DESC
    `, [req.params.id]);

    // Risk counts split by validation status so the Risks tab can route the
    // user to the view that actually contains data, and so the UI can warn
    // when some risks live in the other view.
    const { rows: riskCountRows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE validation_status = 'validated')::int                 AS validated,
         COUNT(*) FILTER (WHERE validation_status IN ('pending', 'returned'))::int    AS pending,
         COUNT(*)::int                                                                AS total
       FROM risks
       WHERE system_id = $1 AND is_active = TRUE`,
      [req.params.id]
    );

    res.json({
      ...system,
      components,
      expected_components: expectedComponents,
      control_delivery: controlDelivery,
      component_finding: componentFinding || null,
      information_assets: informationAssets,
      threats,
      top_risk: topRiskRows[0] || null,
      risk_paths: riskPaths,
      risk_count:           riskCountRows[0]?.total     ?? 0,
      risk_count_validated: riskCountRows[0]?.validated ?? 0,
      risk_count_pending:   riskCountRows[0]?.pending   ?? 0,
    });
  } catch (err) { next(err); }
});

// ── PUT /systems/:id ──────────────────────────────────────────────────────────

router.put('/:id', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'systems', id: req.params.id });
    const { name, description, owner_user_id, managed_by_user_id, is_shared, is_security_system } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });

    // withActor so the v106 audit trigger can attribute an ownership change to
    // the person who made it. Without it the change is still recorded, but as
    // "unattributed" — the right answer for a repair script, the wrong one
    // for a request that knows exactly who is asking.
    // is_shared is PRESERVED when the field is absent, not coerced to false.
    // This wrote `is_shared === true` unconditionally, so a caller that omitted
    // the field — which the system detail page did — silently un-shared the
    // system on every name/description/owner edit. The flag is load-bearing:
    // it widens read scope and is what lets another department link its assets
    // into the system, so clearing it cuts those departments off with no
    // visible cause. NULL means "not supplied"; COALESCE keeps the stored value.
    const { rowCount } = await withActor(req.user.id, (db) => db.query(
      `UPDATE systems SET
         name = $1, description = $2, owner_user_id = $3, managed_by_user_id = $4,
         is_shared = COALESCE($5, is_shared),
         -- preserved when absent, like is_shared (v155)
         is_security_system = COALESCE($7, is_security_system), updated_at = now()
       WHERE id = $6 AND is_active = TRUE`,
      [name.trim(), description?.trim() || null, owner_user_id || null, managed_by_user_id || null,
       is_shared === undefined ? null : is_shared === true, req.params.id,
       is_security_system === undefined ? null : is_security_system === true]
    ));
    if (rowCount === 0) return res.status(404).json({ error: 'System not found.' });
    res.status(204).end();
  } catch (err) {
    // v155: a system a security solution still names cannot stop being a security system.
    if (err?.hint === 'security_system_relied_on') {
      return res.status(409).json({ code: 'security_system_relied_on',
        error: `${err.message[0].toUpperCase()}${err.message.slice(1)}. Remove it from those security solutions first.` });
    }
    next(err);
  }
});

// ── DELETE /systems/:id ───────────────────────────────────────────────────────

router.delete('/:id', canAdmin, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'systems', id: req.params.id });
    const { rowCount } = await query(
      `UPDATE systems SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'System not found.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /systems/:id/components ──────────────────────────────────────────────

router.post('/:id/components', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'systems', id: req.params.id });
    const { component_id, role } = req.body;
    if (!component_id) return res.status(400).json({ error: 'component_id is required.' });

    const { rows: cc } = await query(
      'SELECT id, name, component_type FROM control_components WHERE id = $1',
      [component_id]
    );
    if (!cc.length) return res.status(404).json({ error: 'Component not found.' });

    await query(
      `INSERT INTO system_components (system_id, component_id, role, added_by)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [req.params.id, component_id, role?.trim() || null, req.user.id]
    );
    res.status(201).json({ component: cc[0] });
  } catch (err) { next(err); }
});

// ── DELETE /systems/:id/components/:cid ───────────────────────────────────────

router.delete('/:id/components/:cid', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'systems', id: req.params.id });
    await query(
      'DELETE FROM system_components WHERE system_id = $1 AND component_id = $2',
      [req.params.id, req.params.cid]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /systems/:id/controls ─────────────────────────────────────────────────
// The system's control posture (control-maturity model): controls deployed on
// this system + their maturity. Independent of any risk/threat.
router.get('/:id/controls', canView, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT c.id, c.title, c.control_type, (SELECT vcs.status FROM v_control_status vcs WHERE vcs.control_id = c.id) AS objective_status,
             (SELECT s.code FROM control_mappings cm JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
              JOIN standards s ON s.id = sc2.standard_id WHERE cm.control_id = c.id
              ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework,
             (SELECT sc2.ref_code FROM control_mappings cm JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
              JOIN standards s ON s.id = sc2.standard_id WHERE cm.control_id = c.id
              ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework_ref,
             c.effectiveness AS maturity, c.delivery, sc.status, sc.provenance, sc.created_at
      FROM system_controls sc
      JOIN controls c ON c.id = sc.control_id
      WHERE sc.system_id = $1
      ORDER BY c.title ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /systems/:id/controls ────────────────────────────────────────────────
// Add a control to this system, or (re)rate its maturity (1–5, optional).
router.post('/:id/controls', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'systems', id: req.params.id });
    const { control_id } = req.body;
    if (!control_id) return res.status(400).json({ error: 'control_id is required.' });
    await query(
      `INSERT INTO system_controls (system_id, control_id, provenance, created_by)
       VALUES ($1, $2, 'recorded', $3)
       ON CONFLICT (system_id, control_id) DO UPDATE SET updated_at = now()`,
      [req.params.id, control_id, req.user.id]
    );
    // Provision the control's delivering components onto the system so their
    // per-system coverage/health is trackable (idempotent; never downgrades).
    await provisionControlComponents(req.params.id, control_id, req.user.id);
    res.status(201).end();
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Control or system not found.' });
    next(err);
  }
});

// ── DELETE /systems/:id/controls/:cid ─────────────────────────────────────────
router.delete('/:id/controls/:cid', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'systems', id: req.params.id });
    await query(
      'DELETE FROM system_controls WHERE system_id = $1 AND control_id = $2',
      [req.params.id, req.params.cid]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// Per-system status of a deployed control / component (per-system control &
// component status model — docs/per-system-control-status.md). The status is a
// per-system fact ("how is this doing on THIS system"), distinct from the
// control's org-wide maturity and the component's enterprise catalogue status.
const SYSTEM_ELEMENT_STATUSES = ['operational', 'degraded', 'missing', 'unknown', 'not_applicable'];

// ── PATCH /systems/:id/controls/:cid  { status, exclusion_reason? } ───────────
// `not_applicable` says the control treats the threat but is inappropriate on
// THIS system — a judgement an auditor will ask about, so it requires a reason
// (0118). The DB enforces the pairing either way; rejecting it here turns a
// constraint violation into the 400 it actually is. Re-including clears the
// reason, because a stale justification on a live control reads as current.
router.patch('/:id/controls/:cid', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'systems', id: req.params.id });
    const { status } = req.body;
    if (!SYSTEM_ELEMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${SYSTEM_ELEMENT_STATUSES.join(', ')}.` });
    }
    const excluding = status === 'not_applicable';
    // v152: an objective delivered per system has a status that FOLLOWS its
    // security solution and cannot be set by hand; since v159 that includes an
    // objective with no solution, which reads missing. Two acts remain a
    // person's: excluding it here (with a reason), and lifting an exclusion —
    // after which the status is derived again, whatever value was sent.
    if (!excluding) {
      const { rows: [d] } = await query(`
        SELECT sc.status::text AS status, v.pattern_name, v.delivery
          FROM system_controls sc
          JOIN controls c ON c.id = sc.control_id AND c.delivery = 'system'
          LEFT JOIN v_system_control_delivery v
            ON v.system_id = sc.system_id AND v.control_id = sc.control_id
         WHERE sc.system_id = $1 AND sc.control_id = $2`, [req.params.id, req.params.cid]);
      if (d && d.status !== 'not_applicable') {
        return res.status(409).json({
          code: 'status_follows_solution',
          error: !d.delivery
            ? 'No security solution delivers this control objective, so it is missing on every system that records it. Give it a security solution (Security solutions), or mark it not applicable here with a reason.'
            : d.delivery === 'no_pattern_in_place'
            ? 'This control objective\'s status on this system follows its security solution, and none of the solutions that deliver it is in place here. Record the parts of one on the system, or choose one, to change it.'
            : `This control objective's status on this system follows its security solution, "${d.pattern_name}". Change the state of that solution's parts to change it.`,
        });
      }
    }
    const reason = typeof req.body.exclusion_reason === 'string'
      ? req.body.exclusion_reason.trim() : '';
    if (excluding && !reason) {
      return res.status(400).json({
        error: 'exclusion_reason is required when a control is marked not applicable.' });
    }
    const { rowCount } = await query(
      `UPDATE system_controls
          SET status = $1::system_element_status,
              exclusion_reason = $4::text,
              excluded_by      = CASE WHEN $4::text IS NULL THEN NULL ELSE $5::uuid END,
              excluded_at      = CASE WHEN $4::text IS NULL THEN NULL ELSE now() END,
              updated_at = now()
        WHERE system_id = $2 AND control_id = $3`,
      [status, req.params.id, req.params.cid, excluding ? reason : null, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Control is not on this system.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── PATCH /systems/:id/components/:cid  { status } ────────────────────────────
const COMPONENT_STATUSES = SYSTEM_ELEMENT_STATUSES.filter(s => s !== 'not_applicable');

router.patch('/:id/components/:cid', canCreate, async (req, res, next) => {
  try {
    await assertWriteScope(req, { table: 'systems', id: req.params.id });
    const { status } = req.body;
    // Components share the enum but not the concept: excluding one would need a
    // reason column of its own, and the case has not come up. Refuse it here
    // rather than silently accept an unexplained exclusion.
    if (!COMPONENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${COMPONENT_STATUSES.join(', ')}.` });
    }
    // An organisational component has ONE state, on the catalogue (v137); a
    // per-system value would be a second answer that disagrees with the first.
    const { rows: inst } = await query(
      `SELECT instantiation FROM control_components WHERE id = $1`, [req.params.cid]);
    if (inst[0]?.instantiation === 'organisational') {
      return res.status(409).json({
        error: 'This component exists once for the organisation — set its status on the component, not per system.' });
    }
    const { rowCount } = await query(
      `UPDATE system_components SET status = $1::system_element_status
        WHERE system_id = $2 AND component_id = $3`,
      [status, req.params.id, req.params.cid]
    );
    if (!rowCount) return res.status(404).json({ error: 'Component is not on this system.' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /systems/:id/information-assets ──────────────────────────────────────

router.post('/:id/information-assets', canCreate, async (req, res, next) => {
  try {
    const { asset_id } = req.body;
    if (!asset_id) return res.status(400).json({ error: 'asset_id is required.' });

    if (isDepartmentIsolationEnabled() && DEPT_SCOPED.has(req.user.role)) {
      const myDept = await getUserDept(req.user.id);
      if (!myDept) return res.status(403).json({ error: 'No department assigned.' });

      const { rows: sysRows } = await query(
        'SELECT department_id, is_shared FROM systems WHERE id = $1',
        [req.params.id]
      );
      if (!sysRows.length) return res.status(404).json({ error: 'System not found.' });
      const sys = sysRows[0];

      const isOwnDeptSystem = sys.department_id === myDept;
      if (!isOwnDeptSystem && !sys.is_shared) {
        return res.status(403).json({ error: 'Outside your department.' });
      }

      // Own-dept system: can link own-dept or shared assets.
      // Shared cross-dept system: only own-dept assets (the caller's assets, not the system owner's).
      const assetFilter = isOwnDeptSystem
        ? '(ia.department_id = $2 OR ia.is_shared = TRUE)'
        : 'ia.department_id = $2';
      const { rows: assetRows } = await query(
        `SELECT id FROM information_assets ia WHERE ia.id = $1 AND ia.is_active = TRUE AND ${assetFilter}`,
        [asset_id, myDept]
      );
      if (!assetRows.length) return res.status(403).json({ error: 'Information asset not accessible to your department.' });
    } else {
      await assertWriteScope(req, { table: 'systems', id: req.params.id });
    }

    await query(
      `INSERT INTO system_assets (system_id, asset_id, created_by)
       VALUES ($1, $2, $3) ON CONFLICT (system_id, asset_id) DO NOTHING`,
      [req.params.id, asset_id, req.user.id]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── DELETE /systems/:id/information-assets/:aid ───────────────────────────────

router.delete('/:id/information-assets/:aid', canCreate, async (req, res, next) => {
  try {
    if (isDepartmentIsolationEnabled() && DEPT_SCOPED.has(req.user.role)) {
      const myDept = await getUserDept(req.user.id);
      if (!myDept) return res.status(403).json({ error: 'No department assigned.' });

      const { rows: sysRows } = await query(
        'SELECT department_id, is_shared FROM systems WHERE id = $1',
        [req.params.id]
      );
      if (!sysRows.length) return res.status(404).json({ error: 'System not found.' });
      const sys = sysRows[0];

      const isOwnDeptSystem = sys.department_id === myDept;
      if (!isOwnDeptSystem && !sys.is_shared) {
        return res.status(403).json({ error: 'Outside your department.' });
      }
      if (!isOwnDeptSystem) {
        // Shared cross-dept: can only remove assets owned by caller's department.
        const { rows: assetRows } = await query(
          'SELECT department_id FROM information_assets WHERE id = $1',
          [req.params.aid]
        );
        if (!assetRows.length || assetRows[0].department_id !== myDept) {
          return res.status(403).json({ error: "You can only remove your own department's assets from a shared system." });
        }
      }
    } else {
      await assertWriteScope(req, { table: 'systems', id: req.params.id });
    }

    await query(
      'DELETE FROM system_assets WHERE system_id = $1 AND asset_id = $2',
      [req.params.id, req.params.aid]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /systems/:id/available-information-assets ─────────────────────────────
// Returns information assets linkable to this system: own dept + shared,
// excluding already-linked ones. Used by the picker.

router.get('/:id/available-information-assets', canCreate, async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    let deptFilter = '';
    const params = [req.params.id];

    if (isDepartmentIsolationEnabled() && DEPT_SCOPED.has(role)) {
      const deptId = await getUserDept(userId);
      if (!deptId) return res.json([]);
      params.push(deptId);

      // For shared cross-dept systems only show caller's own assets in the picker
      // (cross-dept roles may only link their own assets to shared systems).
      const { rows: sysRows } = await query(
        'SELECT department_id FROM systems WHERE id = $1',
        [req.params.id]
      );
      const isOwnDeptSystem = sysRows.length && sysRows[0].department_id === deptId;
      deptFilter = isOwnDeptSystem
        ? `AND (ia.department_id = $${params.length} OR ia.is_shared = TRUE)`
        : `AND ia.department_id = $${params.length}`;
    }

    const { rows } = await query(`
      SELECT ia.id, ia.name, ia.description,
             ia.confidentiality, ia.integrity, ia.availability,
             ia.is_shared, d.name AS department_name
      FROM information_assets ia
      LEFT JOIN departments d ON d.id = ia.department_id
      WHERE ia.is_active = TRUE
        AND ia.id NOT IN (
          SELECT asset_id FROM system_assets WHERE system_id = $1
        )
        ${deptFilter}
      ORDER BY d.name, ia.name
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});

// The security architecture on this system (v148): what it wants and why,
// choices, and applying a build. See ./security.js.
require('./security')(router, { canView, canCreate });

module.exports = router;
