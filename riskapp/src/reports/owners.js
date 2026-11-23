'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Who owns what — the CISO's C4 (docs/reporting-ciso.md). When it goes wrong,
// whose is it? One row per person: what they are ACCOUNTABLE for (risks as the
// derived risk owner, systems, information assets, business services, supplier
// relationships), what they are RESPONSIBLE for (open action items and actions,
// control objectives, documents, findings to answer) and the LOAD in that
// (above the threshold or overdue). Folded per department. Then the gaps, which
// are the point: departments whose risks fall back to the SIRO, records with no
// owner or manager, records named to someone inactive, and objectives,
// documents and findings nobody owns.
//
// Accountability follows the record CIRKS already keeps — nothing here is
// stored: a risk's owner is its department's IAO, else the SIRO
// (v_department_risk_owner, v108); a business service's and a supplier
// relationship's the same through their department; a system's and an asset's
// the stored owner_user_id, as their pages show.

const { query } = require('../db/pool');

const OPEN_ACTION = `a.status NOT IN ('completed', 'cancelled', 'verified', 'rejected')`;
const OPEN_ITEM = `i.status NOT IN ('completed', 'withdrawn')`;
const GAP_ROWS = 25;

// The five findings that can be acted on or accepted (src/routes/findings).
// A finding is still to be answered while it holds with no open action and no
// active acceptance.
const FINDINGS = [
  { kind: 'rating-incomplete', origin: 'rating_incomplete', subject: 'asset', view: 'v_asset_rating_findings', key: 'asset_id', name: 'f.asset_name' },
  { kind: 'component-record', origin: 'component_record', subject: 'system', view: 'v_system_component_findings', key: 'system_id', name: 'f.system_name' },
  { kind: 'document-review', origin: 'document_review', subject: 'component', view: 'v_document_review_findings', key: 'component_id', name: 'f.document_name' },
  { kind: 'supplier-assurance', origin: 'supplier_assurance', subject: 'supplier_relationship', view: 'v_supplier_assurance_findings', key: 'relationship_id', name: `f.supplier_name || ' (' || f.touches || ')'` },
  { kind: 'objective-solution', origin: 'objective_solution', subject: 'control', view: 'v_objective_solution_findings', key: 'control_id', name: `COALESCE(f.reference || ' ', '') || f.objective_title` },
];
const FINDINGS_SQL = FINDINGS.map((k) => `
  SELECT '${k.kind}' AS kind, f.${k.key} AS id, ${k.name} AS name, f.owner_user_id, f.department_id
    FROM ${k.view} f
   WHERE NOT EXISTS (SELECT 1 FROM security_actions a
                      WHERE a.origin = '${k.origin}' AND a.subject_type = '${k.subject}'
                        AND a.subject_id = f.${k.key} AND ${OPEN_ACTION})
     AND NOT EXISTS (SELECT 1 FROM exceptions x
                      WHERE x.origin = '${k.origin}' AND x.subject_type = '${k.subject}'
                        AND x.subject_id = f.${k.key} AND x.status = 'active')`).join(' UNION ALL ');

// The risk an action is about, for the link (a risk action is worked on its risk).
const ACTION_RISK = `(SELECT sar.risk_id FROM security_action_risks sar WHERE sar.action_id = a.id ORDER BY sar.created_at LIMIT 1)`;

