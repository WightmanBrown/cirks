'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Walkable knowledge graph — generic one-hop neighbour resolver.
//
// GET /knowledge/graph/:type/:id returns the seed node plus its directly
// connected neighbours as a Cytoscape { nodes, edges } payload. The frontend
// seeds a canvas from a search hit and expands a node at a time ("walk the
// graph"); each click re-hits this endpoint for the tapped node.
//
// Access: gated at the route on knowledge.query (the search audience). Inside,
// the walk is scope-aware EXACTLY like searchAll — the seed must be readable by
// the caller, and each neighbour is included only if the caller holds that
// entity's read capability and (for dept-bearing types) it sits in the caller's
// department or is shared. This is the security boundary: hitting the URL
// directly can't surface anything the caller couldn't otherwise read.

const { query } = require('../../db/pool');
const { can, isDepartmentIsolationEnabled } = require('../../auth/permissions');
const { isDeptScoped, getUserDepartment } = require('../../auth/scoping');

const TYPES = ['service', 'asset', 'system', 'component', 'risk', 'action', 'threat', 'control'];

// read capability per node type (same caps that gate each list page)
const READ_CAP = {
  service:   'services.read',
  asset:     'assets.read',
  system:    'systems.read',
  component: 'components.read',
  risk:      'risks.read',
  action:    'actions.read',
  threat:    'threats.read',
  control:   'controls.read',
};

const PER_REL = 12; // neighbours shown per relationship before an overflow node
const MATURITY_WORDS = ['Initial', 'Developing', 'Defined', 'Managed', 'Optimising'];
const maturityLabel = (v) => (v ? MATURITY_WORDS[Math.min(Math.max(Math.round(v), 1), 5) - 1] : '');

const nodeId = (type, rawId) => `${type}-${rawId}`;
const makeNode = (type, rawId, label, extra = {}) =>
  ({ data: { id: nodeId(type, rawId), rawId, type, label, ...extra } });
const makeEdge = (sourceId, targetId, kind, label = '') =>
  ({ data: { id: `e-${sourceId}__${targetId}__${kind}`, source: sourceId, target: targetId, type: kind, label } });

// ── seed fetch + access check ──────────────────────────────────────────────────
// Returns { node } | 'notfound' | 'forbidden'.
async function fetchSeed(type, id, dp, md) {
  switch (type) {
    case 'service': {
      const { rows } = await query(
        'SELECT id, name, department_id, is_shared FROM business_services WHERE id = $1 AND is_active = TRUE', [id]);
      if (!rows.length) return 'notfound';
      const r = rows[0];
      if (dp && !(r.department_id === md || r.is_shared)) return 'forbidden';
      return { node: makeNode('service', r.id, r.name) };
    }
    case 'asset': {
      const { rows } = await query(
        'SELECT id, name, department_id, is_shared FROM information_assets WHERE id = $1 AND is_active = TRUE', [id]);
      if (!rows.length) return 'notfound';
      const r = rows[0];
      if (dp && !(r.department_id === md || r.is_shared)) return 'forbidden';
      return { node: makeNode('asset', r.id, r.name) };
    }
    case 'system': {
      const { rows } = await query(
        'SELECT id, name, department_id, is_shared FROM systems WHERE id = $1 AND is_active = TRUE', [id]);
      if (!rows.length) return 'notfound';
      const r = rows[0];
      if (dp && !(r.department_id === md || r.is_shared)) return 'forbidden';
      return { node: makeNode('system', r.id, r.name) };
    }
    case 'component': {
      const { rows } = await query(
        'SELECT id, name, component_type FROM control_components WHERE id = $1', [id]);
      if (!rows.length) return 'notfound';
      return { node: makeNode('component', rows[0].id, rows[0].name, { subtype: rows[0].component_type }) };
    }
    case 'risk': {
      const { rows } = await query(
        `SELECT r.id, r.risk_score, r.validation_status, t.name AS threat_name,
                s.name AS system_name, s.department_id, s.is_shared
         FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
         WHERE r.id = $1 AND r.is_active = TRUE`, [id]);
      if (!rows.length) return 'notfound';
      const r = rows[0];
      if (dp && !(r.department_id === md || r.is_shared)) return 'forbidden';
      return { node: makeNode('risk', r.id, `${r.threat_name} on ${r.system_name}`,
        { risk_score: r.risk_score, status: r.validation_status }) };
    }
    case 'action': {
      const { rows } = await query('SELECT id, title, status FROM security_actions WHERE id = $1', [id]);
      if (!rows.length) return 'notfound';
      if (dp) {
        const ok = await query(
          `SELECT 1 FROM security_action_risks sar
             JOIN risks r2   ON r2.id = sar.risk_id AND r2.is_active = TRUE
             JOIN systems s2 ON s2.id = r2.system_id
            WHERE sar.action_id = $1 AND (s2.department_id = $2 OR s2.is_shared = TRUE) LIMIT 1`, [id, md]);
        if (!ok.rows.length) return 'forbidden';
      }
      return { node: makeNode('action', rows[0].id, rows[0].title, { status: rows[0].status }) };
    }
    case 'threat': {
      const { rows } = await query('SELECT id, name FROM threats WHERE id = $1 AND is_active = TRUE', [id]);
      if (!rows.length) return 'notfound';
      return { node: makeNode('threat', rows[0].id, rows[0].name) };
    }
    case 'control': {
      const { rows } = await query('SELECT id, title, status FROM controls WHERE id = $1', [id]);
      if (!rows.length) return 'notfound';
      return { node: makeNode('control', rows[0].id, rows[0].title, { status: rows[0].status }) };
    }
    default:
      return 'notfound';
  }
}

