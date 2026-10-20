'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

const MAX_ASSETS     = 5;
const MAX_COMPONENTS = 5; // per PPITF type before collapsing

async function getRiskGraph(req, res, next) {
  const { id } = req.params;

  try {
    // Risk + system + threat
    const riskRes = await query(`
      SELECT
        r.id, r.risk_score,
        r.system_id,   s.name AS system_name, s.department_id,
        r.threat_id,   t.name AS threat_name, t.threat_category
      FROM risks r
      JOIN systems s ON s.id = r.system_id
      JOIN threats t ON t.id = r.threat_id
      WHERE r.id = $1 AND r.is_active = TRUE
    `, [id]);

    if (!riskRes.rows.length) return res.status(404).json({ error: 'Risk not found.' });
    const risk = riskRes.rows[0];

    // Top-5 information assets on the system, by max CIA desc
    const assetRes = await query(`
      SELECT
        ia.id, ia.name,
        ia.confidentiality AS c,
        ia.integrity       AS i,
        ia.availability    AS a,
        GREATEST(COALESCE(ia.confidentiality,0), COALESCE(ia.integrity,0), COALESCE(ia.availability,0)) AS max_cia
      FROM system_assets sa
      JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active = TRUE
      WHERE sa.system_id = $1
      ORDER BY max_cia DESC NULLS LAST, ia.name
      LIMIT $2
    `, [risk.system_id, MAX_ASSETS]);

    // Total asset count (for "…and N more" label)
    const assetCountRes = await query(
      `SELECT COUNT(*)::int AS total FROM system_assets sa
       JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active = TRUE
       WHERE sa.system_id = $1`,
      [risk.system_id]
    );
    const totalAssets = assetCountRes.rows[0]?.total ?? 0;

    // Components on the system, grouped by type
    const compRes = await query(`
      SELECT cc.component_type AS type, COUNT(*)::int AS count
      FROM system_components sc
      JOIN control_components cc ON cc.id = sc.component_id
      WHERE sc.system_id = $1
      GROUP BY cc.component_type
      ORDER BY cc.component_type
    `, [risk.system_id]);

    // Controls on system for this threat (derived model)
    const controlRes = await query(`
      SELECT sc.control_id AS id, c.title AS name, c.effectiveness AS maturity
      FROM v_control_presence sc
      JOIN controls c ON c.id = sc.control_id
      JOIN control_threats ct ON ct.control_id = sc.control_id AND ct.threat_id = $1
      WHERE sc.system_id = $2 AND sc.status <> 'not_applicable'
      ORDER BY c.title
      LIMIT 5
    `, [risk.threat_id, risk.system_id]);

    // ── Build Cytoscape elements ────────────────────────────────────────────

    const nodes = [];
    const edges = [];

    // System (centre)
    nodes.push({ data: {
      id:    `sys-${risk.system_id}`,
      label: risk.system_name,
      type:  'system',
    }});

    // Risk node
    nodes.push({ data: {
      id:    `risk-${risk.id}`,
      label: `Risk\nscore ${risk.risk_score}`,
      type:  'risk',
      score: risk.risk_score,
    }});
    edges.push({ data: {
      id:     `e-sys-risk`,
      source: `sys-${risk.system_id}`,
      target: `risk-${risk.id}`,
      type:   'has_risk',
    }});

    // Threat node
    nodes.push({ data: {
      id:       `threat-${risk.threat_id}`,
      label:    risk.threat_name,
      type:     'threat',
      category: risk.threat_category,
    }});
    edges.push({ data: {
      id:     `e-risk-threat`,
      source: `risk-${risk.id}`,
      target: `threat-${risk.threat_id}`,
      label:  'from threat',
      type:   'from_threat',
    }});

    // Information asset nodes (top 5)
    for (const ia of assetRes.rows) {
      nodes.push({ data: {
        id:    `asset-${ia.id}`,
        label: ia.name,
        type:  'asset',
        max_cia: ia.max_cia,
      }});
      edges.push({ data: {
        id:     `e-asset-${ia.id}`,
        source: `asset-${ia.id}`,
        target: `sys-${risk.system_id}`,
        label:  ia.max_cia > 0 ? impactLabel(ia.max_cia) : '',
        type:   'asset_of',
      }});
    }

    // "…and N more" overflow node
    const shown = assetRes.rows.length;
    if (totalAssets > shown) {
      const overflow = totalAssets - shown;
      nodes.push({ data: {
        id:    `asset-overflow`,
        label: `+${overflow} more`,
        type:  'asset_overflow',
      }});
      edges.push({ data: {
        id:     `e-asset-overflow`,
        source: `asset-overflow`,
        target: `sys-${risk.system_id}`,
        type:   'asset_of',
      }});
    }

    // Component group nodes (one per PPITF type)
    for (const grp of compRes.rows) {
      nodes.push({ data: {
        id:    `comp-${grp.type}`,
        label: `${capitalise(grp.type)}\n(${grp.count})`,
        type:  grp.type,
        count: grp.count,
      }});
      edges.push({ data: {
        id:     `e-comp-${grp.type}`,
        source: `comp-${grp.type}`,
        target: `sys-${risk.system_id}`,
        type:   'component_of',
      }});
    }

    // Mitigating control nodes (system_controls ∩ control_threats for this threat)
    for (const ctrl of controlRes.rows) {
      nodes.push({ data: {
        id:      `ctrl-${ctrl.id}`,
        label:   ctrl.name,
        type:    'control',
        maturity: ctrl.maturity,
      }});
      edges.push({ data: {
        id:     `e-ctrl-${ctrl.id}`,
        source: `ctrl-${ctrl.id}`,
        target: `risk-${risk.id}`,
        label:  ctrl.maturity ? maturityLabel(ctrl.maturity) : 'mitigates',
        type:   'mitigates',
      }});
    }

    res.json({ nodes, edges });
  } catch (err) {
    next(err);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

const IMPACT_WORDS   = ['Minimal', 'Minor', 'Moderate', 'Major', 'Severe'];
const MATURITY_WORDS = ['Initial', 'Developing', 'Defined', 'Managed', 'Optimising'];

function impactLabel(v) {
  return IMPACT_WORDS[Math.min(Math.max(Math.round(v), 1), 5) - 1] ?? '';
}
function maturityLabel(v) {
  return MATURITY_WORDS[Math.min(Math.max(Math.round(v), 1), 5) - 1] ?? '';
}
function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { getRiskGraph };