async function computeOwners() {
  const [{ rows: [cfg] }, { rows: users }, { rows: extraRoles }, { rows: depts }, { rows: risks },
         { rows: systems }, { rows: assets }, { rows: services }, { rows: suppliers }, { rows: items },
         { rows: actions }, { rows: controls }, { rows: documents }, { rows: findings }] = await Promise.all([
    query(`SELECT mandatory_action_score FROM org_config LIMIT 1`),
    query(`SELECT id, full_name, email, role::text AS role, department_id, is_active FROM users`),
    query(`SELECT user_id, role::text AS role FROM v_user_roles`),
    query(`SELECT d.id, d.name, o.owner_user_ids, o.owner_names, o.is_siro_fallback,
                  (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name) FROM users u
                    WHERE u.department_id = d.id AND u.is_active AND u.role = 'information_asset_manager') AS manager_names
             FROM departments d LEFT JOIN v_department_risk_owner o ON o.department_id = d.id ORDER BY d.name`),
    query(`SELECT r.id, r.risk_score AS score, (r.review_date < CURRENT_DATE) AS past_review,
                  s.department_id, s.name AS system_name, t.name AS threat_name
             FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
            WHERE r.is_active`),
    query(`SELECT id, name, department_id, owner_user_id, managed_by_user_id FROM systems WHERE is_active ORDER BY name`),
    query(`SELECT id, name, department_id, owner_user_id, managed_by_user_id FROM information_assets WHERE is_active ORDER BY name`),
    query(`SELECT id, name, owner_department_id AS department_id, managed_by_user_id FROM business_services WHERE is_active ORDER BY name`),
    query(`SELECT r.id, r.supplier_id, s.name, r.relationship_type::text AS relationship_type, r.department_id,
                  COALESCE(sy.name, cc.name) AS touches
             FROM supplier_relationships r JOIN suppliers s ON s.id = r.supplier_id
             LEFT JOIN systems sy ON sy.id = r.system_id
             LEFT JOIN control_components cc ON cc.id = r.component_id
            WHERE r.status IN ('active', 'exiting') ORDER BY s.name, COALESCE(sy.name, cc.name)`),
    query(`SELECT i.id, i.owner_user_id, a.id AS action_id, a.title, a.target_date,
                  (a.target_date < CURRENT_DATE) AS overdue, ${ACTION_RISK} AS risk_id,
                  COALESCE(cc.name, c.title) AS element_name, sy.name AS system_name, sy.department_id
             FROM security_action_items i
             JOIN security_actions a ON a.id = i.action_id
             LEFT JOIN control_components cc ON cc.id = i.component_id
             LEFT JOIN controls c ON c.id = i.control_id
             LEFT JOIN systems sy ON sy.id = i.system_id
            WHERE ${OPEN_ITEM} AND ${OPEN_ACTION}
            ORDER BY a.target_date NULLS LAST`),
    query(`SELECT a.id, a.primary_owner_user_id AS owner_user_id, a.title, a.status::text AS status, a.target_date,
                  (a.target_date < CURRENT_DATE) AS overdue, ${ACTION_RISK} AS risk_id
             FROM security_actions a WHERE ${OPEN_ACTION} ORDER BY a.target_date NULLS LAST`),
    // An objective is owned if its owner or its SoA entry's owner is named.
    // Only applicable objectives need one.
    query(`SELECT c.id, c.title, vr.framework_ref AS ref, c.owner_user_id, se.owner_user_id AS soa_owner_user_id,
                  COALESCE(se.applicable, FALSE) AS applicable
             FROM controls c
             LEFT JOIN soa_entries se ON se.control_id = c.id
             LEFT JOIN v_control_reference vr ON vr.control_id = c.id
            ORDER BY vr.framework_ref NULLS LAST, c.title`),
    query(`SELECT id, name, document_kind, document_owner_id AS owner_user_id
             FROM control_components WHERE component_type = 'information' AND document_kind IS NOT NULL ORDER BY name`),
    query(FINDINGS_SQL),
  ]);

  const action = cfg.mandatory_action_score;
  const deptById = new Map(depts.map((d) => [d.id, d]));
  const deptName = (id) => deptById.get(id)?.name || null;
  const userById = new Map(users.map((u) => [u.id, u]));
  const rolesOf = new Map();
  for (const r of extraRoles) {
    if (!rolesOf.has(r.user_id)) rolesOf.set(r.user_id, new Set());
    rolesOf.get(r.user_id).add(r.role);
  }

  // One entry per person who holds anything, created on first mention.
  const people = new Map();
  const person = (id) => {
    if (!people.has(id)) {
      const u = userById.get(id);
      if (!u) return null;
      people.set(id, {
        id, name: u.full_name, email: u.email, role: u.role,
        roles: [...(rolesOf.get(id) || [u.role])].sort(),
        department_id: u.department_id, department_name: deptName(u.department_id), is_active: u.is_active,
        accountable: { risks: [], systems: [], assets: [], services: [], suppliers: [] },
        responsible: { items: [], actions: [], controls: [], documents: [], findings: [] },
        manages: { systems: [], assets: [], services: [] },
      });
    }
    return people.get(id);
  };
  const add = (id, path, row) => {
    if (!id) return;
    const p = person(id);
    if (!p) return;
    const [group, key] = path.split('.');
    p[group][key].push(row);
  };
  // The department's risk owners (its IAOs, else the SIRO).
  const ownersOf = (deptId) => deptById.get(deptId)?.owner_user_ids || [];

  for (const r of risks) {
    const row = { id: r.id, score: r.score, past_review: r.past_review, system_name: r.system_name, threat_name: r.threat_name, department_id: r.department_id };
    for (const id of ownersOf(r.department_id)) add(id, 'accountable.risks', row);
  }
  for (const s of systems) {
    const row = { id: s.id, name: s.name, department_id: s.department_id };
    add(s.owner_user_id, 'accountable.systems', row);
    add(s.managed_by_user_id, 'manages.systems', row);
  }
  for (const a of assets) {
    const row = { id: a.id, name: a.name, department_id: a.department_id };
    add(a.owner_user_id, 'accountable.assets', row);
    add(a.managed_by_user_id, 'manages.assets', row);
  }
  for (const s of services) {
    const row = { id: s.id, name: s.name, department_id: s.department_id };
    for (const id of ownersOf(s.department_id)) add(id, 'accountable.services', row);
    add(s.managed_by_user_id, 'manages.services', row);
  }
  for (const r of suppliers) {
    const row = { id: r.id, supplier_id: r.supplier_id, name: r.name, relationship_type: r.relationship_type, touches: r.touches, department_id: r.department_id };
    for (const id of ownersOf(r.department_id)) add(id, 'accountable.suppliers', row);
  }
  for (const i of items) {
    add(i.owner_user_id, 'responsible.items', {
      id: i.id, action_id: i.action_id, title: i.title, element_name: i.element_name, system_name: i.system_name,
      target_date: i.target_date, overdue: !!i.overdue, risk_id: i.risk_id,
    });
  }
  for (const a of actions) {
    add(a.owner_user_id, 'responsible.actions', {
      id: a.id, title: a.title, status: a.status, target_date: a.target_date, overdue: !!a.overdue, risk_id: a.risk_id,
    });
  }
  for (const c of controls) {
    const row = { id: c.id, title: c.title, ref: c.ref, applicable: c.applicable };
    add(c.owner_user_id, 'responsible.controls', row);
    if (c.soa_owner_user_id && c.soa_owner_user_id !== c.owner_user_id) add(c.soa_owner_user_id, 'responsible.controls', row);
  }
  for (const d of documents) add(d.owner_user_id, 'responsible.documents', { id: d.id, name: d.name, document_kind: d.document_kind });
  for (const f of findings) add(f.owner_user_id, 'responsible.findings', { kind: f.kind, id: f.id, name: f.name, department_id: f.department_id });

  // ── People, with their load ────────────────────────────────────────────────
  const personRows = [...people.values()].map((p) => {
    const a = p.accountable;
    const r = p.responsible;
    const load = {
      risks_at_threshold: a.risks.filter((x) => x.score >= action).length,
      risks_past_review: a.risks.filter((x) => x.past_review).length,
      items_overdue: r.items.filter((x) => x.overdue).length,
      actions_overdue: r.actions.filter((x) => x.overdue).length,
      findings: r.findings.length,
    };
    load.total = load.risks_at_threshold + load.risks_past_review + load.items_overdue + load.actions_overdue + load.findings;
    return {
      ...p,
      accountable: {
        ...a,
        // The full list of risks is long; the ones that need the owner are those
        // at or above the threshold, or past review.
        risks_count: a.risks.length,
        risks: a.risks.filter((x) => x.score >= action || x.past_review)
          .sort((x, y) => y.score - x.score)
          .map((x) => ({ ...x, department_name: deptName(x.department_id) })),
      },
      load,
    };
  }).sort((x, y) => (y.load.total - x.load.total) || x.name.localeCompare(y.name));

  // ── Departments, folded ────────────────────────────────────────────────────
  const count = (rows, deptId) => rows.filter((x) => x.department_id === deptId).length;
  const departments = depts.map((d) => {
    const dRisks = risks.filter((r) => r.department_id === d.id);
    return {
      id: d.id, name: d.name,
      owner_names: d.owner_names, is_siro_fallback: !!d.is_siro_fallback, manager_names: d.manager_names,
      risks: dRisks.length, risks_at_threshold: dRisks.filter((r) => r.score >= action).length,
      systems: count(systems, d.id), assets: count(assets, d.id), services: count(services, d.id),
      suppliers: count(suppliers, d.id), findings: count(findings, d.id),
    };
  });

  // ── The gaps ───────────────────────────────────────────────────────────────
  const gap = (key, label, rows, who) => ({ key, label, count: rows.length, who, rows: rows.slice(0, GAP_ROWS) });
  const inactive = (id) => id && userById.get(id) && !userById.get(id).is_active;
  const nameOf = (id) => userById.get(id)?.full_name || null;

  const siroFallback = departments
    .filter((d) => d.is_siro_fallback && (d.risks || d.services || d.suppliers))
    .map((d) => ({ department_id: d.id, department_name: d.name, risks: d.risks, risks_at_threshold: d.risks_at_threshold, services: d.services, suppliers: d.suppliers }));

  const missing = [];
  for (const s of systems) {
    const m = [!s.owner_user_id && 'owner', !s.managed_by_user_id && 'manager'].filter(Boolean);
    if (m.length) missing.push({ kind: 'system', id: s.id, name: s.name, missing: m, department_name: deptName(s.department_id) });
  }
  for (const a of assets) {
    const m = [!a.owner_user_id && 'owner', !a.managed_by_user_id && 'manager'].filter(Boolean);
    if (m.length) missing.push({ kind: 'asset', id: a.id, name: a.name, missing: m, department_name: deptName(a.department_id) });
  }
  for (const s of services) {
    if (!s.managed_by_user_id) missing.push({ kind: 'service', id: s.id, name: s.name, missing: ['manager'], department_name: deptName(s.department_id) });
  }

  // Named to someone whose account is no longer active: the joiners, movers
  // and leavers gap.
  const gone = [];
  const named = (kind, row, as, id) => { if (inactive(id)) gone.push({ kind, id: row.id, name: row.name || row.title, as, person_name: nameOf(id), department_name: deptName(row.department_id) }); };
  for (const s of systems) { named('system', s, 'owner', s.owner_user_id); named('system', s, 'manager', s.managed_by_user_id); }
  for (const a of assets) { named('asset', a, 'owner', a.owner_user_id); named('asset', a, 'manager', a.managed_by_user_id); }
  for (const s of services) named('service', s, 'manager', s.managed_by_user_id);
  for (const c of controls) { named('control', c, 'owner', c.owner_user_id); named('control', c, 'SoA owner', c.soa_owner_user_id); }
  for (const d of documents) named('document', d, 'owner', d.owner_user_id);
  for (const a of actions) named('action', { ...a, risk_id: a.risk_id }, 'owner', a.owner_user_id);
  for (const i of items) named('item', { id: i.action_id, title: `${i.element_name || 'Item'} — ${i.title}`, department_id: i.department_id }, 'item owner', i.owner_user_id);
  for (const d of depts) {
    for (const id of d.owner_user_ids || []) if (inactive(id)) gone.push({ kind: 'department', id: d.id, name: d.name, as: 'risk owner', person_name: nameOf(id), department_name: d.name });
  }
  const goneLinks = new Map(actions.map((a) => [a.id, a.risk_id]));
  for (const g of gone) if (g.kind === 'action' || g.kind === 'item') g.risk_id = goneLinks.get(g.id) || null;

  const unownedControls = controls
    .filter((c) => c.applicable && !c.owner_user_id && !c.soa_owner_user_id)
    .map((c) => ({ id: c.id, title: c.title, ref: c.ref }));
  const unownedDocuments = documents.filter((d) => !d.owner_user_id).map((d) => ({ id: d.id, name: d.name, document_kind: d.document_kind }));
  const unownedFindings = findings.filter((f) => !f.owner_user_id).map((f) => ({ ...f, department_name: deptName(f.department_id) }));
  const unownedItems = [
    ...actions.filter((a) => !a.owner_user_id).map((a) => ({ kind: 'action', id: a.id, name: a.title, risk_id: a.risk_id })),
    ...items.filter((i) => !i.owner_user_id).map((i) => ({ kind: 'item', id: i.action_id, name: `${i.element_name || 'Item'} — ${i.title}`, risk_id: i.risk_id })),
  ];

  return {
    generated_at: new Date().toISOString(),
    thresholds: { action },
    people: personRows,
    departments,
    gaps: [
      gap('siro_fallback', 'Departments with no Information Asset Owner, whose risks fall to the SIRO', siroFallback,
        'An administrator: give the department an Information Asset Owner'),
      gap('inactive', 'Records still named to someone whose account is no longer active', gone,
        'An administrator, with the department: name someone current'),
      gap('no_owner', 'Systems, information assets and business services with no owner or no manager', missing,
        'The department’s IAO or IAM: name them on the record'),
      gap('controls', 'Applicable control objectives with no owner', unownedControls,
        'The CISO: name an owner on the objective or in the Statement of Applicability'),
      gap('documents', 'Policies, standards and procedures with no owner', unownedDocuments,
        'Whoever looks after policies and documents: name an owner'),
      gap('findings', 'Findings waiting for an answer that nobody owns', unownedFindings,
        'The CISO or a risk analyst: answer them, or name an owner on the subject'),
      gap('unassigned_work', 'Open security actions and items with no owner', unownedItems,
        'The CISO: name an owner'),
    ],
  };
}

module.exports = { computeOwners, FINDINGS, OPEN_ACTION };