// ── expansion ──────────────────────────────────────────────────────────────────
// ctx = { dp, md, has, seedId, nodes, edges }
async function expand(type, id, ctx) {
  const { dp, md, has, seedId, nodes, edges } = ctx;

  // Run one relationship: gate on cap, query (already LIMITed via PER_REL + window
  // count), push neighbour nodes + edges + an overflow node when truncated.
  async function rel({ cap, neighbourType, kind, sql, params, label, edgeLabel, extra }) {
    if (!has(cap)) return;
    const { rows } = await query(sql, params);
    for (const r of rows) {
      nodes.push(makeNode(neighbourType, r.nid, label(r), extra ? extra(r) : {}));
      edges.push(makeEdge(seedId, nodeId(neighbourType, r.nid), kind, edgeLabel ? edgeLabel(r) : ''));
    }
    const total = rows[0]?.total_count ?? rows.length;
    if (total > rows.length) {
      const ovId = `overflow-${seedId}-${kind}`;
      nodes.push({ data: { id: ovId, rawId: null, type: 'overflow', label: `+${total - rows.length} more ${kind}` } });
      edges.push(makeEdge(seedId, ovId, kind));
    }
  }

  // dept fragment + params for a dept-bearing neighbour on its own table alias
  const deptFrag = (alias) => (dp ? ` AND (${alias}.department_id = $2 OR ${alias}.is_shared = TRUE)` : '');
  const P = dp ? [id, md] : [id];
  // dept fragment for an action neighbour (dept derived from its linked risks' systems)
  const actionDeptFrag = (saAlias) => (dp
    ? ` AND EXISTS (SELECT 1 FROM security_action_risks sar2
         JOIN risks r2 ON r2.id = sar2.risk_id AND r2.is_active = TRUE
         JOIN systems s2 ON s2.id = r2.system_id
         WHERE sar2.action_id = ${saAlias}.id AND (s2.department_id = $2 OR s2.is_shared = TRUE))`
    : '');

  const cnt = 'COUNT(*) OVER()::int AS total_count';
  const riskLabel = (r) => `${r.threat_name} on ${r.system_name}`;

  switch (type) {
    case 'service':
      await rel({ cap: 'assets.read', neighbourType: 'asset', kind: 'asset',
        sql: `SELECT ia.id AS nid, ia.name AS name, ${cnt}
              FROM business_service_systems bss
              JOIN business_services bsx ON bsx.id = bss.service_id
              JOIN system_assets sa ON sa.system_id = bss.system_id
              JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active = TRUE
              WHERE bss.service_id = $1 AND (ia.department_id = bsx.department_id OR ia.is_shared)${deptFrag('ia')}
              ORDER BY ia.name LIMIT ${PER_REL}`, params: P, label: (r) => r.name });
      break;

    case 'asset':
      await rel({ cap: 'services.read', neighbourType: 'service', kind: 'service',
        sql: `SELECT bs.id AS nid, bs.name AS name, ${cnt}
              FROM system_assets sa
              JOIN business_service_systems bss ON bss.system_id = sa.system_id
              JOIN business_services bs ON bs.id = bss.service_id AND bs.is_active = TRUE
              JOIN information_assets iax ON iax.id = sa.asset_id
              WHERE sa.asset_id = $1 AND (iax.department_id = bs.department_id OR iax.is_shared)${deptFrag('bs')}
              ORDER BY bs.name LIMIT ${PER_REL}`, params: P, label: (r) => r.name });
      await rel({ cap: 'systems.read', neighbourType: 'system', kind: 'system',
        sql: `SELECT s.id AS nid, s.name AS name, ${cnt}
              FROM system_assets sa JOIN systems s ON s.id = sa.system_id AND s.is_active = TRUE
              WHERE sa.asset_id = $1${deptFrag('s')}
              ORDER BY s.name LIMIT ${PER_REL}`, params: P, label: (r) => r.name });
      await rel({ cap: 'risks.read', neighbourType: 'risk', kind: 'risk',
        sql: `SELECT r.id AS nid, t.name AS threat_name, s.name AS system_name, r.risk_score, ${cnt}
              FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
              WHERE r.asset_id = $1 AND r.is_active = TRUE${deptFrag('s')}
              ORDER BY r.risk_score DESC NULLS LAST LIMIT ${PER_REL}`, params: P,
        label: riskLabel, extra: (r) => ({ risk_score: r.risk_score }) });
      break;

    case 'system':
      await rel({ cap: 'assets.read', neighbourType: 'asset', kind: 'asset',
        sql: `SELECT ia.id AS nid, ia.name AS name, ${cnt}
              FROM system_assets sa JOIN information_assets ia ON ia.id = sa.asset_id AND ia.is_active = TRUE
              WHERE sa.system_id = $1 ORDER BY ia.name LIMIT ${PER_REL}`, params: [id], label: (r) => r.name });
      await rel({ cap: 'components.read', neighbourType: 'component', kind: 'component',
        sql: `SELECT cc.id AS nid, cc.name AS name, cc.component_type AS subtype, ${cnt}
              FROM system_components sc JOIN control_components cc ON cc.id = sc.component_id
              WHERE sc.system_id = $1 ORDER BY cc.name LIMIT ${PER_REL}`, params: [id],
        label: (r) => r.name, extra: (r) => ({ subtype: r.subtype }) });
      await rel({ cap: 'risks.read', neighbourType: 'risk', kind: 'risk',
        sql: `SELECT r.id AS nid, t.name AS threat_name, s.name AS system_name, r.risk_score, ${cnt}
              FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
              WHERE r.system_id = $1 AND r.is_active = TRUE
              ORDER BY r.risk_score DESC NULLS LAST LIMIT ${PER_REL}`, params: [id],
        label: riskLabel, extra: (r) => ({ risk_score: r.risk_score }) });
      await rel({ cap: 'controls.read', neighbourType: 'control', kind: 'control',
        sql: `SELECT c.id AS nid, c.title AS title, c.effectiveness AS maturity, ${cnt}
              FROM system_controls sc JOIN controls c ON c.id = sc.control_id
              WHERE sc.system_id = $1 ORDER BY c.title LIMIT ${PER_REL}`, params: [id],
        label: (r) => r.title, edgeLabel: (r) => maturityLabel(r.maturity), extra: (r) => ({ maturity: r.maturity }) });
      await rel({ cap: 'threats.read', neighbourType: 'threat', kind: 'threat',
        sql: `SELECT t.id AS nid, t.name AS name, ${cnt}
              FROM system_threats st JOIN threats t ON t.id = st.threat_id AND t.is_active = TRUE
              WHERE st.system_id = $1 ORDER BY t.name LIMIT ${PER_REL}`, params: [id], label: (r) => r.name });
      break;

    case 'component':
      await rel({ cap: 'controls.read', neighbourType: 'control', kind: 'control',
        sql: `SELECT c.id AS nid, c.title AS title, ccl.role AS role, ${cnt}
              FROM control_component_links ccl JOIN controls c ON c.id = ccl.control_id
              WHERE ccl.component_id = $1 ORDER BY c.title LIMIT ${PER_REL}`, params: [id],
        label: (r) => r.title, edgeLabel: (r) => r.role || '' });
      await rel({ cap: 'systems.read', neighbourType: 'system', kind: 'system',
        sql: `SELECT s.id AS nid, s.name AS name, ${cnt}
              FROM system_components sc JOIN systems s ON s.id = sc.system_id AND s.is_active = TRUE
              WHERE sc.component_id = $1${deptFrag('s')}
              ORDER BY s.name LIMIT ${PER_REL}`, params: P, label: (r) => r.name });
      await rel({ cap: 'actions.read', neighbourType: 'action', kind: 'action',
        sql: `SELECT DISTINCT sa.id AS nid, sa.title AS title, ${cnt}
              FROM security_action_items sai JOIN security_actions sa ON sa.id = sai.action_id
              WHERE sai.component_id = $1${actionDeptFrag('sa')}
              ORDER BY sa.title LIMIT ${PER_REL}`, params: P, label: (r) => r.title });
      break;

    case 'risk':
      await rel({ cap: 'systems.read', neighbourType: 'system', kind: 'system',
        sql: `SELECT s.id AS nid, s.name AS name, ${cnt}
              FROM risks r JOIN systems s ON s.id = r.system_id WHERE r.id = $1 LIMIT ${PER_REL}`,
        params: [id], label: (r) => r.name });
      await rel({ cap: 'threats.read', neighbourType: 'threat', kind: 'threat',
        sql: `SELECT t.id AS nid, t.name AS name, ${cnt}
              FROM risks r JOIN threats t ON t.id = r.threat_id WHERE r.id = $1 LIMIT ${PER_REL}`,
        params: [id], label: (r) => r.name });
      await rel({ cap: 'assets.read', neighbourType: 'asset', kind: 'asset',
        sql: `SELECT ia.id AS nid, ia.name AS name, ${cnt}
              FROM risks r JOIN information_assets ia ON ia.id = r.asset_id AND ia.is_active = TRUE
              WHERE r.id = $1 LIMIT ${PER_REL}`, params: [id], label: (r) => r.name });
      await rel({ cap: 'actions.read', neighbourType: 'action', kind: 'action',
        sql: `SELECT sa.id AS nid, sa.title AS title, ${cnt}
              FROM security_action_risks sar JOIN security_actions sa ON sa.id = sar.action_id
              WHERE sar.risk_id = $1 ORDER BY sa.title LIMIT ${PER_REL}`, params: [id], label: (r) => r.title });
      break;

    case 'action':
      await rel({ cap: 'risks.read', neighbourType: 'risk', kind: 'risk',
        sql: `SELECT r.id AS nid, t.name AS threat_name, s.name AS system_name, r.risk_score, ${cnt}
              FROM security_action_risks sar
              JOIN risks r   ON r.id = sar.risk_id AND r.is_active = TRUE
              JOIN systems s ON s.id = r.system_id
              JOIN threats t ON t.id = r.threat_id
              WHERE sar.action_id = $1${deptFrag('s')}
              ORDER BY r.risk_score DESC NULLS LAST LIMIT ${PER_REL}`, params: P,
        label: riskLabel, extra: (r) => ({ risk_score: r.risk_score }) });
      await rel({ cap: 'controls.read', neighbourType: 'control', kind: 'control',
        sql: `SELECT DISTINCT c.id AS nid, c.title AS title, c.effectiveness AS maturity, ${cnt}
              FROM security_action_items sai JOIN controls c ON c.id = sai.control_id
              WHERE sai.action_id = $1 ORDER BY c.title LIMIT ${PER_REL}`, params: [id],
        label: (r) => r.title, edgeLabel: (r) => maturityLabel(r.maturity), extra: (r) => ({ maturity: r.maturity }) });
      await rel({ cap: 'components.read', neighbourType: 'component', kind: 'component',
        sql: `SELECT DISTINCT cc.id AS nid, cc.name AS name, cc.component_type AS subtype, ${cnt}
              FROM security_action_items sai JOIN control_components cc ON cc.id = sai.component_id
              WHERE sai.action_id = $1 ORDER BY cc.name LIMIT ${PER_REL}`, params: [id],
        label: (r) => r.name, extra: (r) => ({ subtype: r.subtype }) });
      break;

    case 'threat':
      await rel({ cap: 'risks.read', neighbourType: 'risk', kind: 'risk',
        sql: `SELECT r.id AS nid, t.name AS threat_name, s.name AS system_name, r.risk_score, ${cnt}
              FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
              WHERE r.threat_id = $1 AND r.is_active = TRUE${deptFrag('s')}
              ORDER BY r.risk_score DESC NULLS LAST LIMIT ${PER_REL}`, params: P,
        label: riskLabel, extra: (r) => ({ risk_score: r.risk_score }) });
      await rel({ cap: 'controls.read', neighbourType: 'control', kind: 'control',
        sql: `SELECT c.id AS nid, c.title AS title, ${cnt}
              FROM control_threats ct JOIN controls c ON c.id = ct.control_id
              WHERE ct.threat_id = $1 ORDER BY c.title LIMIT ${PER_REL}`, params: [id], label: (r) => r.title });
      await rel({ cap: 'systems.read', neighbourType: 'system', kind: 'system',
        sql: `SELECT s.id AS nid, s.name AS name, ${cnt}
              FROM system_threats st JOIN systems s ON s.id = st.system_id AND s.is_active = TRUE
              WHERE st.threat_id = $1${deptFrag('s')}
              ORDER BY s.name LIMIT ${PER_REL}`, params: P, label: (r) => r.name });
      break;

    case 'control':
      await rel({ cap: 'components.read', neighbourType: 'component', kind: 'component',
        sql: `SELECT cc.id AS nid, cc.name AS name, cc.component_type AS subtype, ccl.role AS role, ${cnt}
              FROM control_component_links ccl JOIN control_components cc ON cc.id = ccl.component_id
              WHERE ccl.control_id = $1 ORDER BY cc.name LIMIT ${PER_REL}`, params: [id],
        label: (r) => r.name, edgeLabel: (r) => r.role || '', extra: (r) => ({ subtype: r.subtype }) });
      await rel({ cap: 'threats.read', neighbourType: 'threat', kind: 'threat',
        sql: `SELECT t.id AS nid, t.name AS name, ${cnt}
              FROM control_threats ct JOIN threats t ON t.id = ct.threat_id AND t.is_active = TRUE
              WHERE ct.control_id = $1 ORDER BY t.name LIMIT ${PER_REL}`, params: [id], label: (r) => r.name });
      await rel({ cap: 'systems.read', neighbourType: 'system', kind: 'system',
        sql: `SELECT s.id AS nid, s.name AS name, (SELECT effectiveness FROM controls WHERE id = $1) AS maturity, ${cnt}
              FROM system_controls sc JOIN systems s ON s.id = sc.system_id AND s.is_active = TRUE
              WHERE sc.control_id = $1${deptFrag('s')}
              ORDER BY s.name LIMIT ${PER_REL}`, params: P,
        label: (r) => r.name, edgeLabel: (r) => maturityLabel(r.maturity) });
      await rel({ cap: 'actions.read', neighbourType: 'action', kind: 'action',
        sql: `SELECT DISTINCT sa.id AS nid, sa.title AS title, ${cnt}
              FROM security_action_items sai JOIN security_actions sa ON sa.id = sai.action_id
              WHERE sai.control_id = $1${actionDeptFrag('sa')}
              ORDER BY sa.title LIMIT ${PER_REL}`, params: P, label: (r) => r.title });
      break;
  }
}

