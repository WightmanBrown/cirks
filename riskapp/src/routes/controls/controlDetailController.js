'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');
const { CIRKS_NAME, cirksReasonFor } = require('../../lib/cirksDelivers');

// CIRKS itself can deliver this objective: the reason, and whether it is chosen.
function cirksSuggestion(standardRefs, patterns) {
  const why = cirksReasonFor(standardRefs);
  return why && { ...why, chosen: patterns.some((p) => p.name.toLowerCase() === CIRKS_NAME.toLowerCase()) };
}

async function getControl(req, res, next) {
  const { id } = req.params;

  try {
    const [controlResult, threatsResult, soaResult, deployResult, risksResult, scopeResult, whereResult, reachResult] = await Promise.all([
      query(
        `SELECT
           c.id,
           c.title,
           c.description,
           c.control_type,
           c.effectiveness,
           c.effectiveness_notes,
           (SELECT vcs.status FROM v_control_status vcs WHERE vcs.control_id = c.id) AS status,
           c.is_baseline,
           c.owner_user_id,
           c.reference_code,
           c.delivery,
           ow.full_name AS owner_name,
           ru.full_name AS rated_by_name,
           c.rated_at,
           cu.full_name AS created_by_name,
           c.created_at,
           c.updated_at,
           COALESCE((
             SELECT json_agg(jsonb_build_object('standard', s.code, 'standard_name', s.name, 'ref', sc.ref_code)
                             ORDER BY s.sort_index, sc.sort_index)
             FROM control_mappings cm
             JOIN standard_controls sc ON sc.id = cm.standard_control_id
             JOIN standards s          ON s.id  = sc.standard_id
             WHERE cm.control_id = c.id
           ), '[]'::json) AS standard_refs
         FROM controls c
         LEFT JOIN users ru ON ru.id = c.rated_by
         LEFT JOIN users cu ON cu.id = c.created_by
         LEFT JOIN users ow ON ow.id = c.owner_user_id
         WHERE c.id = $1`,
        [id]
      ),
      query(
        `SELECT
           ct.id,
           ct.notes,
           t.id             AS threat_id,
           t.name           AS threat_name,
           t.threat_category,
           t.source         AS threat_source
         FROM control_threats ct
         JOIN threats t ON t.id = ct.threat_id
         WHERE ct.control_id = $1
         ORDER BY t.threat_category ASC, t.name ASC`,
        [id]
      ),
      // The objective's SoA entry: is it adopted, why, and how it is implemented.
      // Shown read-only here; it is EDITED in the Statement of Applicability.
      query(
        `SELECT se.applicable, se.justification,
                -- Derived for a control delivered on each system, stated
                -- otherwise (v129); the stated value is kept as stated_status.
                vci.implementation_status, se.implementation_status AS stated_status,
                vci.status_source AS implementation_source, vci.partial_reasons,
                vci.threat_systems, vci.threat_systems_present, vci.threat_systems_unknown, vci.present_systems,
                vci.degraded_systems, vci.expected_systems, vci.expected_systems_present,
                vci.work_planned, vci.delivery_not_stated,
                se.implementation_description, se.drivers, se.updated_at,
                u.full_name AS updated_by_name
         FROM soa_entries se
         JOIN v_control_implementation vci ON vci.control_id = se.control_id
         LEFT JOIN users u ON u.id = se.updated_by
         WHERE se.control_id = $1`,
        [id]
      ),
      // Where the control is deployed, by per-system status.
      query(
        `SELECT status::text AS status, COUNT(*)::int AS n
         FROM system_controls WHERE control_id = $1 GROUP BY status`,
        [id]
      ),
      // Active risks it treats: deployed on the risk's system (not excluded there)
      // AND linked to the risk's threat — the same intersection as the coverage panel.
      query(
        `SELECT COUNT(DISTINCT r.id)::int AS risks, COUNT(DISTINCT r.system_id)::int AS systems
         FROM v_control_presence syc
         JOIN control_threats ct ON ct.control_id = syc.control_id
         JOIN risks r ON r.system_id = syc.system_id AND r.threat_id = ct.threat_id AND r.is_active = TRUE
         WHERE syc.control_id = $1 AND syc.status <> 'not_applicable'`,
        [id]
      ),
      // Where it applies (v126) and how deployment compares: expected = the systems
      // it should be on; `outside` = deployed on a system in none of its scopes —
      // the mirror finding (docs/statement-of-applicability.md §5).
      query(
        `SELECT
           COALESCE((SELECT json_agg(json_build_object('id', sco.id, 'name', sco.name) ORDER BY lower(sco.name))
                       FROM soa_entry_scopes x JOIN scopes sco ON sco.id = x.scope_id
                      WHERE x.control_id = $1), '[]'::json) AS scopes,
           (SELECT count(*)::int FROM v_objective_expected_systems e WHERE e.control_id = $1) AS expected,
           (SELECT count(*)::int FROM v_objective_expected_systems e
              JOIN system_controls syc ON syc.system_id = e.system_id AND syc.control_id = e.control_id
                                      AND syc.status <> 'not_applicable'
             WHERE e.control_id = $1) AS deployed_expected,
           (SELECT count(*)::int FROM system_controls syc
             WHERE syc.control_id = $1 AND syc.status <> 'not_applicable'
               AND EXISTS (SELECT 1 FROM soa_entries se WHERE se.control_id = $1 AND se.applicable)
               AND NOT EXISTS (SELECT 1 FROM v_objective_expected_systems e
                                WHERE e.control_id = $1 AND e.system_id = syc.system_id)) AS deployed_outside`,
        [id]
      ),
      // WHY it is on each system. `system_controls.provenance` says 'recorded' on
      // all 823 rows and nothing ever writes anything else, so the stored answer
      // is no answer — but the real one is derivable: a control reaches a risk
      // through `system_controls ∩ control_threats`, so the threats it counters
      // that are ALSO identified on that system are exactly why it belongs there.
      // Where there are none it is a baseline deployment: good practice, treating
      // no identified threat, which is a different (and legitimate) reason.
      query(
        `SELECT p.system_id, s.name AS system_name, d.name AS department_name,
                p.status::text AS status, p.via, p.exclusion_reason, p.created_at,
                COALESCE(th.list, '[]'::json) AS threats,
                COALESCE(rk.list, '[]'::json) AS risks
           FROM v_control_presence p
           JOIN systems s          ON s.id = p.system_id AND s.is_active
           LEFT JOIN departments d ON d.id = s.department_id
           LEFT JOIN LATERAL (
             -- Identified on the system, OR carrying an active risk there. A risk
             -- is the stronger evidence and does not always have its
             -- system_threats row: seed risk ...0001 on Active Directory has
             -- none, and calling that deployment "baseline" would have been wrong.
             SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name) AS list
               FROM control_threats ct
               JOIN threats t ON t.id = ct.threat_id
              WHERE ct.control_id = p.control_id
                AND (EXISTS (SELECT 1 FROM system_threats st
                              WHERE st.threat_id = t.id AND st.system_id = p.system_id)
                  OR EXISTS (SELECT 1 FROM risks r
                              WHERE r.threat_id = t.id AND r.system_id = p.system_id AND r.is_active))
           ) th ON TRUE
           LEFT JOIN LATERAL (
             SELECT json_agg(json_build_object(
                      'risk_id', r.id, 'threat', t.name, 'score', r.risk_score,
                      'probability', r.probability_c || '/' || r.probability_i || '/' || r.probability_a,
                      'judged', CASE WHEN rcp.control_id IS NOT NULL
                                     THEN rcp.probability_c || '/' || rcp.probability_i || '/' || rcp.probability_a END)
                      ORDER BY r.risk_score DESC) AS list
               FROM risks r
               JOIN threats t           ON t.id = r.threat_id
               JOIN control_threats ct  ON ct.threat_id = r.threat_id AND ct.control_id = p.control_id
               LEFT JOIN risk_control_probability rcp
                      ON rcp.risk_id = r.id AND rcp.control_id = p.control_id
              WHERE r.system_id = p.system_id AND r.is_active) rk ON TRUE
          WHERE p.control_id = $1
          ORDER BY s.name`,
        [id]
      ),
      // How it is delivered (v127): the systems it reaches by that mode, and — for
      // a group — which people groups, each with the systems it is present on.
      query(
        `SELECT
           (SELECT count(*)::int FROM v_control_reach r WHERE r.control_id = $1) AS reach,
           COALESCE((SELECT json_agg(json_build_object('id', cc.id, 'name', cc.name,
                        'systems', (SELECT count(*)::int FROM system_components sc WHERE sc.component_id = cc.id))
                        ORDER BY lower(cc.name))
                       FROM control_component_links l
                       JOIN control_components cc ON cc.id = l.component_id AND cc.component_type = 'people'
                      WHERE l.control_id = $1), '[]'::json) AS groups`,
        [id]
      ),
    ]);

    if (controlResult.rows.length === 0) {
      return res.status(404).json({ error: `Control ${id} not found.` });
    }

    const control = controlResult.rows[0];
    // Primary mapped reference for legacy framework/framework_ref consumers.
    // An objective mapped to no standard is CUSTOM and shows its own reference.
    control.framework       = control.standard_refs?.[0]?.standard ?? 'custom';
    control.framework_label = control.standard_refs?.[0]?.standard_name ?? 'Custom';
    control.framework_ref   = control.standard_refs?.[0]?.ref ?? control.reference_code ?? null;

    // A read-out of how well the objective is being met, for anyone who opens it.
    const byStatus = Object.fromEntries((deployResult?.rows || []).map(r => [r.status, r.n]));
    const readout = {
      deployed_systems: Object.entries(byStatus)
        .filter(([s]) => s !== 'not_applicable').reduce((n, [, c]) => n + c, 0),
      by_status: byStatus,
      risks_treated: risksResult?.rows?.[0]?.risks ?? 0,
      expected_systems:  scopeResult?.rows?.[0]?.expected ?? 0,
      deployed_expected: scopeResult?.rows?.[0]?.deployed_expected ?? 0,
      // "Outside where it applies" is a per-system idea: an organisation-wide or
      // group control is not deployed system by system.
      deployed_outside:  ['organisation', 'group'].includes(controlResult.rows[0]?.delivery)
        ? 0 : (scopeResult?.rows?.[0]?.deployed_outside ?? 0),
      reach_systems:     reachResult?.rows?.[0]?.reach ?? 0,
      groups:            reachResult?.rows?.[0]?.groups ?? [],
      systems_with_risks_treated: risksResult?.rows?.[0]?.systems ?? 0,
    };
    const soaRow = soaResult?.rows?.[0] || null;
    const scopes = scopeResult?.rows?.[0]?.scopes || [];
    const soa = soaRow
      ? { decided: true, ...soaRow, drivers: soaRow.drivers || [], scopes }
      : { decided: false, applicable: false, justification: null, implementation_status: 'not_implemented',
          implementation_description: null, drivers: [], scopes: [] };

    // Where it is, and why — each system with the threats it counters there and
    // the risks that follow. No threats = a baseline deployment (v131).
    const deployments = (whereResult?.rows || []).map(r => ({
      ...r,
      threats: r.threats || [],
      risks: r.risks || [],
      reason: (r.threats || []).length ? 'risk' : 'baseline',
    }));

    // v145: the valid ways it is delivered, and how each system is delivered.
    const { patternsFor, deliveryFor } = require('./deliveryPatternsController');
    const [deliveryPatterns, deliveryBySystem] = await Promise.all([patternsFor(id), deliveryFor(id)]);

    res.json({
      control,
      threats: threatsResult.rows,
      soa,
      readout,
      deployments,
      delivery_patterns: deliveryPatterns,
      delivery_by_system: deliveryBySystem,
      // CIRKS itself can deliver this objective (lib/cirksDelivers.js): the reason,
      // and whether it has been chosen. Only a suggestion until someone chooses it.
      cirks: cirksSuggestion(control.standard_refs, deliveryPatterns),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getControl };
