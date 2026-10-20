'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { Router }        = require('express');
const authenticate      = require('../../middleware/authenticate');
const { requireCapability, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { assertWriteScope } = require('../../auth/scoping');
const { provisionControlComponents } = require('../controls/provisionComponents');

// A risk inherits its department from its owning system. Used by the seat-based
// write gate on the exception endpoints (the only risk-router writes a
// dept-scoped role — IAO — can reach).
const RISK_DEPT_VIA = {
  sql: `SELECT sys.department_id
          FROM risks r JOIN systems sys ON sys.id = r.system_id
         WHERE r.id = $1`,
};
const { query, pool }   = require('../../db/pool');

const router = Router();
router.use(authenticate);
// v152: a write here can change what a security solution delivers.
router.use(require('../../middleware/settleAfterWrite'));

const DEPT_ROLES = new Set(['information_asset_manager', 'information_asset_owner']);

const canRead   = requireCapability('risks.read');
const canWrite  = requireCapability('risks.write');
const canDelete = requireCapability('risks.delete');

async function getUserDept(userId) {
  const { rows } = await query('SELECT department_id FROM users WHERE id = $1', [userId]);
  return rows[0]?.department_id || null;
}

// treatment_decision on the risk itself; the ACTION's treatment type is now
// implicitly 'mitigate' (gap-driven actions only ever add or improve controls).
const VALID_TREATMENTS = new Set(['avoid', 'mitigate', 'transfer', 'accept']);
const VALID_CADENCES   = new Set(['monthly', 'quarterly', 'annual']);

// Authority ladder for accepting a risk at a given score. Roles not listed
// cannot accept at all. Numeric acceptance authority (numbers-only banding):
// ciso/siro/admin may accept any risk; information_asset_owner up to
// exception_accept_owner_max; risk_analyst up to exception_accept_analyst_max.
// Caps are scores (1–25) read from org_config.
//
// security_consultant is phase-dependent (v75): while the org is in SETUP
// (org_config.setup_phase_active), the consultant stands up the initial risk
// picture and may accept any risk; once a consultant moves the org to
// OPERATIONAL (one-way), the consultant is capped at the same authority as a
// risk_analyst. See [[project-risk-treatment-policy]].
function canAcceptRiskAtScore(score, role, analystMax, ownerMax, setupPhaseActive = false) {
  switch (role) {
    case 'ciso':
    case 'siro':
    case 'admin':
      return true;
    case 'security_consultant':
      return setupPhaseActive ? true : score <= analystMax;
    case 'information_asset_owner':
      return score <= ownerMax;
    case 'risk_analyst':
      return score <= analystMax;
    default:
      return false;
  }
}

// Human-readable audit narrative for an exception revoke.
function format_revoke_narrative(actorName, threatName, systemName, notes) {
  const base = `Risk-acceptance exception revoked by ${actorName} for "${threatName}" (${systemName}). `
             + 'Risk returned to needing a treatment decision.';
  const reason = notes?.trim() ? ` Reason: ${notes.trim()}` : '';
  return base + reason;
}

// Coerce a value to a 1–5 integer, or null if absent. Returns the sentinel
// `INVALID` if the value was provided but doesn't parse cleanly to 1–5.
const INVALID = Symbol('INVALID');
function parseOptionalCia(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v);
  if (isNaN(n) || n < 1 || n > 5) return INVALID;
  return n;
}

