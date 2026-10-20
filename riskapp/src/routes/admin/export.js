'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Admin data export — phase 1 of the spreadsheet-driven initialisation system.
 *
 * Each dataset is declared once in DATASETS. Individual GET /:slug routes and
 * the GET /all ZIP archive both derive from the same list, so they are always
 * in sync.
 *
 * Exports resolve FKs to business keys (email, dept name, role, entity name)
 * and never emit internal UUIDs, so files re-import into a fresh empty DB.
 *
 * Mounted under the admin router (routes/admin/index.js), which applies
 * `authenticate` + `requireCapability('admin.manage')` to every sub-route.
 */

const archiver = require('archiver');
const { Router } = require('express');
const { query }  = require('../../db/pool');

const router = Router();

// ── Delimited serialiser ──────────────────────────────────────────────────────

function escapeField(value, sep) {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toDelimited(columns, rows, sep) {
  const header = columns.map((c) => escapeField(c, sep)).join(sep);
  const lines  = rows.map((row) => columns.map((c) => escapeField(row[c], sep)).join(sep));
  return [header, ...lines].join('\r\n') + '\r\n';
}

function sendExport(req, res, name, columns, rows) {
  const tsv  = String(req.query.format || '').toLowerCase() === 'tsv';
  const sep  = tsv ? '\t' : ',';
  const ext  = tsv ? 'tsv' : 'csv';
  const mime = tsv ? 'text/tab-separated-values' : 'text/csv';
  res.setHeader('Content-Type', `${mime}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${name}.${ext}"`);
  res.send(toDelimited(columns, rows, sep));
}

// ── Dataset catalogue ─────────────────────────────────────────────────────────
// Each entry: { slug, columns, fetch() → Promise<row[]> }

const DATASETS = [
  // ── Threats & controls ──────────────────────────────────────────────────────
  {
    slug: 'threats',
    columns: ['name', 'description', 'threat_category', 'source',
              'probability_c', 'probability_i', 'probability_a', 'probability_notes',
              'default_baseline_probability', 'reference_code', 'is_active'],
    fetch: () => query(`
      SELECT name, description, threat_category, source,
             probability_c, probability_i, probability_a, probability_notes,
             default_baseline_probability, reference_code, is_active
        FROM threats ORDER BY threat_category, name`).then(r => r.rows),
  },
  {
    slug: 'controls',
    // `status` is derived (v124) and is not exported; `delivery` (v127) and
    // `reference_code` (v123) are what a re-import needs to say.
    columns: ['title', 'description', 'control_type', 'reference_code', 'delivery', 'is_baseline',
              'effectiveness', 'effectiveness_notes', 'owner_email'],
    fetch: () => query(`
      SELECT c.title, c.description, c.control_type, c.reference_code, c.delivery, c.is_baseline,
             c.effectiveness, c.effectiveness_notes, u.email AS owner_email
        FROM controls c LEFT JOIN users u ON u.id = c.owner_user_id
       ORDER BY c.title`).then(r => r.rows),
  },
  {
    slug: 'standard-controls',
    columns: ['standard', 'ref_code', 'title', 'description', 'grouping', 'implementation_group'],
    fetch: () => query(`
      SELECT s.code AS standard, sc.ref_code, sc.title, sc.description, sc.grouping, sc.implementation_group
        FROM standard_controls sc
        JOIN standards s ON s.id = sc.standard_id
       ORDER BY s.sort_index, sc.sort_index`).then(r => r.rows),
  },
  {
    slug: 'control-mappings',
    columns: ['control_title', 'standard', 'standard_ref', 'coverage'],
    fetch: () => query(`
      SELECT c.title AS control_title, s.code AS standard, sc.ref_code AS standard_ref, cm.coverage
        FROM control_mappings cm
        JOIN controls c          ON c.id  = cm.control_id
        JOIN standard_controls sc ON sc.id = cm.standard_control_id
        JOIN standards s          ON s.id  = sc.standard_id
       ORDER BY c.title, s.sort_index, sc.sort_index`).then(r => r.rows),
  },
  {
    slug: 'control-threats',
    columns: ['control_title', 'threat_name', 'notes'],
    fetch: () => query(`
      SELECT c.title AS control_title, t.name AS threat_name, ct.notes
        FROM control_threats ct
        JOIN controls c ON c.id = ct.control_id
        JOIN threats  t ON t.id = ct.threat_id
       ORDER BY c.title, t.name`).then(r => r.rows),
  },
  {
    slug: 'control-component-links',
    columns: ['control_title', 'component_name', 'component_type', 'role'],
    fetch: () => query(`
      SELECT c.title AS control_title,
             cc.name AS component_name, cc.component_type, ccl.role
        FROM control_component_links ccl
        JOIN controls           c  ON c.id  = ccl.control_id
        JOIN control_components cc ON cc.id = ccl.component_id
       ORDER BY c.title, cc.name`).then(r => r.rows),
  },

  // ── PPITF components ────────────────────────────────────────────────────────
  {
    slug: 'components',
    // Scope (v137), host identity (SOC enrichment) and the document lifecycle
    // (v139). DATE columns go out as text: node-pg turns a DATE into local
    // midnight, which an ISO timestamp then shifts to the day before in BST.
    columns: ['name', 'component_type', 'status', 'description', 'notes', 'created_by_email',
              'instantiation', 'is_host', 'hostname',
              'document_kind', 'document_version', 'document_owner_email', 'document_approved_by_email',
              'document_approved_on', 'document_next_review', 'document_url'],
    fetch: () => query(`
      SELECT cc.name, cc.component_type, cc.status, cc.description, cc.notes,
             u.email AS created_by_email,
             cc.instantiation, cc.is_host, cc.hostname,
             cc.document_kind, cc.document_version, dow.email AS document_owner_email,
             dap.email AS document_approved_by_email,
             cc.document_approved_on::text AS document_approved_on,
             cc.document_next_review::text AS document_next_review, cc.document_url
        FROM control_components cc
        LEFT JOIN users u   ON u.id   = cc.created_by
        LEFT JOIN users dow ON dow.id = cc.document_owner_id
        LEFT JOIN users dap ON dap.id = cc.document_approved_by
       ORDER BY cc.component_type, cc.name`).then(r => r.rows),
  },
  {
    slug: 'component-ip-addresses',
    columns: ['component_name', 'component_type', 'ip_address', 'label'],
    fetch: () => query(`
      SELECT cc.name AS component_name, cc.component_type, abbrev(ip.ip_address) AS ip_address, ip.label
        FROM component_ip_addresses ip
        JOIN control_components cc ON cc.id = ip.component_id
       ORDER BY cc.name, ip.ip_address`).then(r => r.rows),
  },

  // ── Information assets ──────────────────────────────────────────────────────
  {
    slug: 'information-assets',
    columns: ['name', 'description', 'department_name', 'owner_email', 'managed_by_email', 'is_shared', 'is_active'],
    fetch: () => query(`
      SELECT ia.name, ia.description,
             d.name  AS department_name,
             o.email AS owner_email,
             m.email AS managed_by_email,
             ia.is_shared, ia.is_active
        FROM information_assets ia
        LEFT JOIN departments d ON d.id = ia.department_id
        LEFT JOIN users       o ON o.id = ia.owner_user_id
        LEFT JOIN users       m ON m.id = ia.managed_by_user_id
       ORDER BY ia.name`).then(r => r.rows),
  },
  {
    slug: 'asset-impact-ratings',
    columns: ['asset_name', 'impact_table_name', 'rated_level', 'c_level', 'i_level', 'a_level'],
    fetch: () => query(`
      SELECT ia.name AS asset_name, it.name AS impact_table_name,
             air.rated_level, air.c_level, air.i_level, air.a_level
        FROM asset_impact_ratings air
        JOIN information_assets ia ON ia.id = air.asset_id
        JOIN impact_tables      it ON it.id = air.impact_table_id
       ORDER BY ia.name, it.name`).then(r => r.rows),
  },

  // ── Systems ─────────────────────────────────────────────────────────────────
  {
    slug: 'systems',
    columns: ['name', 'description', 'department_name', 'owner_email', 'manager_email', 'is_shared', 'is_active'],
    fetch: () => query(`
      SELECT s.name, s.description,
             d.name  AS department_name,
             u.email AS owner_email,
             m.email AS manager_email,
             s.is_shared, s.is_active
        FROM systems s
        LEFT JOIN departments d ON d.id = s.department_id
        LEFT JOIN users       u ON u.id = s.owner_user_id
        LEFT JOIN users       m ON m.id = s.managed_by_user_id
       ORDER BY s.name`).then(r => r.rows),
  },
  {
    slug: 'system-assets',
    columns: ['system_name', 'asset_name', 'notes'],
    fetch: () => query(`
      SELECT s.name AS system_name, ia.name AS asset_name, sa.notes
        FROM system_assets sa
        JOIN systems            s  ON s.id  = sa.system_id
        JOIN information_assets ia ON ia.id = sa.asset_id
       ORDER BY s.name, ia.name`).then(r => r.rows),
  },
  {
    slug: 'system-components',
    columns: ['system_name', 'component_name', 'component_type', 'role', 'status'],
    fetch: () => query(`
      SELECT s.name AS system_name, cc.name AS component_name,
             cc.component_type, sc.role, sc.status
        FROM system_components sc
        JOIN systems            s  ON s.id  = sc.system_id
        JOIN control_components cc ON cc.id = sc.component_id
       ORDER BY s.name, cc.component_type, cc.name`).then(r => r.rows),
  },
  {
    slug: 'system-threats',
    columns: ['system_name', 'threat_name'],
    fetch: () => query(`
      SELECT s.name AS system_name, t.name AS threat_name
        FROM system_threats st
        JOIN systems s ON s.id = st.system_id
        JOIN threats t ON t.id = st.threat_id
       ORDER BY s.name, t.name`).then(r => r.rows),
  },
  {
    slug: 'system-controls',
    // exclusion_reason (v117): a not_applicable deployment must carry its reason.
    columns: ['system_name', 'control_title', 'status', 'provenance', 'notes', 'exclusion_reason'],
    fetch: () => query(`
      SELECT s.name AS system_name, c.title AS control_title,
             sc.status, sc.provenance, sc.notes, sc.exclusion_reason
        FROM system_controls sc
        JOIN systems  s ON s.id = sc.system_id
        JOIN controls c ON c.id = sc.control_id
       ORDER BY s.name, c.title`).then(r => r.rows),
  },

  // ── Security solutions (v145 delivery patterns; shared since v147) ──────────
  {
    slug: 'delivery-patterns',
    columns: ['name', 'kind', 'notes'],
    fetch: () => query(`
      SELECT p.name, p.kind, p.notes FROM delivery_patterns p ORDER BY p.kind, lower(p.name)`).then(r => r.rows),
  },
  {
    slug: 'delivery-pattern-objectives',
    columns: ['pattern_name', 'control_title'],
    fetch: () => query(`
      SELECT p.name AS pattern_name, c.title AS control_title
        FROM delivery_pattern_objectives o
        JOIN delivery_patterns p ON p.id = o.pattern_id
        JOIN controls c ON c.id = o.control_id
       ORDER BY lower(p.name), c.title`).then(r => r.rows),
  },
  {
    slug: 'delivery-pattern-parts',
    columns: ['pattern_name', 'component_name', 'component_type', 'location', 'service_system_name'],
    fetch: () => query(`
      SELECT p.name AS pattern_name, cc.name AS component_name, cc.component_type,
             pp.location, s.name AS service_system_name
        FROM delivery_pattern_parts pp
        JOIN delivery_patterns p ON p.id = pp.pattern_id
        JOIN control_components cc ON cc.id = pp.component_id
        LEFT JOIN systems s ON s.id = pp.service_system_id
       ORDER BY lower(p.name), pp.location, cc.name`).then(r => r.rows),
  },

  // ── The security architecture (v148) ─────────────────────────────────────────
  // One row per trigger / member / component, so a list round-trips without a
  // separator inside a cell; a rule, group or build with none is one blank row.
  {
    slug: 'architecture-rules',
    columns: ['pattern_name', 'standard_name', 'notes', 'trigger_component_name', 'trigger_component_type'],
    fetch: () => query(`
      SELECT p.name AS pattern_name, d.name AS standard_name, r.notes,
             cc.name AS trigger_component_name, cc.component_type AS trigger_component_type
        FROM architecture_rules r
        JOIN delivery_patterns p ON p.id = r.pattern_id
        JOIN control_components d ON d.id = r.standard_id
        LEFT JOIN architecture_rule_triggers t ON t.rule_id = r.id
        LEFT JOIN control_components cc ON cc.id = t.component_id
       ORDER BY lower(p.name), d.name, cc.name`).then(r => r.rows),
  },
  {
    slug: 'membership-groups',
    columns: ['group_name', 'standard_name', 'notes', 'sort_index', 'role', 'component_name', 'component_type'],
    fetch: () => query(`
      SELECT g.name AS group_name, d.name AS standard_name, g.notes, g.sort_index,
             x.role, cc.name AS component_name, cc.component_type
        FROM membership_groups g
        JOIN control_components d ON d.id = g.standard_id
        LEFT JOIN (SELECT group_id, component_id, 'member' AS role FROM membership_group_members
                   UNION ALL
                   SELECT group_id, component_id, 'trigger' FROM membership_group_triggers) x ON x.group_id = g.id
        LEFT JOIN control_components cc ON cc.id = x.component_id
       ORDER BY g.sort_index, g.name, x.role, cc.name`).then(r => r.rows),
  },
  {
    slug: 'system-builds',
    columns: ['build_name', 'notes', 'component_name', 'component_type'],
    fetch: () => query(`
      SELECT b.name AS build_name, b.notes, cc.name AS component_name, cc.component_type
        FROM system_builds b
        LEFT JOIN system_build_components bc ON bc.build_id = b.id
        LEFT JOIN control_components cc ON cc.id = bc.component_id
       ORDER BY b.name, cc.name`).then(r => r.rows),
  },
  {
    slug: 'solution-choices',
    columns: ['system_name', 'control_title', 'pattern_name', 'notes', 'chosen_by_email', 'source'],
    fetch: () => query(`
      SELECT s.name AS system_name, c.title AS control_title, p.name AS pattern_name, ch.notes,
             u.email AS chosen_by_email, ch.source
        FROM system_solution_choices ch
        JOIN systems s ON s.id = ch.system_id
        JOIN controls c ON c.id = ch.control_id
        JOIN delivery_patterns p ON p.id = ch.pattern_id
        LEFT JOIN users u ON u.id = ch.chosen_by
       ORDER BY s.name, c.title`).then(r => r.rows),
  },

  // ── Statement of Applicability (v122) and scopes (v126) ─────────────────────
  {
    slug: 'soa-entries',
    columns: ['control_title', 'applicable', 'drivers', 'justification', 'implementation_status',
              'implementation_description', 'owner_email'],
    fetch: () => query(`
      SELECT c.title AS control_title, se.applicable, array_to_string(se.drivers, ';') AS drivers,
             se.justification, se.implementation_status, se.implementation_description, u.email AS owner_email
        FROM soa_entries se
        JOIN controls c ON c.id = se.control_id
        LEFT JOIN users u ON u.id = se.owner_user_id
       ORDER BY c.title`).then(r => r.rows),
  },
  {
    slug: 'scopes',
    columns: ['name', 'description'],
    fetch: () => query(`SELECT name, description FROM scopes ORDER BY name`).then(r => r.rows),
  },
  {
    slug: 'scope-systems',
    columns: ['scope_name', 'system_name'],
    fetch: () => query(`
      SELECT sc.name AS scope_name, s.name AS system_name
        FROM scope_systems ss JOIN scopes sc ON sc.id = ss.scope_id JOIN systems s ON s.id = ss.system_id
       ORDER BY sc.name, s.name`).then(r => r.rows),
  },
  {
    slug: 'soa-entry-scopes',
    columns: ['control_title', 'scope_name'],
    fetch: () => query(`
      SELECT c.title AS control_title, sc.name AS scope_name
        FROM soa_entry_scopes x JOIN controls c ON c.id = x.control_id JOIN scopes sc ON sc.id = x.scope_id
       ORDER BY c.title, sc.name`).then(r => r.rows),
  },

  // ── Suppliers (v142–v144) ───────────────────────────────────────────────────
  // A relationship has no name of its own; it is identified by its supplier, type
  // and what it touches (system and/or component), which is unique in practice.
  {
    slug: 'suppliers',
    columns: ['name', 'notes'],
    fetch: () => query(`SELECT name, notes FROM suppliers ORDER BY lower(name)`).then(r => r.rows),
  },
  {
    slug: 'supplier-relationships',
    columns: ['supplier_name', 'relationship_type', 'department_name', 'system_name', 'component_name',
              'component_type', 'description', 'contract_ref', 'contract_url', 'contract_start', 'contract_end', 'status'],
    fetch: () => query(`
      SELECT sp.name AS supplier_name, sr.relationship_type, d.name AS department_name,
             s.name AS system_name, cc.name AS component_name, cc.component_type,
             sr.description, sr.contract_ref, sr.contract_url,
             sr.contract_start::text AS contract_start, sr.contract_end::text AS contract_end, sr.status
        FROM supplier_relationships sr
        JOIN suppliers sp ON sp.id = sr.supplier_id
        JOIN departments d ON d.id = sr.department_id
        LEFT JOIN systems s ON s.id = sr.system_id
        LEFT JOIN control_components cc ON cc.id = sr.component_id
       ORDER BY lower(sp.name), sr.relationship_type`).then(r => r.rows),
  },
  {
    slug: 'supplier-type-objectives',
    columns: ['applies_to', 'control_title'],
    fetch: () => query(`
      SELECT sto.applies_to, c.title AS control_title
        FROM supplier_type_objectives sto JOIN controls c ON c.id = sto.control_id
       ORDER BY sto.applies_to, c.title`).then(r => r.rows),
  },
  {
    // control_titles: the objectives the evidence covers, separated by ' | '
    // (objective titles contain commas and semicolons, never a bar).
    slug: 'supplier-evidence',
    columns: ['supplier_name', 'relationship_type', 'system_name', 'component_name', 'component_type',
              'kind', 'title', 'reference', 'url', 'issued_on', 'expires_on', 'control_titles'],
    fetch: () => query(`
      SELECT sp.name AS supplier_name, sr.relationship_type, s.name AS system_name,
             cc.name AS component_name, cc.component_type,
             e.kind, e.title, e.reference, e.url,
             e.issued_on::text AS issued_on, e.expires_on::text AS expires_on,
             (SELECT string_agg(c.title, ' | ' ORDER BY c.title)
                FROM supplier_evidence_objectives eo JOIN controls c ON c.id = eo.control_id
               WHERE eo.evidence_id = e.id) AS control_titles
        FROM supplier_evidence e
        JOIN supplier_relationships sr ON sr.id = e.relationship_id
        JOIN suppliers sp ON sp.id = sr.supplier_id
        LEFT JOIN systems s ON s.id = sr.system_id
        LEFT JOIN control_components cc ON cc.id = sr.component_id
       ORDER BY lower(sp.name), e.title`).then(r => r.rows),
  },

  // ── Business services ────────────────────────────────────────────────────────
  {
    slug: 'business-services',
    columns: ['name', 'description', 'department_name', 'owner_department_name', 'manager_email', 'is_shared', 'is_active'],
    fetch: () => query(`
      SELECT bs.name, bs.description,
             d.name  AS department_name,
             od.name AS owner_department_name,
             m.email AS manager_email,
             bs.is_shared, bs.is_active
        FROM business_services bs
        LEFT JOIN departments d  ON d.id  = bs.department_id
        LEFT JOIN departments od ON od.id = bs.owner_department_id
        LEFT JOIN users       m  ON m.id  = bs.managed_by_user_id
       ORDER BY bs.name`).then(r => r.rows),
  },
  {
    slug: 'business-service-systems',
      columns: ['service_name', 'system_name'],
      fetch: () => query(`
        SELECT bs.name AS service_name, s.name AS system_name
          FROM business_service_systems bss
          JOIN business_services bs ON bs.id = bss.service_id
          JOIN systems           s  ON s.id  = bss.system_id
         ORDER BY bs.name, s.name`).then(r => r.rows),
  },

  // ── Impact tables ─────────────────────────────────────────────────────────────
  {
    slug: 'impact-tables',
    columns: ['name', 'description', 'scope', 'department_name', 'mandatory', 'published'],
    fetch: () => query(`
      SELECT it.name, it.description, it.scope,
             d.name AS department_name,
             it.mandatory,
             (it.published_at IS NOT NULL) AS published
        FROM impact_tables it
        LEFT JOIN departments d ON d.id = it.department_id
       ORDER BY it.scope, it.name`).then(r => r.rows),
  },
  {
    slug: 'impact-table-bil-levels',
    columns: ['table_name', 'level', 'statement'],
    fetch: () => query(`
      SELECT it.name AS table_name, bl.level, bl.statement
        FROM impact_table_bil_levels bl
        JOIN impact_tables it ON it.id = bl.impact_table_id
       ORDER BY it.name, bl.level`).then(r => r.rows),
  },
  {
    slug: 'impact-table-cia-levels',
    columns: ['table_name', 'level', 'dimension', 'statement'],
    fetch: () => query(`
      SELECT it.name AS table_name, cl.level, cl.dimension, cl.statement
        FROM impact_table_cia_levels cl
        JOIN impact_tables it ON it.id = cl.impact_table_id
       ORDER BY it.name, cl.level, cl.dimension`).then(r => r.rows),
  },

  // ── Account management ────────────────────────────────────────────────────────
  {
    slug: 'users',
    columns: ['email', 'full_name', 'primary_role', 'department_name', 'is_active', 'totp_enabled', 'last_login_at'],
    fetch: () => query(`
      SELECT u.email, u.full_name, u.role AS primary_role,
             d.name AS department_name, u.is_active, u.totp_enabled, u.last_login_at
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
       ORDER BY u.is_active DESC, u.full_name`).then(r => r.rows),
  },
  {
    slug: 'user-roles',
    columns: ['user_email', 'role'],
    fetch: () => query(`
      SELECT u.email AS user_email, ur.role
        FROM user_roles ur
        JOIN users u ON u.id = ur.user_id
       ORDER BY u.email, ur.role`).then(r => r.rows),
  },
  {
    slug: 'departments',
    columns: ['name', 'description', 'owner_email'],
    fetch: () => query(`
      SELECT d.name, d.description, o.email AS owner_email
        FROM departments d
        LEFT JOIN users o ON o.id = d.owner_user_id
       ORDER BY d.name`).then(r => r.rows),
  },

  // ── Access control ────────────────────────────────────────────────────────────
  {
    slug: 'role-permissions',
    columns: ['role', 'capability_key', 'scope'],
    fetch: () => query(`
      SELECT role, capability_key, scope FROM role_permissions
       ORDER BY role, capability_key`).then(r => r.rows),
  },
  {
    slug: 'sod-rules',
    columns: ['key', 'enabled'],
    fetch: () => query('SELECT key, enabled FROM sod_rules ORDER BY key').then(r => r.rows),
  },
  {
    slug: 'access-settings',
    columns: ['setting', 'value'],
    fetch: async () => {
      const { rows } = await query('SELECT department_isolation FROM org_config LIMIT 1');
      return [{ setting: 'department_isolation', value: rows[0]?.department_isolation ?? false }];
    },
  },
  {
    slug: 'capabilities',
    columns: ['key', 'resource', 'action', 'dept_scopable', 'description'],
    fetch: () => query(`
      SELECT key, resource, action, dept_scopable, description
        FROM capabilities ORDER BY resource, action, key`).then(r => r.rows),
  },
];

// ── Individual routes (one per dataset) ───────────────────────────────────────

for (const ds of DATASETS) {
  router.get(`/${ds.slug}`, async (req, res, next) => {
    try {
      const rows = await ds.fetch();
      sendExport(req, res, ds.slug, ds.columns, rows);
    } catch (err) { next(err); }
  });
}

// ── Download all (ZIP archive) ────────────────────────────────────────────────

router.get('/all', async (req, res, next) => {
  const tsv  = String(req.query.format || '').toLowerCase() === 'tsv';
  const sep  = tsv ? '\t' : ',';
  const ext  = tsv ? 'tsv' : 'csv';
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="riskapp-export-${date}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => next(err));
  archive.pipe(res);

  try {
    // Fetch and append each dataset in catalogue order
    for (const ds of DATASETS) {
      const rows    = await ds.fetch();
      const content = toDelimited(ds.columns, rows, sep);
      archive.append(content, { name: `${ds.slug}.${ext}` });
    }
    await archive.finalize();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