// GET /knowledge/graph/:type/:id
async function neighbors(req, res, next) {
  const { type, id } = req.params;
  if (!TYPES.includes(type)) return res.status(400).json({ error: `Unknown entity type "${type}".` });

  try {
    const { role, id: userId } = req.user;
    const dp = isDeptScoped(role) && isDepartmentIsolationEnabled();
    const md = dp ? await getUserDepartment(userId) : null;
    if (dp && !md) return res.status(403).json({ error: 'No department assigned.' });

    const has = (cap) => can(role, cap).allowed;
    if (!has(READ_CAP[type])) return res.status(403).json({ error: 'Forbidden.' });

    const seed = await fetchSeed(type, id, dp, md);
    if (seed === 'notfound') return res.status(404).json({ error: 'Not found.' });
    if (seed === 'forbidden') return res.status(403).json({ error: 'Outside your department.' });

    const nodes = [seed.node];
    const edges = [];
    await expand(type, id, { dp, md, has, seedId: seed.node.data.id, nodes, edges });

    // de-dupe nodes/edges by id (a neighbour can be reached more than one way)
    const uniq = (arr) => {
      const seen = new Set();
      return arr.filter((e) => (seen.has(e.data.id) ? false : seen.add(e.data.id)));
    };
    res.json({ root: { type, id }, nodes: uniq(nodes), edges: uniq(edges) });
  } catch (err) {
    next(err);
  }
}

module.exports = { neighbors, TYPES };