// ── GET /risks/returned-mine ───────────────────────────────────────────────────
// Count of risks the CISO has returned to *this* user (as composer or owner) and
// which therefore need their attention. Powers the "Risks returned to you" item in
// the My Tasks widget. MUST be registered before GET /:id so it isn't swallowed by
// the param route.
router.get('/returned-mine', canRead, async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count
         FROM risks r
         JOIN systems sys ON sys.id = r.system_id
         LEFT JOIN v_department_risk_owner dro ON dro.department_id = sys.department_id
        WHERE r.is_active = TRUE
          AND r.validation_status = 'returned'
          AND (r.identified_by = $1 OR $1 = ANY (dro.owner_user_ids))`,
      [userId]
    );
    res.json({ count: rows[0].count });
  } catch (err) { next(err); }
});

// The components a control needs on one system — one rule, shared (lib/neededComponents).
const { neededComponentsSql } = require('../../lib/neededComponents');

// ── GET /risks/gap?system_id=&threat_id= ────────────────────────────────────────
// Derived control/component gap for a (system, threat) pair. Powers the
// Register-Risk gap panel BEFORE the risk exists — read-only, nothing persisted.
// "present" = the control is in system_controls / the component in system_components.
// Registered before GET /:id so "gap" isn't swallowed by the param route.
router.get('/gap', canRead, async (req, res, next) => {
  try {
    const { system_id, threat_id, risk_id } = req.query;
    if (!system_id || !threat_id) {
      return res.status(400).json({ error: 'system_id and threat_id are required.' });
    }
    // The threat's inherent probability is the ceiling every per-control residual
    // is measured against: a control can only REDUCE it. When a risk_id is given
    // (the risk-detail Threat Coverage panel), each control also carries its
    // per-(risk,control) judged residual — or the inherent, if unjudged (migration
    // 0092). Without risk_id (the pre-risk Register wizard) probability falls back
    // to inherent for every control.
    const { rows: thr } = await query(
      `SELECT probability_c, probability_i, probability_a FROM threats WHERE id = $1`,
      [threat_id]
    );
    const threat_inherent = thr.length
      ? { c: thr[0].probability_c, i: thr[0].probability_i, a: thr[0].probability_a }
      : null;

    // Controls that should mitigate the threat, flagged present/absent on the system.
    const { rows: controls } = await query(`
      SELECT c.id, c.title, c.control_type,
             (SELECT vcs.status FROM v_control_status vcs WHERE vcs.control_id = c.id) AS enterprise_status, c.effectiveness,
             (sc.system_id IS NOT NULL) AS on_system,
             sc.status AS system_status,
             -- How it is on this system (v128): 'deployed' (on each system / not
             -- stated), 'organisation' or 'group' — reached, not attached.
             sc.via AS delivered_via, c.delivery,
             -- "Why is this control not here?" is the auditor's question, so an
             -- excluded control stays VISIBLE on the panel carrying its reason,
             -- rather than quietly vanishing (0118).
             sc.exclusion_reason, sc.excluded_at,
             xu.full_name AS excluded_by_name,
             COALESCE(rcp.probability_c, t.probability_c) AS probability_c,
             COALESCE(rcp.probability_i, t.probability_i) AS probability_i,
             COALESCE(rcp.probability_a, t.probability_a) AS probability_a,
             (rcp.risk_id IS NOT NULL) AS probability_judged,
             EXISTS (
               SELECT 1 FROM security_action_items sai
               JOIN security_actions sa ON sa.id = sai.action_id
               WHERE sai.control_id = c.id AND sai.system_id = $1
                 AND sai.status NOT IN ('completed', 'withdrawn')
                 AND sa.status NOT IN ('completed', 'cancelled')
             ) AS has_open_action,
             (SELECT sc2.ref_code FROM control_mappings cm
                JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
                JOIN standards s ON s.id = sc2.standard_id
               WHERE cm.control_id = c.id
               ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework_ref
        FROM control_threats ct
        JOIN controls c ON c.id = ct.control_id
        JOIN threats t ON t.id = ct.threat_id
        LEFT JOIN v_control_presence sc ON sc.control_id = c.id AND sc.system_id = $1
        LEFT JOIN users xu ON xu.id = sc.excluded_by
        LEFT JOIN risk_control_probability rcp
               ON rcp.control_id = c.id AND rcp.risk_id = $3
       WHERE ct.threat_id = $2
       ORDER BY (sc.system_id IS NOT NULL), c.title
    `, [system_id, threat_id, risk_id || null]);

    // Components of those controls (one row per control↔component), flagged
    // present/absent on the system + enterprise status. Nested under each control
    // below, to drive the side-by-side Threat|System comparison (a present control
    // expands to its components so a degraded/missing part shows).
    const { rows: compRows } = await query(`
      SELECT ccl.control_id, cc.id, cc.name, cc.component_type,
             cc.status AS enterprise_status, cc.instantiation,
             (syc.system_id IS NOT NULL) AS on_system,
             syc.status AS system_status,
             -- 'organisation' = exists once, in the catalogue's state (v137):
             -- present on every system that implies it, never a per-system gap.
             syc.via AS delivered_via,
             EXISTS (
               SELECT 1 FROM security_action_items sai
               JOIN security_actions sa ON sa.id = sai.action_id
               WHERE sai.component_id = cc.id AND sai.system_id = $1
                 AND sai.status NOT IN ('completed', 'withdrawn')
                 AND sa.status NOT IN ('completed', 'cancelled')
             ) AS has_open_action
        FROM control_threats ct
        JOIN control_component_links ccl ON ccl.control_id = ct.control_id
        JOIN control_components cc ON cc.id = ccl.component_id
        LEFT JOIN v_component_presence syc ON syc.component_id = cc.id AND syc.system_id = $1
       WHERE ct.threat_id = $2
       ORDER BY (syc.system_id IS NOT NULL), cc.component_type, cc.name
    `, [system_id, threat_id]);

    const compsByControl = new Map();
    for (const r of compRows) {
      if (!compsByControl.has(r.control_id)) compsByControl.set(r.control_id, []);
      compsByControl.get(r.control_id).push({
        id: r.id, name: r.name, component_type: r.component_type,
        enterprise_status: r.enterprise_status, on_system: r.on_system,
        system_status: r.system_status, has_open_action: r.has_open_action,
        instantiation: r.instantiation, delivered_via: r.delivered_via,
      });
    }

    // Objectives with security solutions (v145/v147) are delivered by ONE of
    // them, so their flat library list is a menu, not a checklist: listing every
    // agent on it showed Defender, OSSEC and syslog forwarding as "missing" on a
    // system where CrowdStrike and Wazuh were both complete. For those, the
    // components shown are the parts of the solution IN USE here (the same one
    // v_system_control_delivery reports and the component-record finding asks
    // for), and the other solutions are listed as alternatives, never as gaps.
    const ctlIds = controls.map(c => c.id);
    const { rows: solRows } = ctlIds.length ? await query(`
      SELECT o.control_id, p.id, p.name, p.kind,
             ps.in_play, ps.state, ps.missing_parts, ps.degraded_parts,
             COALESCE(d.pattern_id = p.id, false) AS in_use
        FROM delivery_pattern_objectives o
        JOIN delivery_patterns p ON p.id = o.pattern_id
        LEFT JOIN v_delivery_pattern_state ps
               ON ps.pattern_id = p.id AND ps.control_id = o.control_id AND ps.system_id = $1
        LEFT JOIN v_system_control_delivery d ON d.control_id = o.control_id AND d.system_id = $1
       WHERE o.control_id = ANY($2::uuid[])
       ORDER BY o.control_id, COALESCE(d.pattern_id = p.id, false) DESC,
                ps.in_play DESC NULLS LAST,
                CASE ps.state WHEN 'complete' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END,
                p.kind, lower(p.name)
    `, [system_id, ctlIds]) : { rows: [] };

    const solutionsByControl = new Map();
    for (const r of solRows) {
      if (!solutionsByControl.has(r.control_id)) solutionsByControl.set(r.control_id, []);
      solutionsByControl.get(r.control_id).push({
        id: r.id, name: r.name, kind: r.kind, in_use: r.in_use,
        in_play: r.in_play ?? false, state: r.state ?? null,
        missing_parts: r.missing_parts, degraded_parts: r.degraded_parts,
      });
    }

    const inUseIds = [...new Set(solRows.filter(r => r.in_use && r.kind === 'parts').map(r => r.id))];
    const { rows: partRows } = inUseIds.length ? await query(`
      SELECT pp.pattern_id, cc.id, cc.name, cc.component_type, cc.instantiation,
             cc.status AS enterprise_status, pp.location,
             pp.service_system_id, ss.name AS service_system_name,
             CASE pp.location
               WHEN 'on_system' THEN (SELECT x.status::text FROM system_components x
                                       WHERE x.system_id = $1 AND x.component_id = cc.id)
               WHEN 'service'   THEN (SELECT x.status::text FROM system_components x
                                       WHERE x.system_id = pp.service_system_id AND x.component_id = cc.id)
               ELSE (SELECT st.status FROM v_component_state st WHERE st.component_id = cc.id)
             END AS raw_status,
             EXISTS (
               SELECT 1 FROM security_action_items sai
               JOIN security_actions sa ON sa.id = sai.action_id
               WHERE sai.component_id = cc.id AND sai.system_id = $1
                 AND sai.status NOT IN ('completed', 'withdrawn')
                 AND sa.status NOT IN ('completed', 'cancelled')
             ) AS has_open_action
        FROM delivery_pattern_parts pp
        JOIN control_components cc ON cc.id = pp.component_id
        LEFT JOIN systems ss ON ss.id = pp.service_system_id
       WHERE pp.pattern_id = ANY($2::uuid[])
       ORDER BY pp.location, cc.component_type, cc.name
    `, [system_id, inUseIds]) : { rows: [] };

    // A part's shape matches a library component's, so the panel's gap rules
    // apply unchanged. A part on a security system or once for the organisation
    // is "present" when recorded there, in the state recorded there.
    const partsBySolution = new Map();
    for (const r of partRows) {
      if (!partsBySolution.has(r.pattern_id)) partsBySolution.set(r.pattern_id, []);
      partsBySolution.get(r.pattern_id).push({
        id: r.id, name: r.name, component_type: r.component_type,
        enterprise_status: r.enterprise_status, instantiation: r.instantiation,
        on_system: r.raw_status != null,
        system_status: r.raw_status,
        has_open_action: r.location === 'on_system' && r.has_open_action,
        delivered_via: r.location === 'organisation' ? 'organisation' : null,
        part_location: r.location,
        security_system: r.service_system_id ? { id: r.service_system_id, name: r.service_system_name } : null,
      });
    }
    for (const [controlId, sols] of solutionsByControl) {
      const inUse = sols.find(x => x.in_use);
      compsByControl.set(controlId, inUse ? (partsBySolution.get(inUse.id) || []) : []);
    }

    const controlsOut = controls.map(c => ({
      ...c,
      components: compsByControl.get(c.id) || [],
      // null: the objective has no security solutions (the flat list applies).
      solutions: solutionsByControl.get(c.id) || null,
    }));

    // Is this pair already assessed? The Register wizard asks the same question
    // the moment a system and threat are both chosen, and it is cheaper to answer
    // here than to let the analyst fill the form and meet a 409 at the end — at
    // which point their only move is to go back and change something, which is
    // how a wizard leaves work behind on a system it then abandons (2026-09-18).
    // `risk_id` is excluded so the coverage panel does not report the risk it is
    // already looking at.
    const { rows: dup } = await query(
      `SELECT id FROM risks
        WHERE system_id = $1 AND threat_id = $2 AND is_active = TRUE
          AND ($3::uuid IS NULL OR id <> $3::uuid)
        LIMIT 1`,
      [system_id, threat_id, risk_id || null]);

    res.json({
      threat_inherent,
      controls: controlsOut,
      existing_risk_id: dup[0]?.id ?? null,
      summary: {
        controls_total:     controls.length,
        controls_missing:   controls.filter(c => !c.on_system).length,
        components_total:   controlsOut.reduce((n, c) => n + c.components.length, 0),
        components_missing: controlsOut.reduce((n, c) => n + c.components.filter(x => !x.on_system).length, 0),
      },
    });
  } catch (err) { next(err); }
});

// ── GET /risks/:id/action-items/candidates ───────────────────────────────────
// Generate the candidate security-action items from this risk's coverage gap
// (docs/security-actions.md): every threat-linked control that is NOT operational,
// and every delivering component that is on the system but NOT operational
// (mandatory). Read-only — nothing is persisted; the builder UI selects from these
// to create an action. Each candidate carries its change_kind, the default owner
// (the system owner), the org-level library owner, and — for controls — the target
// residual seeded from the coverage panel (the risk_control_probability row, else
// the threat inherent). `already_in_open_action` flags elements already covered by
// a non-completed item so the UI can avoid duplicates.
// The live action on this risk ($1) that already plans an element, or NULL. An
// item counts while it is open AND its action is live: a cancelled or completed
// action's leftover item plans nothing.
const openActionSql = (elementMatch) => `(
  SELECT json_build_object('id', sa.id, 'title', sa.title, 'status', sa.status)
    FROM security_action_items sai
    JOIN security_actions sa        ON sa.id = sai.action_id
    JOIN security_action_risks sar  ON sar.action_id = sai.action_id
   WHERE sar.risk_id = $1 AND ${elementMatch}
     AND sai.status NOT IN ('completed', 'withdrawn')
     AND sa.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')
   ORDER BY sa.created_at
   LIMIT 1)`;

router.get('/:id/action-items/candidates', canWrite, async (req, res, next) => {
  try {
    const { rows: rk } = await query(
      `SELECT r.system_id, r.threat_id, s.owner_user_id AS system_owner_id, u.full_name AS system_owner_name,
              t.probability_c AS inherent_c, t.probability_i AS inherent_i, t.probability_a AS inherent_a
         FROM risks r
         JOIN systems s ON s.id = r.system_id
         JOIN threats t ON t.id = r.threat_id
         LEFT JOIN users u ON u.id = s.owner_user_id
        WHERE r.id = $1 AND r.is_active = TRUE`,
      [req.params.id]
    );
    if (!rk.length) return res.status(404).json({ error: 'Risk not found.' });
    const { system_id, threat_id, system_owner_id, system_owner_name,
            inherent_c, inherent_i, inherent_a } = rk[0];

    // v154: no CONTROL items. A control objective cannot be fixed directly — its
    // status on a system follows its security solution (v152) — so the work is
    // always a part. What used to be offered as a control item is now explained
    // instead: the objectives countering this threat that are not in place and
    // that no item on this system can put right, each with the reason.
    const { rows: blockedRows } = await query(`
      SELECT c.id, c.title, sc.status AS system_status,
             CASE
               WHEN NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = c.id)
                 THEN 'no_solution'
               WHEN sc.system_id IS NULL OR d.pattern_id IS NULL
                 THEN 'choose_solution'
               ELSE 'part_elsewhere'
             END AS reason,
             d.pattern_name,
             array_to_string(COALESCE(d.missing_parts, '{}') || COALESCE(d.degraded_parts, '{}'), ', ') AS parts
        FROM control_threats ct
        JOIN controls c ON c.id = ct.control_id AND COALESCE(c.delivery, 'system') = 'system'
        LEFT JOIN system_controls sc ON sc.control_id = c.id AND sc.system_id = $1
        LEFT JOIN v_system_control_delivery d ON d.system_id = $1 AND d.control_id = c.id
       WHERE ct.threat_id = $2
         AND (sc.system_id IS NULL OR sc.status NOT IN ('operational', 'not_applicable'))
         -- nothing on this system to fix: no needed part here is broken or absent
         AND NOT EXISTS (
           SELECT 1 FROM ${neededComponentsSql('$1')} n
             JOIN control_components cc ON cc.id = n.component_id AND cc.instantiation IS DISTINCT FROM 'organisational'
             LEFT JOIN system_components syc ON syc.component_id = n.component_id AND syc.system_id = $1
            WHERE n.control_id = c.id AND (syc.component_id IS NULL OR syc.status NOT IN ('operational', 'not_applicable')))
       ORDER BY c.title
    `, [system_id, threat_id]);
    const controls = [];
    const blocked = blockedRows.map(b => ({
      control_id: b.id, title: b.title, system_status: b.system_status, reason: b.reason,
      solution: b.pattern_name || null, parts: b.parts || null,
    }));

    // The parts this risk's objectives need on the system (lib/neededComponents:
    // the on-system parts of the solution in use) that are not working there — or
    // are not recorded there at all, which used to hide behind a control item.
    // Mandatory items.
    const { rows: cmpRows } = await query(`
      SELECT cc.id, cc.name, cc.component_type,
             syc.status                               AS system_status,
             ARRAY_AGG(DISTINCT c.title)              AS via_controls,
             ${openActionSql('sai.component_id = cc.id')} AS open_action
        FROM control_threats ct
        JOIN controls c ON c.id = ct.control_id
        JOIN ${neededComponentsSql('$2')} ccl ON ccl.control_id = ct.control_id
        JOIN control_components cc ON cc.id = ccl.component_id
        LEFT JOIN system_components syc ON syc.component_id = cc.id AND syc.system_id = $2
       WHERE ct.threat_id = $3
         AND (syc.component_id IS NULL OR syc.status NOT IN ('operational', 'not_applicable'))
         -- A part not yet recorded here is asked for only by an objective delivered
         -- system by system: one delivered organisation-wide or for a group is
         -- remediated once, on the objective, never as a part per system (v128).
         AND (syc.component_id IS NOT NULL OR COALESCE(c.delivery, 'system') = 'system')
         -- an objective excluded on this system asks for nothing here
         AND NOT EXISTS (SELECT 1 FROM system_controls scx
                          WHERE scx.system_id = $2 AND scx.control_id = c.id AND scx.status = 'not_applicable')
         -- An organisational component (v137) is fixed once, on the catalogue —
         -- never an item per system, so never a per-system candidate.
         AND cc.instantiation IS DISTINCT FROM 'organisational'
       GROUP BY cc.id, cc.name, cc.component_type, syc.status
       ORDER BY cc.name
    `, [req.params.id, system_id, threat_id]);

    const components = cmpRows.map(cc => ({
      element_type: 'component',
      component_id: cc.id,
      name: cc.name,
      component_type: cc.component_type,
      system_id,
      system_status: cc.system_status,
      // not recorded on the system at all, or recorded as missing: it has to be added
      change_kind: (cc.system_status == null || cc.system_status === 'missing') ? 'component_add' : 'component_improve',
      mandatory: true,   // any non-operational component must be actioned
      default_owner:  { user_id: system_owner_id, name: system_owner_name },
      // Components have no library owner — the catalogue is shared org-wide
      // (docs/component-ownership.md). Controls still do: controls.owner_user_id.
      library_owner:  null,
      via_controls: cc.via_controls,
      already_in_open_action: cc.open_action != null,
      open_action: cc.open_action,
    }));

    res.json({
      system_id,
      default_owner: { user_id: system_owner_id, name: system_owner_name },
      // The ceiling a target must sit under: a control cannot make the attack
      // more likely than doing nothing. The builder uses it as the input max.
      threat_inherent: { c: inherent_c, i: inherent_i, a: inherent_a },
      controls,     // always empty since v154; kept so older clients do not break
      components,
      blocked,      // objectives not in place that nothing on this system can fix, with why
      summary: {
        controls_total:     controls.length,
        components_total:   components.length,
        components_mandatory: components.length,
      },
    });
  } catch (err) { next(err); }
});

// ── POST /risks/:id/actions/from-gap ─────────────────────────────────────────
// Create a gap-driven security action + its items from selected candidates
// (docs/security-actions.md). Body: { title?, owner_id?, items: [{ element_type,
// control_id|component_id, owner_user_id?, comment?, target_p_c/i/a? }] }.
// change_kind is derived server-side from current status (authoritative); control
// a target may be supplied per item, else an existing judged residual, else NULL;
// action owners default to the system owner. Hard rule (decision #4): after this
// create, no non-operational component may be left uncovered by an open item.
router.post('/:id/actions/from-gap', canWrite, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { title, owner_id, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      client.release();
      return res.status(400).json({ error: 'At least one item is required.' });
    }

    const { rows: rk } = await query(`
      SELECT r.system_id, r.threat_id, t.name AS threat_name,
             s.name AS system_name, s.owner_user_id AS system_owner_id
        FROM risks r
        JOIN threats  t ON t.id = r.threat_id
        JOIN systems  s ON s.id = r.system_id
       WHERE r.id = $1 AND r.is_active = TRUE`, [req.params.id]);
    if (!rk.length) { client.release(); return res.status(404).json({ error: 'Risk not found.' }); }
    const { system_id, threat_id, threat_name, system_name, system_owner_id } = rk[0];

    // The gap that can be actioned: parts the risk's objectives need on the system
    // that are not working there, or not recorded there (v154 — components only).
    const { rows: gapCmp } = await query(`
      SELECT DISTINCT cc.id, syc.status
        FROM control_threats ct
        JOIN ${neededComponentsSql('$1')} ccl ON ccl.control_id = ct.control_id
        JOIN control_components cc ON cc.id = ccl.component_id
        LEFT JOIN system_components syc ON syc.component_id = cc.id AND syc.system_id = $1
        JOIN controls c ON c.id = ct.control_id
       WHERE ct.threat_id = $2
         AND (syc.component_id IS NULL OR syc.status NOT IN ('operational', 'not_applicable'))
         AND (syc.component_id IS NOT NULL OR COALESCE(c.delivery, 'system') = 'system')
         AND NOT EXISTS (SELECT 1 FROM system_controls scx
                          WHERE scx.system_id = $1 AND scx.control_id = ct.control_id AND scx.status = 'not_applicable')
         AND cc.instantiation IS DISTINCT FROM 'organisational'
    `, [system_id, threat_id]);
    // status null = needed here but not recorded on the system
    const cmpGap = new Map(gapCmp.map(r => [r.id, r.status || 'absent']));

    // Normalise + validate each submitted item; derive change_kind authoritatively.
    const rows = [];
    for (const it of items) {
      if (it.element_type === 'control') {
        // v154: a control objective cannot be fixed directly.
        client.release();
        return res.status(400).json({
          code: 'control_items_retired',
          error: 'A security action fixes components, not control objectives: an objective\'s status follows its security solution, so plan the work against that solution\'s parts.' });
      } else if (it.element_type === 'component') {
        const status = cmpGap.get(it.component_id);
        if (!status) { client.release(); return res.status(400).json({ error: `Component ${it.component_id} is not an actionable gap for this risk.` }); }
        rows.push({
          element_type: 'component', control_id: null, component_id: it.component_id,
          change_kind: (status === 'missing' || status === 'absent') ? 'component_add' : 'component_improve',
          owner_user_id: it.owner_user_id || system_owner_id,
          target_p_c: null, target_p_i: null, target_p_a: null,
          comment: it.comment?.trim() || null,
        });
      } else {
        client.release();
        return res.status(400).json({ error: "Each item needs element_type 'control' or 'component'." });
      }
    }

    // Hard rule (decision #4): every non-operational component must end up in an
    // open item — those already in a non-completed item elsewhere, plus the ones
    // in this submission, must cover the whole mandatory set.
    const { rows: covered } = await query(`
      SELECT DISTINCT sai.component_id
        FROM security_action_items sai
        JOIN security_actions sa ON sa.id = sai.action_id
        JOIN security_action_risks sar ON sar.action_id = sai.action_id
       WHERE sar.risk_id = $1 AND sai.component_id IS NOT NULL AND sai.status NOT IN ('completed', 'withdrawn')
         AND sa.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')
    `, [req.params.id]);
    const coveredIds = new Set(covered.map(r => r.component_id));
    const submittedCmp = new Set(rows.filter(r => r.component_id).map(r => r.component_id));
    const uncovered = [...cmpGap.keys()].filter(id => !coveredIds.has(id) && !submittedCmp.has(id));
    if (uncovered.length) {
      client.release();
      return res.status(400).json({
        error: 'Every non-operational component must be included in a security action.',
        uncovered_component_ids: uncovered,
      });
    }

    let actionId;
    try {
      await client.query('BEGIN');
      const t = (title && title.trim()) || `Treat “${threat_name}” on ${system_name}`;
      const { rows: aRows } = await client.query(`
        INSERT INTO security_actions (title, description, treatment_type, primary_owner_user_id, status, created_by,
                                      subject_type, origin)
        VALUES ($1, $2, 'mitigate', $3, 'proposed', $4, 'risk', 'risk_treatment')
        RETURNING id
      `, [t, t, owner_id || system_owner_id, req.user.id]);
      actionId = aRows[0].id;
      await client.query(
        `INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1, $2)`,
        [actionId, req.params.id]);
      for (const r of rows) {
        await client.query(`
          INSERT INTO security_action_items
            (action_id, system_id, element_type, control_id, component_id, change_kind,
             owner_user_id, target_p_c, target_p_i, target_p_a, comment)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [actionId, system_id, r.element_type, r.control_id, r.component_id, r.change_kind,
            r.owner_user_id, r.target_p_c, r.target_p_i, r.target_p_a, r.comment]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.status(201).json({ id: actionId, item_count: rows.length });
  } catch (err) {
    // A validation throw from the item loop is a 400, not a 500.
    if (err?.httpStatus && !res.headersSent) {
      return res.status(err.httpStatus).json({ error: err.httpError });
    }
    if (!res.headersSent) next(err);
  }
});

// ── POST /risks/:id/actions/:aid/accept ──────────────────────────────────────
// CISO accepts a gap-driven action (decision #6): freezes its items/owners/targets
// (enforced by the edit endpoints, which only mutate a 'proposed' action) and
// snapshots each linked risk's CURRENT scores onto security_action_risks as the
// progress baseline. proposed → planned.
router.post('/:id/actions/:aid/accept', requireCapability('actions.adopt'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { rows } = await query(
      `SELECT sa.status FROM security_actions sa
         JOIN security_action_risks sar ON sar.action_id = sa.id
        WHERE sa.id = $2 AND sar.risk_id = $1`, [req.params.id, req.params.aid]);
    if (!rows.length) { client.release(); return res.status(404).json({ error: 'Action not found for this risk.' }); }
    if (rows[0].status !== 'proposed') { client.release(); return res.status(409).json({ error: 'Only a proposed action can be accepted.' }); }
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE security_actions SET status = 'planned', accepted_at = now(), accepted_by = $2 WHERE id = $1`,
        [req.params.aid, req.user.id]);
      await client.query(`
        UPDATE security_action_risks sar
           SET baseline_risk_c = r.risk_c, baseline_risk_i = r.risk_i,
               baseline_risk_a = r.risk_a, baseline_risk_score = r.risk_score
          FROM risks r
         WHERE sar.action_id = $1 AND r.id = sar.risk_id`, [req.params.aid]);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    res.json({ ok: true });
  } catch (err) { if (!res.headersSent) next(err); }
});

// ── POST /risks/:id/action-items/:iid/complete ───────────────────────────────
// Complete one action item incrementally (decision #4). Flips the element
// operational on the system; a CONTROL item also writes the control's confirmed
// residual (pre-filled from the item target, editable via body probability_c/i/a),
// which the MIN-over-deployed derivation consumes so the current risk drops. Gated
// to the CISO, a risk analyst, or the system owner (custom, not a capability —
// the system owner may not hold risks.write). Requires the action to be accepted.
router.post('/:id/action-items/:iid/complete', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { rows } = await query(`
      SELECT sai.id, sai.action_id, sai.status, sai.element_type, sai.control_id,
             sai.component_id, sai.system_id, sai.target_p_c, sai.target_p_i, sai.target_p_a,
             sa.status AS action_status, s.owner_user_id AS system_owner_id
        FROM security_action_items sai
        JOIN security_actions sa ON sa.id = sai.action_id
        JOIN systems s ON s.id = sai.system_id
        JOIN security_action_risks sar ON sar.action_id = sai.action_id
       WHERE sai.id = $2 AND sar.risk_id = $1
       LIMIT 1`, [req.params.id, req.params.iid]);
    if (!rows.length) { client.release(); return res.status(404).json({ error: 'Item not found for this risk.' }); }
    const item = rows[0];

    const allowed = ['ciso', 'risk_analyst', 'admin'].includes(req.user.role)
      || req.user.id === item.system_owner_id;
    if (!allowed) { client.release(); return res.status(403).json({ error: 'Only the CISO, a risk analyst, or the system owner can complete an item.' }); }
    if (!['planned', 'in_progress'].includes(item.action_status)) {
      client.release();
      return res.status(409).json({ error: 'The action must be accepted before its items can be completed.' });
    }
    if (item.status === 'completed') { client.release(); return res.status(409).json({ error: 'Item already completed.' }); }
    if (item.element_type === 'control') {
      // v154: completing one marked the objective operational by hand, which its
      // security solution now decides (v152). Open control items were withdrawn.
      client.release();
      return res.status(409).json({
        code: 'control_items_retired',
        error: 'Control items are no longer completed: a control objective\'s status follows its security solution. Fix the solution\'s parts instead.' });
    }

    // Control items confirm the residual (pre-filled from the target, editable).
    let resid = null;
    if (item.element_type === 'control') {
      const pC = req.body.probability_c != null ? parseInt(req.body.probability_c) : item.target_p_c;
      const pI = req.body.probability_i != null ? parseInt(req.body.probability_i) : item.target_p_i;
      const pA = req.body.probability_a != null ? parseInt(req.body.probability_a) : item.target_p_a;
      if ([pC, pI, pA].some(p => isNaN(p) || p < 1 || p > 5)) {
        client.release();
        return res.status(400).json({ error: 'Confirmed probability must be integers 1–5.' });
      }
      resid = { pC, pI, pA };
    }

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('riskapp.residual_changed_by', $1::text, true)", [req.user.id]);
      await client.query("SELECT set_config('riskapp.residual_source', 'action_verified', true)");
      await client.query("SELECT set_config('riskapp.residual_source_action_id', $1::text, true)", [item.action_id]);

      if (item.element_type === 'control') {
        // Deploy / flip the control operational on the system, then write its
        // confirmed residual (the control now counts toward the current risk).
        await client.query(`
          INSERT INTO system_controls (system_id, control_id, status, provenance, created_by)
          VALUES ($1, $2, 'operational', 'recorded', $3)
          ON CONFLICT (system_id, control_id) DO UPDATE SET status = 'operational', updated_at = now()
        `, [item.system_id, item.control_id, req.user.id]);
        await client.query(`
          INSERT INTO risk_control_probability
            (risk_id, control_id, probability_c, probability_i, probability_a, set_by, set_at)
          VALUES ($1, $2, $3, $4, $5, $6, now())
          ON CONFLICT (risk_id, control_id) DO UPDATE SET
            probability_c = EXCLUDED.probability_c, probability_i = EXCLUDED.probability_i,
            probability_a = EXCLUDED.probability_a, set_by = EXCLUDED.set_by, set_at = now()
        `, [req.params.id, item.control_id, resid.pC, resid.pI, resid.pA, req.user.id]);
      } else {
        await client.query(`
          INSERT INTO system_components (system_id, component_id, status)
          VALUES ($1, $2, 'operational')
          ON CONFLICT (system_id, component_id) DO UPDATE SET status = 'operational'
        `, [item.system_id, item.component_id]);
      }

      await client.query(
        `UPDATE security_action_items SET status = 'completed', completed_by = $2, completed_at = now() WHERE id = $1`,
        [item.id, req.user.id]);

      // Advance the action: first completion → in_progress; all done → completed.
      await client.query(`
        UPDATE security_actions sa SET
          status = CASE
            WHEN NOT EXISTS (SELECT 1 FROM security_action_items x
                              WHERE x.action_id = sa.id AND x.status NOT IN ('completed', 'withdrawn'))
              THEN 'completed'::treatment_status
            ELSE 'in_progress'::treatment_status END,
          completed_at = CASE
            WHEN NOT EXISTS (SELECT 1 FROM security_action_items x
                              WHERE x.action_id = sa.id AND x.status NOT IN ('completed', 'withdrawn'))
              THEN now() ELSE completed_at END
        WHERE sa.id = $1`, [item.action_id]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === 'P0001' && /inherent/i.test(err.message || '')) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (err) { if (!res.headersSent) next(err); }
});

// ── GET /risks/:id/actions ───────────────────────────────────────────────────
// The risk's gap-driven security actions, each with its items — powers the
// rebuilt Threat-Coverage / Security-Action panel. Central Accountable owner +
// accept snapshot on the action; per-item Responsible owner, target, status,
// comment, and element detail on each item.
router.get('/:id/actions', canRead, async (req, res, next) => {
  try {
    const { rows: actions } = await query(`
      SELECT sa.id, sa.title, sa.status, sa.created_at,
             sa.accepted_at, sa.accepted_by, ab.full_name AS accepted_by_name,
             sa.primary_owner_user_id, ow.full_name AS owner_name,
             sar.baseline_risk_c, sar.baseline_risk_i, sar.baseline_risk_a, sar.baseline_risk_score
        FROM security_action_risks sar
        JOIN security_actions sa ON sa.id = sar.action_id
        LEFT JOIN users ow ON ow.id = sa.primary_owner_user_id
        LEFT JOIN users ab ON ab.id = sa.accepted_by
       WHERE sar.risk_id = $1 AND sa.status <> 'cancelled'
       ORDER BY sa.created_at DESC
    `, [req.params.id]);

    const { rows: items } = await query(`
      SELECT sai.id, sai.action_id, sai.element_type, sai.change_kind, sai.status,
             sai.control_id, sai.component_id,
             sai.owner_user_id, ow.full_name AS owner_name,
             sai.target_p_c, sai.target_p_i, sai.target_p_a, sai.comment,
             sai.completed_by, cb.full_name AS completed_by_name, sai.completed_at,
             sai.withdrawn_at, wb.full_name AS withdrawn_by_name,
             -- Why an item was withdrawn belongs beside the item on the risk
             -- page, not only in the action's narrative: this is where the
             -- reader is when they wonder what happened to it. 0119 and 0121
             -- both file that reason as an item note.
             (SELECT n.note FROM security_action_notes n
               WHERE n.item_id = sai.id
               ORDER BY n.created_at DESC LIMIT 1) AS latest_note,
             c.title AS control_title, cc.name AS component_name, cc.component_type,
             (SELECT sc2.ref_code FROM control_mappings cm
                JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
                JOIN standards s ON s.id = sc2.standard_id
               WHERE cm.control_id = sai.control_id
               ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework_ref
        FROM security_action_items sai
        JOIN security_action_risks sar ON sar.action_id = sai.action_id
        LEFT JOIN users ow ON ow.id = sai.owner_user_id
        LEFT JOIN users cb ON cb.id = sai.completed_by
        LEFT JOIN users wb ON wb.id = sai.withdrawn_by
        LEFT JOIN controls c ON c.id = sai.control_id
        LEFT JOIN control_components cc ON cc.id = sai.component_id
       WHERE sar.risk_id = $1
       ORDER BY sai.element_type DESC, sai.created_at
    `, [req.params.id]);

    const byAction = new Map();
    for (const it of items) {
      if (!byAction.has(it.action_id)) byAction.set(it.action_id, []);
      byAction.get(it.action_id).push({
        id: it.id,
        element_type: it.element_type,
        change_kind: it.change_kind,
        status: it.status,
        control_id: it.control_id,
        component_id: it.component_id,
        label: it.element_type === 'control' ? it.control_title : it.component_name,
        framework_ref: it.framework_ref,
        component_type: it.component_type,
        owner: it.owner_user_id ? { user_id: it.owner_user_id, name: it.owner_name } : null,
        target: it.element_type === 'control'
          ? { c: it.target_p_c, i: it.target_p_i, a: it.target_p_a } : null,
        comment: it.comment,
        completed_by: it.completed_by ? { user_id: it.completed_by, name: it.completed_by_name } : null,
        completed_at: it.completed_at,
        withdrawn_at: it.withdrawn_at,
        withdrawn_by: it.withdrawn_by_name,
        latest_note: it.latest_note,
      });
    }

    res.json(actions.map(a => ({
      id: a.id,
      title: a.title,
      status: a.status,
      created_at: a.created_at,
      accepted_at: a.accepted_at,
      accepted_by: a.accepted_by ? { user_id: a.accepted_by, name: a.accepted_by_name } : null,
      owner: a.primary_owner_user_id ? { user_id: a.primary_owner_user_id, name: a.owner_name } : null,
      baseline: a.baseline_risk_score != null
        ? { c: a.baseline_risk_c, i: a.baseline_risk_i, a: a.baseline_risk_a, score: a.baseline_risk_score }
        : null,
      items: byAction.get(a.id) || [],
    })));
  } catch (err) { next(err); }
});

// ── PATCH /risks/:id/action-items/:iid ───────────────────────────────────────
// Edit an item's owner / comment / target while its action is still proposed
// (after CISO accept the action is frozen). Targets apply to control items only.
router.patch('/:id/action-items/:iid', canWrite, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT sai.element_type, sa.status AS action_status
        FROM security_action_items sai
        JOIN security_actions sa ON sa.id = sai.action_id
        JOIN security_action_risks sar ON sar.action_id = sai.action_id
       WHERE sai.id = $2 AND sar.risk_id = $1 LIMIT 1`, [req.params.id, req.params.iid]);
    if (!rows.length) return res.status(404).json({ error: 'Item not found for this risk.' });
    if (rows[0].action_status !== 'proposed') {
      return res.status(409).json({ error: 'Items can only be edited while the action is proposed (before acceptance).' });
    }
    const isControl = rows[0].element_type === 'control';
    const { owner_user_id, comment, target_p_c, target_p_i, target_p_a } = req.body;

    // Targets: control items only, all-or-none, 1–5.
    let tC = null, tI = null, tA = null, setTarget = false;
    if (isControl && (target_p_c != null || target_p_i != null || target_p_a != null)) {
      tC = parseInt(target_p_c); tI = parseInt(target_p_i); tA = parseInt(target_p_a);
      if ([tC, tI, tA].some(p => isNaN(p) || p < 1 || p > 5)) {
        return res.status(400).json({ error: 'Target probability must be integers 1–5.' });
      }
      setTarget = true;
    }

    const { rows: upd } = await query(`
      UPDATE security_action_items SET
        owner_user_id = COALESCE($2, owner_user_id),
        comment       = CASE WHEN $3::boolean THEN $4 ELSE comment END,
        target_p_c    = CASE WHEN $5::boolean THEN $6 ELSE target_p_c END,
        target_p_i    = CASE WHEN $5::boolean THEN $7 ELSE target_p_i END,
        target_p_a    = CASE WHEN $5::boolean THEN $8 ELSE target_p_a END
      WHERE id = $1
      RETURNING id
    `, [req.params.iid, owner_user_id || null,
        comment !== undefined, comment ?? null,
        setTarget, tC, tI, tA]);
    if (!upd.length) return res.status(404).json({ error: 'Item not found.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /risks/:id ─────────────────────────────────────────────────────────────

router.get('/:id', canRead, async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    const { rows } = await query(`
      SELECT
        r.id, r.validation_status, r.validation_notes,
        r.rationale, r.review_date, r.is_active,
        r.probability_c, r.probability_i, r.probability_a,
        r.inherent_probability_c, r.inherent_probability_i, r.inherent_probability_a,
        r.residual_impact_c, r.residual_impact_i, r.residual_impact_a,
        r.inherent_impact_rationale, r.inherent_probability_rationale,
        r.residual_impact_rationale, r.residual_probability_rationale,
        r.treatment_decision, r.no_action_required,
        r.risk_c, r.risk_i, r.risk_a,
        r.risk_score,
        r.created_at, r.updated_at, r.validated_at,
        sys.id   AS system_id,   sys.name AS system_name,
        sys.is_shared AS system_is_shared,
        -- The system owner may complete this risk's action items even without
        -- risks.write (the custom gate on POST /:id/action-items/:iid/complete).
        -- The frontend needs the id to offer the affordance to the right person.
        sys.owner_user_id AS system_owner_user_id,
        sys.impact_c AS impact_c, sys.impact_i AS impact_i, sys.impact_a AS impact_a,
        ia.id    AS asset_id,    ia.name  AS asset_name,
        ia.confidentiality AS asset_c, ia.integrity AS asset_i, ia.availability AS asset_a,
        t.id     AS threat_id,   t.name   AS threat_name,
        t.threat_category, t.description AS threat_description,
        t.probability_c AS threat_prob_c,
        t.probability_i AS threat_prob_i,
        t.probability_a AS threat_prob_a,
        d.id     AS department_id, d.name AS department_name,
        ib.id    AS identified_by_id, ib.full_name AS identified_by_name,
        dro.owner_user_ids   AS owner_user_ids,
        dro.owner_names      AS owner_name,
        dro.is_siro_fallback AS owner_is_siro_fallback,
        vb.full_name AS validated_by_name
      FROM risks r
      JOIN systems sys     ON sys.id = r.system_id
      JOIN departments d   ON d.id   = sys.department_id
      JOIN threats t       ON t.id   = r.threat_id
      LEFT JOIN information_assets ia ON ia.id = r.asset_id
      LEFT JOIN users ib   ON ib.id = r.identified_by
      LEFT JOIN v_department_risk_owner dro ON dro.department_id = sys.department_id
      LEFT JOIN users vb   ON vb.id = r.validated_by
      WHERE r.id = $1 AND r.is_active = TRUE
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Risk not found.' });
    const risk = rows[0];

    if (isDepartmentIsolationEnabled() && DEPT_ROLES.has(role)) {
      const deptId = await getUserDept(userId);
      // A risk on a SHARED system travels cross-department (v68 follow-on):
      // dept-scoped roles can read it even if it belongs to another department.
      if (risk.department_id !== deptId && !risk.system_is_shared) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
    }

    // Summary only — the panel reads the full actions+items tree from
    // GET /risks/:id/actions. This block just backs the validation readiness
    // checklist ("is there an active action on this risk?").
    const { rows: actions } = await query(`
      SELECT sa.id, sa.title, sa.status, sa.target_date,
             (SELECT n.note FROM security_action_notes n
               WHERE n.action_id = sa.id ORDER BY n.created_at DESC LIMIT 1) AS progress_notes,
             sa.description,
             sa.accepted_at, sa.completed_at,
             sa.primary_owner_user_id AS owner_id,
             u.full_name              AS owner_name,
             (SELECT COUNT(*) FROM security_action_items sai
               WHERE sai.action_id = sa.id)                        AS item_count,
             (SELECT COUNT(*) FROM security_action_items sai
               WHERE sai.action_id = sa.id AND sai.status = 'completed') AS items_done
      FROM security_action_risks sar
      JOIN security_actions sa ON sa.id = sar.action_id
      LEFT JOIN users u ON u.id = sa.primary_owner_user_id
      WHERE sar.risk_id = $1 AND sa.status != 'cancelled'
      ORDER BY
        CASE sa.status WHEN 'proposed' THEN 0 ELSE 1 END,
        sa.created_at DESC
    `, [req.params.id]);

    const { rows: exceptions } = await query(`
      SELECT e.id, e.justification, e.accepted_by, e.accepted_role,
             e.accepted_at, e.expires_at, e.review_cadence, e.status,
             e.escalated_at, e.revoked_at, e.notes,
             u.full_name AS accepted_by_name,
             (e.expires_at - CURRENT_DATE)::int AS days_until_expiry
      FROM exceptions e
      LEFT JOIN users u ON u.id = e.accepted_by
      WHERE e.risk_id = $1
      ORDER BY e.accepted_at DESC
    `, [req.params.id]);

    const { rows: components } = await query(`
      SELECT
        cc.id, cc.name, cc.component_type, cc.status,
        rc.added_at,
        COALESCE(
          (SELECT json_agg(json_build_object('id', sys.id, 'name', sys.name) ORDER BY sys.name)
           FROM system_components sc
           JOIN systems sys ON sys.id = sc.system_id
           WHERE sc.component_id = cc.id),
          '[]'::json
        ) AS systems
      FROM risk_components rc
      JOIN control_components cc ON cc.id = rc.component_id
      WHERE rc.risk_id = $1
      ORDER BY cc.component_type, cc.name
    `, [req.params.id]);

    // Mitigating controls are DERIVED (v72 control-maturity model): controls
    // deployed on this risk's system (system_controls) that counter this risk's
    // threat (control_threats). Maturity lives on the control↔system relationship.
    const { rows: controls } = await query(`
      SELECT c.id, c.title, c.control_type,
             c.effectiveness, (SELECT vcs.status FROM v_control_status vcs WHERE vcs.control_id = c.id) AS status, c.is_baseline,
             (SELECT s.code FROM control_mappings cm JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
              JOIN standards s ON s.id = sc2.standard_id WHERE cm.control_id = c.id
              ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework,
             (SELECT sc2.ref_code FROM control_mappings cm JOIN standard_controls sc2 ON sc2.id = cm.standard_control_id
              JOIN standards s ON s.id = sc2.standard_id WHERE cm.control_id = c.id
              ORDER BY s.sort_index, sc2.sort_index LIMIT 1) AS framework_ref,
             c.effectiveness AS maturity, sc.status AS system_status, sc.created_at AS added_at,
             sc.via AS delivered_via
      FROM v_control_presence sc
      JOIN controls c         ON c.id = sc.control_id
      JOIN control_threats ct ON ct.control_id = sc.control_id AND ct.threat_id = $2
      WHERE sc.system_id = $1
      ORDER BY c.title ASC
    `, [risk.system_id, risk.threat_id]);

    // Information assets linked to the risk's system — shown on the Inherent
    // risk panel so the analyst can see how the MAX CIA was derived.
    const { rows: systemAssets } = await query(`
      SELECT ia.id, ia.name,
             ia.confidentiality AS c,
             ia.integrity       AS i,
             ia.availability    AS a
      FROM system_assets sa
      JOIN information_assets ia ON ia.id = sa.asset_id
      WHERE sa.system_id = $1 AND ia.is_active = TRUE
      ORDER BY ia.name
    `, [risk.system_id]);

    const { rows: cfgRows } = await query(
      `SELECT mandatory_action_score FROM org_config LIMIT 1`
    );
    const mandatory_action_score = cfgRows[0]?.mandatory_action_score ?? 12;

    // ── Treated down ─────────────────────────────────────────────────────────
    // A risk scoring 4 because nothing much was ever at stake and one scoring 4
    // because it was driven down from 20 are different facts, and only the
    // second is worth reporting. The distinction needs no new column: accepting
    // an action snapshots the risk's score onto security_action_risks
    // (baseline_risk_score, v96) — literally "what this scored when we
    // committed to treating it".
    //
    // Treated down = has an ACCEPTED action AND scores below that baseline.
    // A never-treated trivial risk cannot masquerade as one: it has no
    // baseline. Where several accepted actions exist we take the earliest
    // baseline, so the delta covers the whole treatment effort rather than the
    // most recent slice of it. Derived on read — see docs/threat-identification.md.
    const { rows: td } = await query(`
      SELECT sar.baseline_risk_score, sa.title, sa.accepted_at
        FROM security_action_risks sar
        JOIN security_actions sa ON sa.id = sar.action_id
       WHERE sar.risk_id = $1
         AND sa.accepted_at IS NOT NULL
         AND sar.baseline_risk_score IS NOT NULL
       ORDER BY sa.accepted_at
       LIMIT 1
    `, [req.params.id]);

    const baseline = td[0]?.baseline_risk_score ?? null;
    const treated_down = (baseline != null && risk.risk_score != null && risk.risk_score < baseline)
      ? {
          from: baseline,
          to: risk.risk_score,
          reduction: baseline - risk.risk_score,
          action_title: td[0].title,
          accepted_at: td[0].accepted_at,
        }
      : null;

    res.json({
      ...risk, actions, components, controls, exceptions,
      system_assets: systemAssets,
      mandatory_action_score,
      treated_down,
    });
  } catch (err) { next(err); }
});

// ── POST /risks ────────────────────────────────────────────────────────────────
// Body: { system_id | system_ids[], threat_id, asset_id?,
//         probability_c/i/a, rationale, review_date?, component_ids?[] }
//
// Single mode (system_id): returns { id }.
// Bulk mode (system_ids):  creates one risk row per system in a single
//   transaction with the same threat/probabilities/rationale/components;
//   returns { ids: [...] }. asset_id is ignored in bulk mode (it's a
//   per-risk narrative pointer that rarely transfers cleanly across systems).
//   The (system_id, threat_id) unique constraint means a system that already
//   has this threat collides and the whole batch rolls back.

router.post('/', canWrite, async (req, res, next) => {
  try {
    const {
      system_id, system_ids,
      threat_id, asset_id,
      probability_c, probability_i, probability_a,
      inherent_probability_c, inherent_probability_i, inherent_probability_a,
      residual_impact_c, residual_impact_i, residual_impact_a,
      inherent_impact_rationale, inherent_probability_rationale,
      residual_impact_rationale, residual_probability_rationale,
      treatment_decision, no_action_required,
      rationale, review_date,
      component_ids,
    } = req.body;

    const bulkMode = Array.isArray(system_ids) && system_ids.length > 0;
    const targetSystemIds = bulkMode
      ? [...new Set(system_ids.filter(Boolean))]
      : (system_id ? [system_id] : []);

    if (targetSystemIds.length === 0) {
      return res.status(400).json({ error: 'system_id (or system_ids) is required.' });
    }
    if (!threat_id)        return res.status(400).json({ error: 'threat_id is required.' });
    if (!rationale?.trim()) return res.status(400).json({ error: 'rationale is required.' });

    const pC = parseInt(probability_c);
    const pI = parseInt(probability_i);
    const pA = parseInt(probability_a);
    if ([pC, pI, pA].some(p => isNaN(p) || p < 1 || p > 5)) {
      return res.status(400).json({ error: 'Probabilities must be integers 1–5.' });
    }

    const inhC = parseOptionalCia(inherent_probability_c);
    const inhI = parseOptionalCia(inherent_probability_i);
    const inhA = parseOptionalCia(inherent_probability_a);
    const resImpC = parseOptionalCia(residual_impact_c);
    const resImpI = parseOptionalCia(residual_impact_i);
    const resImpA = parseOptionalCia(residual_impact_a);
    if ([inhC, inhI, inhA, resImpC, resImpI, resImpA].includes(INVALID)) {
      return res.status(400).json({ error: 'Inherent probability and residual impact, when supplied, must be integers 1–5.' });
    }

    if (treatment_decision != null && !VALID_TREATMENTS.has(treatment_decision)) {
      return res.status(400).json({ error: `treatment_decision must be one of: ${[...VALID_TREATMENTS].join(', ')}.` });
    }

    // Single mode requires an explicit Risk Owner; bulk mode falls back to
    // system owner so the analyst doesn't have to name 20 owners individually.

    const componentIds = Array.isArray(component_ids) ? component_ids.filter(Boolean) : [];
    const effectiveAssetId = bulkMode ? null : (asset_id || null);

    // Common values for both insert paths
    const newRiskFields = {
      inh_c: inhC, inh_i: inhI, inh_a: inhA,
      res_imp_c: resImpC, res_imp_i: resImpI, res_imp_a: resImpA,
      inh_imp_rat: inherent_impact_rationale?.trim() || null,
      inh_prob_rat: inherent_probability_rationale?.trim() || null,
      res_imp_rat: residual_impact_rationale?.trim() || null,
      res_prob_rat: residual_probability_rationale?.trim() || null,
      treatment: treatment_decision || null,
      no_action: Boolean(no_action_required),
    };

    // Single-row hot path: keep the existing simple flow.
    if (!bulkMode) {
      const { rows } = await query(`
        INSERT INTO risks (
          system_id, threat_id, asset_id,
          probability_c, probability_i, probability_a,
          inherent_probability_c, inherent_probability_i, inherent_probability_a,
          residual_impact_c, residual_impact_i, residual_impact_a,
          inherent_impact_rationale, inherent_probability_rationale,
          residual_impact_rationale, residual_probability_rationale,
          treatment_decision, no_action_required,
          risk_c, risk_i, risk_a, risk_score,
          rationale, review_date, identified_by
        )
        VALUES ($1, $2, $3, $4, $5, $6,
                $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21,
                1, 1, 1, 1, $7, $8,
                $9)
        RETURNING id
      `, [
        targetSystemIds[0], threat_id, effectiveAssetId,
        pC, pI, pA,
        rationale.trim(),
        review_date || null,
        req.user.id,
        newRiskFields.inh_c, newRiskFields.inh_i, newRiskFields.inh_a,
        newRiskFields.res_imp_c, newRiskFields.res_imp_i, newRiskFields.res_imp_a,
        newRiskFields.inh_imp_rat, newRiskFields.inh_prob_rat,
        newRiskFields.res_imp_rat, newRiskFields.res_prob_rat,
        newRiskFields.treatment, newRiskFields.no_action,
      ]);

      const riskId = rows[0].id;

      // A risk implies the threat applies to the system — register the link so
      // the risk surfaces in v_system_risk_grid (which inner-joins system_threats).
      await query(
        `INSERT INTO system_threats (system_id, threat_id, added_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (system_id, threat_id) DO NOTHING`,
        [targetSystemIds[0], threat_id, req.user.id]
      );

      if (componentIds.length > 0) {
        const placeholders = componentIds.map((_, i) => `($1, $${i + 3}, $2)`).join(', ');
        await query(
          `INSERT INTO risk_components (risk_id, component_id, added_by)
           VALUES ${placeholders}
           ON CONFLICT DO NOTHING`,
          [riskId, req.user.id, ...componentIds]
        );
      }

      return res.status(201).json({ id: riskId });
    }

    // Bulk mode: insert N rows in one transaction. Any unique-violation aborts the batch.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const createdIds = [];
      for (const sysId of targetSystemIds) {
        const { rows: r } = await client.query(`
          INSERT INTO risks (
            system_id, threat_id, asset_id,
            probability_c, probability_i, probability_a,
            inherent_probability_c, inherent_probability_i, inherent_probability_a,
            residual_impact_c, residual_impact_i, residual_impact_a,
            inherent_impact_rationale, inherent_probability_rationale,
            residual_impact_rationale, residual_probability_rationale,
            treatment_decision, no_action_required,
            risk_c, risk_i, risk_a, risk_score,
            rationale, review_date, identified_by
          )
          VALUES ($1, $2, NULL, $3, $4, $5,
                  $9, $10, $11, $12, $13, $14,
                  $15, $16, $17, $18, $19, $20,
                  1, 1, 1, 1, $6, $7,
                  $8)
          RETURNING id
        `, [
          sysId, threat_id,
          pC, pI, pA,
          rationale.trim(),
          review_date || null,
          req.user.id,
          newRiskFields.inh_c, newRiskFields.inh_i, newRiskFields.inh_a,
          newRiskFields.res_imp_c, newRiskFields.res_imp_i, newRiskFields.res_imp_a,
          newRiskFields.inh_imp_rat, newRiskFields.inh_prob_rat,
          newRiskFields.res_imp_rat, newRiskFields.res_prob_rat,
          newRiskFields.treatment, newRiskFields.no_action,
        ]);
        createdIds.push(r[0].id);

        // Register the (system, threat) link so each new risk surfaces in
        // v_system_risk_grid (inner-joins system_threats).
        await client.query(
          `INSERT INTO system_threats (system_id, threat_id, added_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (system_id, threat_id) DO NOTHING`,
          [sysId, threat_id, req.user.id]
        );
      }

      if (componentIds.length > 0) {
        // Link the same set of components to each created risk
        const tuples = [];
        const params = [req.user.id];
        for (const riskId of createdIds) {
          for (const compId of componentIds) {
            params.push(riskId, compId);
            tuples.push(`($${params.length - 1}, $${params.length}, $1)`);
          }
        }
        await client.query(
          `INSERT INTO risk_components (risk_id, component_id, added_by)
           VALUES ${tuples.join(', ')}
           ON CONFLICT DO NOTHING`,
          params
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({ ids: createdIds });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        // Look up which system collided so the user knows where to deal with it
        const { rows: existing } = await query(`
          SELECT r.system_id, s.name AS system_name
          FROM risks r JOIN systems s ON s.id = r.system_id
          WHERE r.threat_id = $1 AND r.system_id = ANY($2::uuid[]) AND r.is_active = TRUE
        `, [threat_id, targetSystemIds]);
        const names = existing.map(e => e.system_name).join(', ');
        return res.status(409).json({
          error: `A risk for this threat already exists on: ${names || 'one of the selected systems'}. No risks were created.`,
          conflicting_system_ids: existing.map(e => e.system_id),
        });
      }
      if (err.code === '23503') {
        return res.status(400).json({ error: 'Referenced system or threat does not exist.' });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === '23505') {
      // Name the risk that is in the way. Without it this is a dead end: the
      // analyst is told the work is already done somewhere they cannot see, and
      // the only move is to go back and change something — which is how, while
      // the wizard still surveyed controls, edits ended up on the system the
      // analyst then abandoned.
      let existingId = null;
      try {
        const { rows } = await query(
          `SELECT id FROM risks
            WHERE system_id = $1 AND threat_id = $2 AND is_active = TRUE LIMIT 1`,
          [req.body.system_id, req.body.threat_id]);
        existingId = rows[0]?.id ?? null;
      } catch { /* the message stands without it */ }
      return res.status(409).json({
        error: 'A risk already exists for this system / threat combination.',
        existing_risk_id: existingId,
      });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Referenced system, threat, or asset does not exist.' });
    }
    next(err);
  }
});

// ── POST /risks/:id/components ─────────────────────────────────────────────────

router.post('/:id/components', canWrite, async (req, res, next) => {
  try {
    const { component_id } = req.body;
    if (!component_id) return res.status(400).json({ error: 'component_id is required.' });

    const { rows: r } = await query(
      `SELECT id FROM risks WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!r.length) return res.status(404).json({ error: 'Risk not found.' });

    await query(
      `INSERT INTO risk_components (risk_id, component_id, added_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [req.params.id, component_id, req.user.id]
    );

    res.status(201).end();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Component not found.' });
    }
    next(err);
  }
});

// ── DELETE /risks/:id/components/:cid ──────────────────────────────────────────

router.delete('/:id/components/:cid', canWrite, async (req, res, next) => {
  try {
    await query(
      `DELETE FROM risk_components WHERE risk_id = $1 AND component_id = $2`,
      [req.params.id, req.params.cid]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /risks/:id/controls ───────────────────────────────────────────────────

router.post('/:id/controls', canWrite, async (req, res, next) => {
  try {
    const { control_id } = req.body;
    if (!control_id) return res.status(400).json({ error: 'control_id is required.' });

    const { rows: r } = await query(
      `SELECT system_id, threat_id FROM risks WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!r.length) return res.status(404).json({ error: 'Risk not found.' });
    const { system_id, threat_id } = r[0];

    // A mitigating control added here is recorded on the SYSTEM (system_controls)
    // and linked to the threat so it surfaces as mitigating this risk. Controls are
    // system-level — it now applies to every risk on this system that shares the
    // threat. Per-system health is the control's `status` (set/edited elsewhere);
    // maturity is an organisation-wide property of the control.
    await query(
      `INSERT INTO system_controls (system_id, control_id, provenance, created_by)
       VALUES ($1, $2, 'recorded', $3)
       ON CONFLICT (system_id, control_id) DO UPDATE SET updated_at = now()`,
      [system_id, control_id, req.user.id]
    );
    await query(
      `INSERT INTO control_threats (control_id, threat_id, created_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [control_id, threat_id, req.user.id]
    );
    // Provision the control's delivering components onto the system so their
    // per-system coverage/health is trackable (idempotent; never downgrades).
    await provisionControlComponents(system_id, control_id, req.user.id);
    res.status(201).end();
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Control not found.' });
    next(err);
  }
});

// ── DELETE /risks/:id/controls/:cid ───────────────────────────────────────────

router.delete('/:id/controls/:cid', canWrite, async (req, res, next) => {
  try {
    // Controls are system-level now: removing one detaches it from this risk's
    // SYSTEM (affecting every risk on the system that used it).
    await query(
      `DELETE FROM system_controls
        WHERE control_id = $2
          AND system_id = (SELECT system_id FROM risks WHERE id = $1)`,
      [req.params.id, req.params.cid]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── PUT /risks/:id/controls/:cid/probability ──────────────────────────────────
// Record the per-control residual attack probability once THIS control is
// considered (the Threat Coverage panel picker). Upserts risk_control_probability;
// the DB then derives risks.probability_* = MIN over the DEPLOYED controls of
// COALESCE(judged, threat inherent), a degraded one worsened by a rung — see
// migrations 0092, 0095 and 0115. Each value must be
// ≤ the threat inherent (a control can only reduce); the ceiling trigger enforces
// it and we translate its RAISE into a clean 400. Mirrors residual-edit rights
// (risks.write + the analyst validated-lock).
router.put('/:id/controls/:cid/probability', canWrite, async (req, res, next) => {
  try {
    const { role } = req.user;
    const { probability_c, probability_i, probability_a } = req.body;
    const pC = parseInt(probability_c);
    const pI = parseInt(probability_i);
    const pA = parseInt(probability_a);
    if ([pC, pI, pA].some(p => isNaN(p) || p < 1 || p > 5)) {
      return res.status(400).json({ error: 'Probabilities must be integers 1–5.' });
    }

    const { rows: existing } = await query(
      `SELECT threat_id, validation_status FROM risks WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Risk not found.' });
    const { threat_id, validation_status } = existing[0];
    if (role === 'risk_analyst' && !['pending', 'returned'].includes(validation_status)) {
      return res.status(403).json({ error: 'Validated risks cannot be edited by the analyst.' });
    }

    // The control must be part of the threat's control set, else the judged row
    // would be silently ignored by the aggregate (it joins through control_threats).
    const { rows: linked } = await query(
      `SELECT 1 FROM control_threats WHERE control_id = $1 AND threat_id = $2`,
      [req.params.cid, threat_id]
    );
    if (!linked.length) {
      return res.status(400).json({ error: "Control is not linked to this risk's threat." });
    }

    // Set residual_changed_by inside the txn so the history row (written by the
    // recompute cascade → log_residual_change) attributes to the caller.
    const client = await pool.connect();
    let rows;
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('riskapp.residual_changed_by', $1::text, true)",
        [req.user.id]
      );
      const result = await client.query(`
        INSERT INTO risk_control_probability
          (risk_id, control_id, probability_c, probability_i, probability_a, set_by, set_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (risk_id, control_id) DO UPDATE SET
          probability_c = EXCLUDED.probability_c,
          probability_i = EXCLUDED.probability_i,
          probability_a = EXCLUDED.probability_a,
          set_by        = EXCLUDED.set_by,
          set_at        = now()
        RETURNING control_id, probability_c, probability_i, probability_a
      `, [req.params.id, req.params.cid, pC, pI, pA, req.user.id]);
      await client.query('COMMIT');
      rows = result.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      // The ≤-inherent ceiling trigger raises P0001 (raise_exception).
      if (err.code === 'P0001' && /inherent/i.test(err.message || '')) {
        return res.status(400).json({ error: err.message });
      }
      if (err.code === '23503') return res.status(404).json({ error: 'Control not found.' });
      throw err;
    } finally {
      client.release();
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /risks/:id/treatment ────────────────────────────────────────────────
// Lightweight update for treatment_decision and no_action_required only.
// Does not require probabilities or rationale, so it can be called independently
// of the full edit form.

router.patch('/:id/treatment', canWrite, async (req, res, next) => {
  try {
    const { role } = req.user;
    const { treatment_decision, no_action_required } = req.body;

    if (treatment_decision != null && !VALID_TREATMENTS.has(treatment_decision)) {
      return res.status(400).json({ error: `treatment_decision must be one of: ${[...VALID_TREATMENTS].join(', ')}.` });
    }

    const { rows: existing } = await query(
      `SELECT validation_status FROM risks WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Risk not found.' });

    const { validation_status } = existing[0];
    if (role === 'risk_analyst' && !['pending', 'returned'].includes(validation_status)) {
      return res.status(403).json({ error: 'Validated risks cannot be edited by the analyst.' });
    }

    const { rows } = await query(`
      UPDATE risks
      SET treatment_decision = $2,
          no_action_required = $3
      WHERE id = $1
      RETURNING id, treatment_decision, no_action_required
    `, [req.params.id, treatment_decision || null, Boolean(no_action_required)]);

    if (!rows.length) return res.status(404).json({ error: 'Risk not found.' });
    res.json(rows[0]);
  } catch (err) {
    // Translate the threshold-enforcement trigger (check_violation, SQLSTATE
    // 23514) into a clean 400 so the frontend can surface the message.
    if (err.code === '23514' && err.message?.includes('no action required')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ── PUT /risks/:id ─────────────────────────────────────────────────────────────
// Editable: rationale, review_date, asset_id (optional pointer), treatment.
// Probability is NOT editable here — it is DERIVED from the per-control
// judgements on the Threat Coverage panel (migration 0092); any probability_* in
// the body is ignored so this edit can never clobber the derived value.
// system_id and threat_id are immutable — a risk against a different system or
// threat is a different risk. To move a risk, create a new one and archive the old.

router.put('/:id', canWrite, async (req, res, next) => {
  try {
    const { role } = req.user;
    // Ownership is not a field here and cannot be: a risk belongs to the
    // department that owns its system, derived on read (v108).
    // probability_* is intentionally NOT read — it is derived, not a manual lever.
    const {
      inherent_probability_c, inherent_probability_i, inherent_probability_a,
      inherent_impact_rationale, inherent_probability_rationale,
      residual_probability_rationale,
      treatment_decision, no_action_required,
      rationale, review_date, asset_id,
    } = req.body;

    if (!rationale?.trim()) return res.status(400).json({ error: 'rationale is required.' });

    const inhC = parseOptionalCia(inherent_probability_c);
    const inhI = parseOptionalCia(inherent_probability_i);
    const inhA = parseOptionalCia(inherent_probability_a);
    if ([inhC, inhI, inhA].includes(INVALID)) {
      return res.status(400).json({ error: 'Inherent probability, when supplied, must be integers 1–5.' });
    }

    if (treatment_decision != null && !VALID_TREATMENTS.has(treatment_decision)) {
      return res.status(400).json({ error: `treatment_decision must be one of: ${[...VALID_TREATMENTS].join(', ')}.` });
    }

    const { rows: existing } = await query(
      `SELECT validation_status FROM risks WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Risk not found.' });

    const { validation_status } = existing[0];
    if (role === 'risk_analyst' && !['pending', 'returned'].includes(validation_status)) {
      return res.status(403).json({ error: 'Validated risks cannot be edited by the analyst.' });
    }

    // Probability is not written here (it's derived from the per-control rows), and
    // residual_impact stays cleared (Option A — impact comes from the system's
    // assets). So this edit touches neither the scoring trigger nor
    // risk_residual_history — a plain UPDATE, no transaction/provenance needed.
    const { rows } = await query(`
      UPDATE risks
      SET rationale                      = $2,
          review_date                    = $3,
          asset_id                       = $4,
          inherent_probability_c         = $5,
          inherent_probability_i         = $6,
          inherent_probability_a         = $7,
          residual_impact_c              = NULL,
          residual_impact_i              = NULL,
          residual_impact_a              = NULL,
          residual_impact_rationale      = NULL,
          inherent_impact_rationale      = $8,
          inherent_probability_rationale = $9,
          residual_probability_rationale = $10,
          treatment_decision             = $11,
          no_action_required             = $12,
          validation_status = CASE
            WHEN validation_status = 'returned' THEN 'pending'::risk_validation_status
            ELSE validation_status
          END
      WHERE id = $1
      RETURNING id, validation_status, risk_score
    `, [
      req.params.id,
      rationale.trim(),
      review_date || null,
      asset_id || null,
      inhC, inhI, inhA,
      inherent_impact_rationale?.trim() || null,
      inherent_probability_rationale?.trim() || null,
      residual_probability_rationale?.trim() || null,
      treatment_decision || null,
      Boolean(no_action_required),
    ]);

    if (!rows.length) return res.status(404).json({ error: 'Risk not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// There is no reassign endpoint. A risk belongs to the department that owns its
// system (v108, docs/risk-ownership.md), so ownership is derived on read and
// moves when the SYSTEM moves department — an act that is audited in its own
// right. Individual assignment lives on security action items, not on risks.

// GET /risks/:id/residual-history — chronological residual changes.
router.get('/:id/residual-history', canRead, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT h.id, h.changed_at, h.source, h.source_action_id, h.notes,
             u.full_name AS changed_by_name,
             sa.title    AS source_action_title,
             h.prev_probability_c, h.prev_probability_i, h.prev_probability_a,
             h.prev_residual_imp_c, h.prev_residual_imp_i, h.prev_residual_imp_a,
             h.new_probability_c, h.new_probability_i, h.new_probability_a,
             h.new_residual_imp_c, h.new_residual_imp_i, h.new_residual_imp_a
      FROM risk_residual_history h
      LEFT JOIN users u            ON u.id  = h.changed_by
      LEFT JOIN security_actions sa ON sa.id = h.source_action_id
      WHERE h.risk_id = $1
      ORDER BY h.changed_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Exception lifecycle ──────────────────────────────────────────────────────
// Authority enforced by canAcceptRiskAt() based on the risk's current level
// at acceptance time. accepted_role is snapshotted so the audit survives
// later role changes. Creating an exception also sets the risk's
// treatment_decision to 'accept' in the same transaction.

// Wider role list than canWrite: information_asset_owner and siro can accept too.
const canAccept = requireCapability('exceptions.accept');

router.post('/:id/exceptions', canAccept, async (req, res, next) => {
  try {
    await assertWriteScope(req, { id: req.params.id, via: RISK_DEPT_VIA });
    const { id: userId, role } = req.user;
    const { justification, expires_at, review_cadence, notes } = req.body;

    if (!justification?.trim()) return res.status(400).json({ error: 'justification is required.' });
    if (!expires_at)            return res.status(400).json({ error: 'expires_at is required.' });
    if (!review_cadence)        return res.status(400).json({ error: 'review_cadence is required.' });
    if (!VALID_CADENCES.has(review_cadence)) {
      return res.status(400).json({ error: `review_cadence must be one of: ${[...VALID_CADENCES].join(', ')}.` });
    }

    const expDate = new Date(expires_at);
    if (isNaN(expDate.getTime()) || expDate < new Date()) {
      return res.status(400).json({ error: 'expires_at must be a future date.' });
    }

    const { rows: riskRows } = await query(
      `SELECT r.risk_score, oc.exception_accept_analyst_max, oc.exception_accept_owner_max,
              oc.setup_phase_active
         FROM risks r CROSS JOIN org_config oc
        WHERE r.id = $1 AND r.is_active = TRUE`,
      [req.params.id]
    );
    if (!riskRows.length) return res.status(404).json({ error: 'Risk not found.' });
    const { risk_score, exception_accept_analyst_max, exception_accept_owner_max, setup_phase_active } = riskRows[0];

    if (!canAcceptRiskAtScore(risk_score, role, exception_accept_analyst_max, exception_accept_owner_max, setup_phase_active)) {
      return res.status(403).json({
        error: `Role '${role}' is not authorised to accept a risk scoring ${risk_score}.`
      });
    }

    const { rows: existing } = await query(
      `SELECT id FROM exceptions WHERE risk_id = $1 AND status = 'active'`,
      [req.params.id]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'An active exception already exists for this risk. Renew or revoke it first.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: excRows } = await client.query(`
        INSERT INTO exceptions
          (subject_type, origin, risk_id, justification, accepted_by, accepted_role,
           expires_at, review_cadence, notes)
        VALUES ('risk', 'risk_treatment', $1, $2, $3, $4, $5, $6, $7)
        RETURNING id, justification, accepted_by, accepted_role,
                  accepted_at, expires_at, review_cadence, status, notes
      `, [
        req.params.id, justification.trim(), userId, role,
        expires_at, review_cadence, notes?.trim() || null,
      ]);

      await client.query(
        `UPDATE risks SET treatment_decision = 'accept', no_action_required = FALSE WHERE id = $1`,
        [req.params.id]
      );

      await client.query('COMMIT');
      res.status(201).json(excRows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// Renew supersedes the current active exception. Caller authority is
// re-checked against the risk's current level.
router.patch('/:id/exceptions/:eid/renew', canAccept, async (req, res, next) => {
  try {
    await assertWriteScope(req, { id: req.params.id, via: RISK_DEPT_VIA });
    const { id: userId, role } = req.user;
    const { expires_at, review_cadence, justification, notes } = req.body;

    if (!expires_at)     return res.status(400).json({ error: 'expires_at is required.' });
    if (!review_cadence) return res.status(400).json({ error: 'review_cadence is required.' });
    if (!VALID_CADENCES.has(review_cadence)) {
      return res.status(400).json({ error: `review_cadence must be one of: ${[...VALID_CADENCES].join(', ')}.` });
    }
    const expDate = new Date(expires_at);
    if (isNaN(expDate.getTime()) || expDate < new Date()) {
      return res.status(400).json({ error: 'expires_at must be a future date.' });
    }

    const { rows: excRows } = await query(`
      SELECT e.id, e.risk_id, e.justification, e.status, r.risk_score,
             oc.exception_accept_analyst_max, oc.exception_accept_owner_max,
             oc.setup_phase_active
      FROM exceptions e
      JOIN risks r ON r.id = e.risk_id
      CROSS JOIN org_config oc
      WHERE e.id = $1 AND e.risk_id = $2 AND e.status IN ('active', 'expired')
    `, [req.params.eid, req.params.id]);
    if (!excRows.length) return res.status(404).json({ error: 'Active or expired exception not found.' });
    const prev = excRows[0];

    if (!canAcceptRiskAtScore(prev.risk_score, role, prev.exception_accept_analyst_max, prev.exception_accept_owner_max, prev.setup_phase_active)) {
      return res.status(403).json({
        error: `Role '${role}' is not authorised to renew an exception on a risk scoring ${prev.risk_score}.`
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE exceptions SET status = 'renewed', updated_at = now() WHERE id = $1`,
        [prev.id]
      );

      const { rows: newRows } = await client.query(`
        INSERT INTO exceptions
          (subject_type, origin, risk_id, justification, accepted_by, accepted_role,
           expires_at, review_cadence, notes)
        VALUES ('risk', 'risk_treatment', $1, $2, $3, $4, $5, $6, $7)
        RETURNING id, justification, accepted_by, accepted_role,
                  accepted_at, expires_at, review_cadence, status, notes
      `, [
        req.params.id,
        (justification?.trim() || prev.justification),
        userId, role,
        expires_at, review_cadence,
        notes?.trim() || null,
      ]);

      await client.query('COMMIT');
      res.status(201).json(newRows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.patch('/:id/exceptions/:eid/revoke', canAccept, async (req, res, next) => {
  try {
    await assertWriteScope(req, { id: req.params.id, via: RISK_DEPT_VIA });
    const { id: userId, role } = req.user;
    const { notes } = req.body;

    const { rows } = await query(`
      SELECT e.id, r.risk_score, t.name AS threat_name, s.name AS system_name,
             oc.exception_accept_analyst_max, oc.exception_accept_owner_max,
             oc.setup_phase_active
      FROM exceptions e
      JOIN risks r   ON r.id = e.risk_id
      JOIN systems s ON s.id = r.system_id
      JOIN threats t ON t.id = r.threat_id
      CROSS JOIN org_config oc
      WHERE e.id = $1 AND e.risk_id = $2 AND e.status IN ('active', 'expired')
    `, [req.params.eid, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Active or expired exception not found.' });
    const ctx = rows[0];

    if (!canAcceptRiskAtScore(ctx.risk_score, role, ctx.exception_accept_analyst_max, ctx.exception_accept_owner_max, ctx.setup_phase_active)) {
      return res.status(403).json({
        error: `Role '${role}' is not authorised to revoke an exception on a risk scoring ${ctx.risk_score}.`
      });
    }

    // Revoking withdraws the acceptance: the exception → 'revoked' AND the risk's
    // treatment_decision is cleared so it returns to needing a fresh decision
    // (mitigate/transfer/avoid or a new acceptance). Audit-logged. All in one tx.
    // (This differs from expiry, which leaves the risk 'accept' but in breach.)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: updated } = await client.query(`
        UPDATE exceptions
        SET status = 'revoked', revoked_at = now(), revoked_by = $2,
            notes = COALESCE($3, notes), updated_at = now()
        WHERE id = $1
        RETURNING id, status, revoked_at, revoked_by, notes
      `, [req.params.eid, userId, notes?.trim() || null]);

      await client.query(
        `UPDATE risks SET treatment_decision = NULL, no_action_required = FALSE, updated_at = now()
          WHERE id = $1`,
        [req.params.id]
      );

      const { rows: actorRows } = await client.query(
        `SELECT full_name FROM users WHERE id = $1`, [userId]
      );
      const actorName = actorRows[0]?.full_name || 'unknown';
      await client.query(`
        INSERT INTO audit_log
          (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
        VALUES ($1, $2, $3, 'risk_exceptions', $4, 'update', $5)
      `, [
        userId, role, actorName, req.params.eid,
        format_revoke_narrative(actorName, ctx.threat_name, ctx.system_name, notes),
      ]);

      await client.query('COMMIT');
      res.json(updated[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.get('/:id/exceptions', canRead, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT e.id, e.justification, e.accepted_by, e.accepted_role,
             e.accepted_at, e.expires_at, e.review_cadence, e.status,
             e.escalated_at, e.revoked_at, e.revoked_by, e.notes,
             u.full_name  AS accepted_by_name,
             ru.full_name AS revoked_by_name
      FROM exceptions e
      LEFT JOIN users u  ON u.id  = e.accepted_by
      LEFT JOIN users ru ON ru.id = e.revoked_by
      WHERE e.risk_id = $1
      ORDER BY e.accepted_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── DELETE /risks/:id/actions/:aid ────────────────────────────────────────────
// Cancel a proposed action. Only proposed actions can be cancelled this way;
// formally adopted actions must go through the SWG governance flow.

router.delete('/:id/actions/:aid', canWrite, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT status FROM security_actions sa
       JOIN security_action_risks sar ON sar.action_id = sa.id
       WHERE sa.id = $1 AND sar.risk_id = $2`,
      [req.params.aid, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Action not found for this risk.' });
    if (rows[0].status !== 'proposed') {
      return res.status(409).json({ error: 'Only proposed actions can be removed here. Formally adopted actions are managed through the SWG governance flow.' });
    }

    await query(
      `UPDATE security_actions SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [req.params.aid]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /risks/:id/resubmit ────────────────────────────────────────────────────
// Resubmit a returned risk for validation. Wires resubmit_risk() (v74), which flips
// validation_status returned → pending, clears validated_by/at, and audit-logs. The
// route capability guard (risks.write — held by risk_analyst, ciso, admin) is the
// authoritative gate; the stored function no longer hard-codes a role.
router.post('/:id/resubmit', canWrite, async (req, res, next) => {
  try {
    await query(`SELECT resubmit_risk($1, $2)`, [req.params.id, req.user.id]);
    res.status(204).end();
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('not found'))          return res.status(404).json({ error: 'Risk not found.' });
    if (msg.includes('must be returned'))   return res.status(409).json({ error: 'Only a returned risk can be resubmitted.' });
    next(err);
  }
});

// ── POST /risks/:id/discard ───────────────────────────────────────────────────
// Analyst-facing discard: archive (is_active = FALSE) a returned risk the analyst
// judges invalid rather than reworking it. Scoped — only the originator (composer
// or owner), or a ciso/admin, may discard, and only while the risk is 'returned'.
// (ciso/admin retain the broader Archive via DELETE /:id for any state.)
router.post('/:id/discard', canWrite, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.validation_status, r.identified_by, dro.owner_user_ids
         FROM risks r
         JOIN systems sys ON sys.id = r.system_id
         LEFT JOIN v_department_risk_owner dro ON dro.department_id = sys.department_id
        WHERE r.id = $1 AND r.is_active = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Risk not found.' });

    const r = rows[0];
    const isOriginator = r.identified_by === req.user.id
      || (r.owner_user_ids || []).includes(req.user.id);
    const isPrivileged = req.user.role === 'ciso' || req.user.role === 'admin';
    if (!isOriginator && !isPrivileged) {
      return res.status(403).json({ error: 'You can only discard a risk you raised or own.' });
    }
    if (r.validation_status !== 'returned') {
      return res.status(409).json({ error: 'Only a returned risk can be discarded.' });
    }

    const notes = (req.body?.notes || '').trim() || null;
    // Discarding a RETURNED risk means it should never have been raised — the
    // reviewer sent it back and the analyst agreed. That is 'raised_in_error',
    // which excludes it from management information entirely (v100). It is not
    // an 'eliminated' risk: nothing was ever there to eliminate.
    await query(
      `UPDATE risks
          SET is_active = FALSE, updated_at = now(),
              retired_reason = 'raised_in_error', retired_at = now(), retired_by = $2
        WHERE id = $1`,
      [req.params.id, req.user.id]
    );
    await query(
      `INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
       SELECT $1, $2, u.full_name, 'risks', $3, 'delete',
              $4
         FROM users u WHERE u.id = $1`,
      [
        req.user.id, req.user.role, req.params.id,
        notes ? `Returned risk discarded by analyst. Reason: ${notes}` : 'Returned risk discarded by analyst.',
      ]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /risks/:id/retire ────────────────────────────────────────────────────
// Ends a risk, recording WHY. Replaces DELETE /risks/:id, which deactivated the
// row and captured nothing — the reason my-risk-trends could not tell an
// achievement from a typo (docs/threat-identification.md).
//
// Two reasons, and they mean opposite things to management information:
//   no_longer_applies — the exposure genuinely ended. Counts as eliminated.
//   raised_in_error   — never a real risk. Excluded from MI entirely.
//
// Note what is NOT here: "we fixed it". A risk treated down to a low score
// STAYS ACTIVE and keeps its place in the register — that is the achievement,
// and my-risk-trends only counts it while the risk is live. Retiring a treated
// risk would file the success as a disappearance.
//
// The threat stays identified against the system either way: the exposure was
// real and the history refers to it. Un-identifying is only for mis-links, via
// DELETE /threats/:id/systems/:systemId, and is refused once a risk exists.
const RETIRE_REASONS = new Set(['no_longer_applies', 'raised_in_error']);

router.post('/:id/retire', canDelete, async (req, res, next) => {
  try {
    const { reason, notes } = req.body || {};
    if (!RETIRE_REASONS.has(reason)) {
      return res.status(400).json({
        error: `reason must be one of: ${[...RETIRE_REASONS].join(', ')}. A risk cannot be retired without one.`,
      });
    }
    const trimmed = (notes || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'notes are required — record why this risk is being retired.' });

    const { rowCount } = await query(
      `UPDATE risks
          SET is_active = FALSE, updated_at = now(),
              retired_reason = $2::risk_retired_reason, retired_at = now(), retired_by = $3
        WHERE id = $1 AND is_active = TRUE`,
      [req.params.id, reason, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Risk not found.' });

    await query(
      `INSERT INTO audit_log (user_id, user_role, user_name, entity_type, entity_id, action, human_narrative)
       SELECT $1, $2, u.full_name, 'risks', $3, 'delete', $4
         FROM users u WHERE u.id = $1`,
      [req.user.id, req.user.role, req.params.id,
       `Risk retired (${reason}). ${trimmed}`]
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
