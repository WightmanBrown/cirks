#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS spreadsheet import — the read-side counterpart to the admin exporter
// (routes/admin/export.js). Loads a directory of CSV/TSV files (one per dataset,
// named <slug>.csv) into a fresh, migrated + seeded database, resolving the
// exporter's business keys (dept name, email, entity name, standard ref) back to
// FKs. Idempotent: a row whose business key already exists is skipped.
//
//   node db/import.js <dir> [--format csv|tsv] [--actor <email>] [--password <pw>] [--dry-run]
//   node db/import.js --template <dir>      # write header-only template files
//
// Scope = org CONTENT in dependency order, INCLUDING users + user_roles (needed
// for a self-contained demo/training dataset). Users are bcrypt-hashed with a
// shared starting password (blank `password` cell → --password / DEMO_PASSWORD
// env); a per-row `password` overrides it. There is NO built-in fallback: until
// 2026-10-15 a blank cell silently became 'Riskapp123' — the demo password
// published in this repository — which on a real installation would have opened
// every such account with a known password. Now the row is refused instead. RBAC (capabilities /
// role_permissions) + the NIST catalogue stay seeded by db/seed.js — they are
// canonical reference data, deliberately NOT spreadsheet-driven. Owner/manager
// emails resolve to a user when present, else NULL.
//
// The departments↔users FK cycle (a department names an owner_email; every user
// names a department) is resolved by loading departments first (owner left NULL),
// then users, then back-filling department owners in the users `after` hook.
//
// All rows run inside ONE transaction with a per-row SAVEPOINT, so a bad row is
// tallied as an error and skipped without poisoning the rest. --dry-run rolls
// the whole transaction back at the end. Connection resolves like src/db/pool.js.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('../src/db/pool');
const { parse } = require('./csv');

const BCRYPT_COST = 12; // matches db/create-admin.js + the app's user-create path

// ── value coercions ─────────────────────────────────────────────────────────────
const txt = (v) => { const s = (v ?? '').trim(); return s === '' ? null : s; };
const req = (v, f) => { const s = (v ?? '').trim(); if (s === '') throw new Error(`missing required "${f}"`); return s; };
const intOpt = (v) => { const s = (v ?? '').trim(); if (s === '') return null; const n = Number(s); if (!Number.isFinite(n)) throw new Error(`"${v}" is not a number`); return Math.trunc(n); };
const TRUE = new Set(['true', 't', '1', 'yes', 'y']);
const FALSE = new Set(['false', 'f', '0', 'no', 'n']);
const boolOpt = (v) => { const s = (v ?? '').trim().toLowerCase(); if (s === '') return undefined; if (TRUE.has(s)) return true; if (FALSE.has(s)) return false; throw new Error(`"${v}" is not a boolean`); };
const defOpt = (v) => { const s = (v ?? '').trim(); return s === '' ? undefined : s; }; // blank → use DB default

// ── generic insert: omits keys whose value is `undefined` (DB default applies) ──
async function insertRow(ctx, table, map, conflictCols) {
  const cols = Object.keys(map).filter((k) => map[k] !== undefined);
  const vals = cols.map((k) => map[k]);
  const ph = cols.map((_, i) => `$${i + 1}`);
  let sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph.join(', ')})`;
  if (conflictCols) sql += ` ON CONFLICT (${conflictCols.join(', ')}) DO NOTHING`;
  const r = await ctx.q(sql, vals);
  return r.rowCount; // 1 = imported, 0 = skipped (conflict)
}

// ── cached business-key resolvers (read-through; positive results only) ─────────
function makeContext(client, actorEmail, demoPassword) {
  const cache = new Map();
  let actorId; // resolved lazily

  const q = (sql, params) => client.query(sql, params);

  async function one(key, sql, params, label, optional) {
    const ck = key + '\0' + params.join('\0');
    if (cache.has(ck)) return cache.get(ck);
    const { rows } = await q(sql, params);
    if (rows.length === 0) {
      if (optional) return null;
      throw new Error(`${label} not found`);
    }
    if (rows.length > 1) throw new Error(`${label} is ambiguous (${rows.length} matches)`);
    cache.set(ck, rows[0].id);
    return rows[0].id;
  }

  return {
    q,
    // Shared demo password + department-owner back-fill queue (see the users dataset).
    demoPassword,
    deptOwnerBackfill: [],
    deptId: (name) => one('dept', 'SELECT id FROM departments WHERE name = $1', [req(name, 'department_name')], `department "${name}"`),
    deptIdOpt: (name) => (txt(name) ? one('dept', 'SELECT id FROM departments WHERE name = $1', [name.trim()], `department "${name}"`) : Promise.resolve(null)),
    userId: (email) => (txt(email) ? one('user', 'SELECT id FROM users WHERE lower(email) = lower($1)', [email.trim()], `user "${email}"`, true) : Promise.resolve(null)),
    userIdReq: (email) => one('user', 'SELECT id FROM users WHERE lower(email) = lower($1)', [req(email, 'email').trim()], `user "${email}"`),
    impactTableId: (name) => one('it', 'SELECT id FROM impact_tables WHERE name = $1', [req(name, 'table_name')], `impact table "${name}"`),
    assetId: (name) => one('asset', 'SELECT id FROM information_assets WHERE name = $1', [req(name, 'asset_name')], `asset "${name}"`),
    systemId: (name) => one('sys', 'SELECT id FROM systems WHERE name = $1', [req(name, 'system_name')], `system "${name}"`),
    serviceId: (name) => one('svc', 'SELECT id FROM business_services WHERE name = $1', [req(name, 'service_name')], `service "${name}"`),
    controlId: (title) => one('ctl', 'SELECT id FROM controls WHERE title = $1', [req(title, 'control_title')], `control "${title}"`),
    threatId: (name) => one('thr', 'SELECT id FROM threats WHERE name = $1', [req(name, 'threat_name')], `threat "${name}"`),
    componentId: (name, type) => one('cmp', 'SELECT id FROM control_components WHERE name = $1 AND component_type = $2', [req(name, 'component_name'), req(type, 'component_type')], `component "${name}" (${type})`),
    patternId: (name, { optional = false } = {}) => one('pat', 'SELECT id FROM delivery_patterns WHERE lower(btrim(name)) = lower(btrim($1))', [req(name, 'pattern_name')], `security solution "${name}"`, optional),
    scopeId: (name) => one('scope', 'SELECT id FROM scopes WHERE name = $1', [req(name, 'scope_name')], `scope "${name}"`),
    supplierId: (name) => one('sup', 'SELECT id FROM suppliers WHERE lower(btrim(name)) = lower(btrim($1))', [req(name, 'supplier_name')], `supplier "${name}"`),
    // A relationship is identified by supplier + type + what it touches.
    async relationshipId(r) {
      const sup = await this.supplierId(r.supplier_name);
      const sys = txt(r.system_name) ? await this.systemId(r.system_name) : null;
      const cmp = txt(r.component_name) ? await this.componentId(r.component_name, r.component_type) : null;
      return one('rel', `SELECT id FROM supplier_relationships WHERE supplier_id = $1 AND relationship_type = $2
                          AND system_id IS NOT DISTINCT FROM $3::uuid AND component_id IS NOT DISTINCT FROM $4::uuid`,
        [sup, req(r.relationship_type, 'relationship_type'), sys, cmp], `relationship ${r.supplier_name}/${r.relationship_type}`);
    },
    standardControlId: (code, ref) => one('sc', 'SELECT sc.id FROM standard_controls sc JOIN standards s ON s.id = sc.standard_id WHERE s.code = $1 AND sc.ref_code = $2', [req(code, 'standard'), req(ref, 'standard_ref')], `standard control ${code}/${ref}`),
    async actor() {
      if (actorId !== undefined) return actorId;
      if (actorEmail) {
        const { rows } = await q('SELECT id FROM users WHERE lower(email) = lower($1)', [actorEmail]);
        if (!rows.length) throw new Error(`--actor user "${actorEmail}" not found`);
        actorId = rows[0].id;
      } else {
        const { rows } = await q("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
        if (!rows.length) throw new Error('no actor available — pass --actor <email> or create an admin (db/create-admin.js)');
        actorId = rows[0].id;
      }
      // The audit triggers (v106, v131, v139…) attribute changes through this
      // transaction-local setting, as db/pool.js withActor() does for the app.
      await q('SELECT set_config($1, $2, true)', ['cirks.actor_id', actorId]);
      return actorId;
    },
  };
}

// ── dataset catalogue (LOAD ORDER) ──────────────────────────────────────────────
// Each: { slug, columns (for templates), handle(rec, ctx) → 'imported'|'skipped',
//         after?(ctx) — runs once after all rows }
const DATASETS = [
  { slug: 'departments', columns: ['name', 'description', 'owner_email'],
    handle: async (r, c) => {
      // owner_email may not resolve yet (users load next); queue it for back-fill.
      if (txt(r.owner_email)) c.deptOwnerBackfill.push({ name: req(r.name, 'name'), email: r.owner_email.trim() });
      const ownerId = await c.userId(r.owner_email);
      const added = await insertRow(c, 'departments',
        { name: req(r.name, 'name'), description: txt(r.description), owner_user_id: ownerId },
        ['name']);
      // Loaded one file at a time, departments go in before the users exist and
      // the back-fill in the users hook never sees this file. Loading the
      // departments file again once the users are in fills the owner — only
      // where none is set, so it never overrides one chosen in the application.
      if (!added && ownerId) {
        await c.q('UPDATE departments SET owner_user_id = $1 WHERE name = $2 AND owner_user_id IS NULL', [ownerId, req(r.name, 'name')]);
      }
      return added ? 'imported' : 'skipped';
    } },

  { slug: 'users', columns: ['email', 'full_name', 'role', 'department_name', 'is_active', 'view_mode', 'password'],
    handle: async (r, c) => {
      const email = req(r.email, 'email');
      if ((await c.q('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).rowCount) return 'skipped';
      const pw = txt(r.password) || c.demoPassword;
      if (!pw) throw new Error('no password: load with --password <starting password> (or give this row a password)');
      const hash = await bcrypt.hash(pw, BCRYPT_COST);
      await insertRow(c, 'users', {
        email,
        full_name: req(r.full_name, 'full_name'),
        role: defOpt(r.role ?? r.primary_role),     // blank → DB default (information_asset_owner); `primary_role` = exporter's column name

        department_id: await c.deptIdOpt(r.department_name),
        is_active: boolOpt(r.is_active),
        view_mode: defOpt(r.view_mode),
        password_hash: hash,
      });
      return 'imported';
    },
    // Now that users exist, back-fill department owners left NULL by the cycle.
    after: async (c) => {
      for (const { name, email } of c.deptOwnerBackfill) {
        const uid = await c.userId(email);
        if (uid) await c.q('UPDATE departments SET owner_user_id = $1 WHERE name = $2 AND owner_user_id IS NULL', [uid, name]);
      }
    } },

  { slug: 'user_roles', altSlugs: ['user-roles'],   // exporter names the file `user-roles.csv`
    columns: ['email', 'role'],
    handle: async (r, c) => (await insertRow(c, 'user_roles',
      { user_id: await c.userIdReq(r.email ?? r.user_email), role: req(r.role, 'role'), granted_by: await c.actor() },
      ['user_id', 'role']) ? 'imported' : 'skipped') },

  { slug: 'impact-tables', columns: ['name', 'description', 'scope', 'department_name', 'mandatory', 'published'],
    handle: async (r, c) => {
      const name = req(r.name, 'name'); const scope = req(r.scope, 'scope');
      // scope says how far the table reaches; the department says who is
      // accountable for it — required for an organisation-wide table too. Said
      // here in words, not left to the NOT NULL constraint's message.
      if (!txt(r.department_name)) throw new Error('missing required "department_name" — every impact table needs an owning department, an organisation-wide one included');
      const deptId = await c.deptId(r.department_name);
      const ex = await c.q('SELECT id FROM impact_tables WHERE name = $1 AND scope = $2 AND department_id IS NOT DISTINCT FROM $3', [name, scope, deptId]);
      if (ex.rowCount) return 'skipped';
      await insertRow(c, 'impact_tables', {
        name, description: txt(r.description), scope, department_id: deptId,
        mandatory: boolOpt(r.mandatory),
        published_at: boolOpt(r.published) ? new Date() : undefined,
      });
      return 'imported';
    } },

  { slug: 'impact-table-bil-levels', columns: ['table_name', 'level', 'statement'],
    handle: async (r, c) => (await insertRow(c, 'impact_table_bil_levels',
      { impact_table_id: await c.impactTableId(r.table_name), level: intOpt(req(r.level, 'level')), statement: txt(r.statement) },
      ['impact_table_id', 'level']) ? 'imported' : 'skipped') },

  { slug: 'impact-table-cia-levels', columns: ['table_name', 'level', 'dimension', 'statement'],
    handle: async (r, c) => (await insertRow(c, 'impact_table_cia_levels',
      { impact_table_id: await c.impactTableId(r.table_name), level: intOpt(req(r.level, 'level')), dimension: req(r.dimension, 'dimension'), statement: txt(r.statement) },
      ['impact_table_id', 'level', 'dimension']) ? 'imported' : 'skipped') },

  { slug: 'threats', columns: ['name', 'description', 'threat_category', 'source', 'probability_c', 'probability_i', 'probability_a', 'probability_notes', 'default_baseline_probability', 'reference_code', 'is_active'],
    handle: async (r, c) => {
      const name = req(r.name, 'name');
      if ((await c.q('SELECT 1 FROM threats WHERE name = $1', [name])).rowCount) return 'skipped';
      await insertRow(c, 'threats', {
        name, description: txt(r.description), threat_category: req(r.threat_category, 'threat_category'),
        source: defOpt(r.source), probability_c: defOpt(r.probability_c), probability_i: defOpt(r.probability_i),
        probability_a: defOpt(r.probability_a), probability_notes: txt(r.probability_notes),
        default_baseline_probability: intOpt(r.default_baseline_probability), reference_code: txt(r.reference_code),
        is_active: boolOpt(r.is_active),
      });
      return 'imported';
    } },

  // A fresh install already holds the seeded NIST catalogue, so an objective that
  // exists is UPDATED with what the organisation said about it (delivery, rating,
  // owner, reference) rather than skipped. `status` is derived (v124) and ignored.
  { slug: 'controls', columns: ['title', 'description', 'control_type', 'reference_code', 'delivery', 'is_baseline', 'effectiveness', 'effectiveness_notes', 'owner_email'],
    handle: async (r, c) => {
      const title = req(r.title, 'title');
      const fields = {
        reference_code: txt(r.reference_code), delivery: txt(r.delivery),
        is_baseline: boolOpt(r.is_baseline), effectiveness: intOpt(r.effectiveness),
        effectiveness_notes: txt(r.effectiveness_notes), owner_user_id: await c.userId(r.owner_email),
      };
      const { rows } = await c.q('SELECT id FROM controls WHERE title = $1', [title]);
      if (rows.length) {
        const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
        await c.q(`UPDATE controls SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
          [rows[0].id, ...keys.map((k) => fields[k])]);
        return 'skipped';
      }
      await insertRow(c, 'controls', { title, description: txt(r.description), control_type: defOpt(r.control_type), ...fields });
      return 'imported';
    } },

  { slug: 'control-threats', columns: ['control_title', 'threat_name', 'notes'],
    handle: async (r, c) => (await insertRow(c, 'control_threats',
      { control_id: await c.controlId(r.control_title), threat_id: await c.threatId(r.threat_name), notes: txt(r.notes), created_by: await c.actor() },
      ['control_id', 'threat_id']) ? 'imported' : 'skipped') },

  { slug: 'control-mappings', columns: ['control_title', 'standard', 'standard_ref', 'coverage'],
    handle: async (r, c) => (await insertRow(c, 'control_mappings',
      { control_id: await c.controlId(r.control_title), standard_control_id: await c.standardControlId(r.standard, r.standard_ref), coverage: defOpt(r.coverage) },
      ['control_id', 'standard_control_id']) ? 'imported' : 'skipped') },

  { slug: 'components', columns: ['name', 'component_type', 'status', 'description', 'notes', 'created_by_email',
                                   'instantiation', 'is_host', 'hostname', 'document_kind', 'document_version',
                                   'document_owner_email', 'document_approved_by_email', 'document_approved_on',
                                   'document_next_review', 'document_url'],
    handle: async (r, c) => {
      const name = req(r.name, 'name'); const type = req(r.component_type, 'component_type');
      if ((await c.q('SELECT 1 FROM control_components WHERE name = $1 AND component_type = $2', [name, type])).rowCount) return 'skipped';
      await insertRow(c, 'control_components', {
        name, component_type: type, status: defOpt(r.status), description: txt(r.description), notes: txt(r.notes),
        created_by: (await c.userId(r.created_by_email)) || (await c.actor()),
        instantiation: txt(r.instantiation), is_host: boolOpt(r.is_host), hostname: txt(r.hostname),
        document_kind: txt(r.document_kind), document_version: txt(r.document_version),
        document_owner_id: await c.userId(r.document_owner_email), document_approved_by: await c.userId(r.document_approved_by_email),
        document_approved_on: txt(r.document_approved_on), document_next_review: txt(r.document_next_review),
        document_url: txt(r.document_url),
      });
      return 'imported';
    } },

  { slug: 'component-ip-addresses', columns: ['component_name', 'component_type', 'ip_address', 'label'],
    handle: async (r, c) => {
      const cmp = await c.componentId(r.component_name, r.component_type);
      const ip = req(r.ip_address, 'ip_address');
      if ((await c.q('SELECT 1 FROM component_ip_addresses WHERE component_id = $1 AND ip_address = $2::inet', [cmp, ip])).rowCount) return 'skipped';
      await insertRow(c, 'component_ip_addresses', { component_id: cmp, ip_address: ip, label: txt(r.label), created_by: await c.actor() });
      return 'imported';
    } },


  { slug: 'control-component-links', columns: ['control_title', 'component_name', 'component_type', 'role'],
    handle: async (r, c) => (await insertRow(c, 'control_component_links',
      { control_id: await c.controlId(r.control_title), component_id: await c.componentId(r.component_name, r.component_type), role: txt(r.role), created_by: await c.actor() },
      ['control_id', 'component_id']) ? 'imported' : 'skipped') },

  { slug: 'information-assets', columns: ['name', 'description', 'department_name', 'owner_email', 'managed_by_email', 'is_shared', 'is_active'],
    handle: async (r, c) => (await insertRow(c, 'information_assets',
      { name: req(r.name, 'name'), description: txt(r.description), department_id: await c.deptId(r.department_name),
        owner_user_id: await c.userId(r.owner_email), managed_by_user_id: await c.userId(r.managed_by_email),
        is_shared: boolOpt(r.is_shared), is_active: boolOpt(r.is_active) },
      ['department_id', 'name']) ? 'imported' : 'skipped') },

  { slug: 'asset-impact-ratings', columns: ['asset_name', 'impact_table_name', 'rated_level', 'c_level', 'i_level', 'a_level'],
    handle: async (r, c) => (await insertRow(c, 'asset_impact_ratings',
      { asset_id: await c.assetId(r.asset_name), impact_table_id: await c.impactTableId(r.impact_table_name),
        rated_level: intOpt(r.rated_level), c_level: intOpt(r.c_level), i_level: intOpt(r.i_level), a_level: intOpt(r.a_level) },
      ['asset_id', 'impact_table_id']) ? 'imported' : 'skipped'),
    // Asset CIA is app-derived (no DB trigger), so recompute once all ratings are
    // loaded — this fires the information_assets triggers that later cascade into
    // system/service impact when those links import. This MUST mirror the live
    // recomputeAssetCia (routes/assets/index.js): a rating carries a single
    // `rated_level` per impact table and each dimension is derived from that level
    // via the table's impact_table_cia_levels statements (a dimension the table
    // doesn't assess stays NULL → floors to 1). The per-dimension c/i/a_level
    // columns are an optional override taking precedence when set. The earlier
    // MAX(c_level) form ignored the rated_level path, so any asset rated only by
    // rated_level floored to 1/1/1. (cia-levels load before this hook.)
    after: async (c) => {
      await c.q(`UPDATE information_assets ia SET
        confidentiality = COALESCE(d.c_max, 1),
        integrity       = COALESCE(d.i_max, 1),
        availability    = COALESCE(d.a_max, 1)
      FROM (
        SELECT air.asset_id,
          MAX(CASE WHEN air.c_dropped THEN NULL
                   WHEN air.c_level IS NOT NULL THEN air.c_level
                   WHEN cl_c.statement IS NOT NULL AND cl_c.statement <> '' THEN air.rated_level END) AS c_max,
          MAX(CASE WHEN air.i_dropped THEN NULL
                   WHEN air.i_level IS NOT NULL THEN air.i_level
                   WHEN cl_i.statement IS NOT NULL AND cl_i.statement <> '' THEN air.rated_level END) AS i_max,
          MAX(CASE WHEN air.a_dropped THEN NULL
                   WHEN air.a_level IS NOT NULL THEN air.a_level
                   WHEN cl_a.statement IS NOT NULL AND cl_a.statement <> '' THEN air.rated_level END) AS a_max
        FROM asset_impact_ratings air
        LEFT JOIN impact_table_cia_levels cl_c
          ON cl_c.impact_table_id = air.impact_table_id AND cl_c.level = air.rated_level AND cl_c.dimension = 'c'
        LEFT JOIN impact_table_cia_levels cl_i
          ON cl_i.impact_table_id = air.impact_table_id AND cl_i.level = air.rated_level AND cl_i.dimension = 'i'
        LEFT JOIN impact_table_cia_levels cl_a
          ON cl_a.impact_table_id = air.impact_table_id AND cl_a.level = air.rated_level AND cl_a.dimension = 'a'
        GROUP BY air.asset_id
      ) d
      WHERE ia.id = d.asset_id`);
    } },

  { slug: 'systems', columns: ['name', 'description', 'department_name', 'owner_email', 'manager_email', 'is_shared', 'is_active'],
    handle: async (r, c) => (await insertRow(c, 'systems',
      { name: req(r.name, 'name'), description: txt(r.description), department_id: await c.deptId(r.department_name),
        owner_user_id: await c.userId(r.owner_email), managed_by_user_id: await c.userId(r.manager_email),
        is_shared: boolOpt(r.is_shared), is_active: boolOpt(r.is_active) },
      ['department_id', 'name']) ? 'imported' : 'skipped') },

  { slug: 'system-assets', columns: ['system_name', 'asset_name', 'notes'],
    handle: async (r, c) => (await insertRow(c, 'system_assets',
      { system_id: await c.systemId(r.system_name), asset_id: await c.assetId(r.asset_name), notes: txt(r.notes) },
      ['system_id', 'asset_id']) ? 'imported' : 'skipped') },

  { slug: 'system-components', columns: ['system_name', 'component_name', 'component_type', 'role', 'status'],
    handle: async (r, c) => (await insertRow(c, 'system_components',
      { system_id: await c.systemId(r.system_name), component_id: await c.componentId(r.component_name, r.component_type),
        role: txt(r.role), status: defOpt(r.status) },
      ['system_id', 'component_id']) ? 'imported' : 'skipped') },

  // The system's threat exposure — one half of the risk surface (a risk is
  // system × threat). Without this a freshly imported org has an architecture
  // but nothing to raise risks against.
  { slug: 'system-threats', columns: ['system_name', 'threat_name'],
    handle: async (r, c) => (await insertRow(c, 'system_threats',
      { system_id: await c.systemId(r.system_name), threat_id: await c.threatId(r.threat_name), added_by: await c.actor() },
      ['system_id', 'threat_id']) ? 'imported' : 'skipped') },

  // Control deployment per system. `status` (v89) is the gap signal: anything
  // other than 'operational' is what the gap-driven action builder offers as a
  // remediation candidate, so a blank status (→ 'unknown') is NOT a neutral
  // default — it reads as an untreated gap. Set it deliberately.
  // exclusion_reason (v117) travels with a not_applicable status — the database
  // refuses one without the other.
  { slug: 'system-controls', columns: ['system_name', 'control_title', 'status', 'provenance', 'notes', 'exclusion_reason'],
    handle: async (r, c) => {
      const reason = txt(r.exclusion_reason);
      return (await insertRow(c, 'system_controls',
        { system_id: await c.systemId(r.system_name), control_id: await c.controlId(r.control_title),
          status: defOpt(r.status), provenance: defOpt(r.provenance), notes: txt(r.notes), created_by: await c.actor(),
          exclusion_reason: reason, excluded_by: reason ? await c.actor() : undefined,
          excluded_at: reason ? new Date() : undefined },
        ['system_id', 'control_id'])) ? 'imported' : 'skipped';
    } },

  // `department_id` and `owner_department_id` are ALWAYS the same value: every
  // write path in the app sets both from one input (create passes $3 twice,
  // update and transfer both COALESCE the same parameter). The two columns are
  // read differently though — owner_department_id governs authority (who may
  // transfer, seat-scoped writes, adoption), department_id drives presentation
  // (the department label, the derived IAO/IAM columns) — so a row where they
  // disagree would have its permissions in one department and its ownership
  // display in another. That is a state the application cannot produce and has
  // no defined behaviour for.
  //
  // So `owner_department_name` is not an input: both columns are set from
  // `department_name`. A file that still carries the column (an export, say) is
  // accepted while it agrees, and rejected loudly if it does not — silently
  // ignoring a value someone deliberately typed is its own trap.
  { slug: 'business-services', columns: ['name', 'description', 'department_name', 'manager_email', 'is_shared', 'is_active'],
    handle: async (r, c) => {
      const deptName = req(r.department_name, 'department_name');
      const ownerName = txt(r.owner_department_name);
      if (ownerName && ownerName !== deptName) {
        throw new Error(
          `owner_department_name ("${ownerName}") must match department_name ("${deptName}") — a service is owned by the department it belongs to. Remove the column or make them agree.`);
      }
      const deptId = await c.deptId(deptName);
      return (await insertRow(c, 'business_services',
        { name: req(r.name, 'name'), description: txt(r.description),
          department_id: deptId, owner_department_id: deptId,
          managed_by_user_id: await c.userId(r.manager_email),
          is_shared: boolOpt(r.is_shared), is_active: boolOpt(r.is_active) },
        ['department_id', 'name'])) ? 'imported' : 'skipped';
    } },

  { slug: 'business-service-systems', columns: ['service_name', 'system_name'],
      handle: async (r, c) => (await insertRow(c, 'business_service_systems',
        { service_id: await c.serviceId(r.service_name), system_id: await c.systemId(r.system_name) },
        ['service_id', 'system_id']) ? 'imported' : 'skipped') },

  // ── Security solutions (v145 delivery patterns; shared since v147) ─────────
  // Also reads exports made before v147, when each pattern row and part row
  // carried its control_title: the same name becomes one solution, and the
  // row's objective is linked to it.
  { slug: 'delivery-patterns', columns: ['name', 'kind', 'notes'],
    handle: async (r, c) => {
      const name = req(r.name, 'name');
      let id = await c.patternId(name, { optional: true });
      let made = false;
      if (!id) {
        await insertRow(c, 'delivery_patterns', { name, kind: defOpt(r.kind), notes: txt(r.notes), created_by: await c.actor() });
        id = await c.patternId(name);
        made = true;
      }
      if (txt(r.control_title)) {
        const res = await c.q('INSERT INTO delivery_pattern_objectives (pattern_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, await c.controlId(r.control_title)]);
        made = made || res.rowCount > 0;
      }
      return made ? 'imported' : 'skipped';
    } },

  { slug: 'delivery-pattern-objectives', columns: ['pattern_name', 'control_title'],
    handle: async (r, c) => {
      const res = await c.q('INSERT INTO delivery_pattern_objectives (pattern_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [await c.patternId(req(r.pattern_name, 'pattern_name')), await c.controlId(r.control_title)]);
      return res.rowCount ? 'imported' : 'skipped';
    } },

  { slug: 'delivery-pattern-parts', columns: ['pattern_name', 'component_name', 'component_type', 'location', 'service_system_name'],
    handle: async (r, c) => {
      const location = req(r.location, 'location');
      const service = txt(r.service_system_name) ? await c.systemId(r.service_system_name) : null;
      const res = await c.q(
        `INSERT INTO delivery_pattern_parts (pattern_id, component_id, location, service_system_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [await c.patternId(req(r.pattern_name, 'pattern_name')), await c.componentId(r.component_name, r.component_type), location, service]);
      return res.rowCount ? 'imported' : 'skipped';
    } },

  // ── The security architecture (v148) — one row per trigger / member / part ──
  { slug: 'architecture-rules', columns: ['pattern_name', 'standard_name', 'notes', 'trigger_component_name', 'trigger_component_type'],
    handle: async (r, c) => {
      const patternId = await c.patternId(req(r.pattern_name, 'pattern_name'));
      const standardId = await c.componentId(r.standard_name, 'information');
      let made = await insertRow(c, 'architecture_rules',
        { pattern_id: patternId, standard_id: standardId, notes: txt(r.notes), created_by: await c.actor() },
        ['pattern_id', 'standard_id']);
      if (txt(r.trigger_component_name)) {
        const { rows: [rule] } = await c.q('SELECT id FROM architecture_rules WHERE pattern_id = $1 AND standard_id = $2', [patternId, standardId]);
        made += await insertRow(c, 'architecture_rule_triggers',
          { rule_id: rule.id, component_id: await c.componentId(r.trigger_component_name, r.trigger_component_type) },
          ['rule_id', 'component_id']);
      }
      return made ? 'imported' : 'skipped';
    } },

  { slug: 'membership-groups', columns: ['group_name', 'standard_name', 'notes', 'sort_index', 'role', 'component_name', 'component_type'],
    handle: async (r, c) => {
      const name = req(r.group_name, 'group_name');
      let { rows: [g] } = await c.q('SELECT id FROM membership_groups WHERE lower(btrim(name)) = lower(btrim($1))', [name]);
      let made = 0;
      if (!g) {
        made = await insertRow(c, 'membership_groups', {
          name, standard_id: await c.componentId(r.standard_name, 'information'), notes: txt(r.notes),
          sort_index: txt(r.sort_index) ? parseInt(r.sort_index, 10) : undefined, created_by: await c.actor() });
        ({ rows: [g] } = await c.q('SELECT id FROM membership_groups WHERE lower(btrim(name)) = lower(btrim($1))', [name]));
      }
      if (txt(r.component_name)) {
        const role = req(r.role, 'role');
        if (!['member', 'trigger'].includes(role)) throw new Error(`role must be "member" or "trigger", not "${role}"`);
        made += await insertRow(c, role === 'member' ? 'membership_group_members' : 'membership_group_triggers',
          { group_id: g.id, component_id: await c.componentId(r.component_name, r.component_type) }, ['group_id', 'component_id']);
      }
      return made ? 'imported' : 'skipped';
    } },

  { slug: 'system-builds', columns: ['build_name', 'notes', 'component_name', 'component_type'],
    handle: async (r, c) => {
      const name = req(r.build_name, 'build_name');
      let { rows: [b] } = await c.q('SELECT id FROM system_builds WHERE lower(btrim(name)) = lower(btrim($1))', [name]);
      let made = 0;
      if (!b) {
        made = await insertRow(c, 'system_builds', { name, notes: txt(r.notes), created_by: await c.actor() });
        ({ rows: [b] } = await c.q('SELECT id FROM system_builds WHERE lower(btrim(name)) = lower(btrim($1))', [name]));
      }
      if (txt(r.component_name)) {
        made += await insertRow(c, 'system_build_components',
          { build_id: b.id, component_id: await c.componentId(r.component_name, r.component_type) }, ['build_id', 'component_id']);
      }
      return made ? 'imported' : 'skipped';
    } },

  // `source` (v150): in_place = counted as chosen because the solution was complete
  // in place, so nobody chose it. An export from before v150 has no such column.
  { slug: 'solution-choices', columns: ['system_name', 'control_title', 'pattern_name', 'notes', 'chosen_by_email', 'source'],
    handle: async (r, c) => (await insertRow(c, 'system_solution_choices', {
      system_id: await c.systemId(r.system_name), control_id: await c.controlId(r.control_title),
      pattern_id: await c.patternId(req(r.pattern_name, 'pattern_name')), notes: txt(r.notes),
      source: r.source === 'in_place' ? 'in_place' : 'person',
      chosen_by: r.source === 'in_place' ? null : (await c.userId(r.chosen_by_email)) || (await c.actor()) },
      ['system_id', 'control_id']) ? 'imported' : 'skipped') },

  // ── Statement of Applicability (v122) and scopes (v126) ──────────────────────
  // One entry per objective: the file's decision replaces whatever is there, so
  // an imported SoA says what the organisation said.
  { slug: 'soa-entries', columns: ['control_title', 'applicable', 'drivers', 'justification', 'implementation_status', 'implementation_description', 'owner_email'],
    handle: async (r, c) => {
      const drivers = (txt(r.drivers) || '').split(';').map((d) => d.trim()).filter(Boolean);
      await c.actor();
      const res = await c.q(
        `INSERT INTO soa_entries (control_id, applicable, drivers, justification, implementation_status,
                                  implementation_description, owner_user_id, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (control_id) DO UPDATE SET applicable = EXCLUDED.applicable, drivers = EXCLUDED.drivers,
           justification = EXCLUDED.justification, implementation_status = EXCLUDED.implementation_status,
           implementation_description = EXCLUDED.implementation_description, owner_user_id = EXCLUDED.owner_user_id,
           updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [await c.controlId(r.control_title), boolOpt(r.applicable) ?? null, drivers, txt(r.justification),
         txt(r.implementation_status) || 'not_implemented', txt(r.implementation_description),
         await c.userId(r.owner_email), await c.actor()]);
      return res.rows[0].inserted ? 'imported' : 'skipped';
    } },

  { slug: 'scopes', columns: ['name', 'description'],
    handle: async (r, c) => {
      const name = req(r.name, 'name');
      if ((await c.q('SELECT 1 FROM scopes WHERE name = $1', [name])).rowCount) return 'skipped';
      await insertRow(c, 'scopes', { name, description: txt(r.description), created_by: await c.actor() });
      return 'imported';
    } },

  { slug: 'scope-systems', columns: ['scope_name', 'system_name'],
    handle: async (r, c) => (await insertRow(c, 'scope_systems',
      { scope_id: await c.scopeId(r.scope_name), system_id: await c.systemId(r.system_name), added_by: await c.actor() },
      ['scope_id', 'system_id']) ? 'imported' : 'skipped') },

  { slug: 'soa-entry-scopes', columns: ['control_title', 'scope_name'],
    handle: async (r, c) => (await insertRow(c, 'soa_entry_scopes',
      { control_id: await c.controlId(r.control_title), scope_id: await c.scopeId(r.scope_name) },
      ['control_id', 'scope_id']) ? 'imported' : 'skipped') },

  // ── Suppliers (v142–v144) ────────────────────────────────────────────────────
  { slug: 'suppliers', columns: ['name', 'notes'],
    handle: async (r, c) => {
      const name = req(r.name, 'name');
      if ((await c.q('SELECT 1 FROM suppliers WHERE lower(btrim(name)) = lower(btrim($1))', [name])).rowCount) return 'skipped';
      await insertRow(c, 'suppliers', { name, notes: txt(r.notes), created_by: await c.actor() });
      return 'imported';
    } },

  { slug: 'supplier-relationships', columns: ['supplier_name', 'relationship_type', 'department_name', 'system_name', 'component_name', 'component_type', 'description', 'contract_ref', 'contract_url', 'contract_start', 'contract_end', 'status'],
    handle: async (r, c) => {
      const sup = await c.supplierId(r.supplier_name);
      const sys = txt(r.system_name) ? await c.systemId(r.system_name) : null;
      const cmp = txt(r.component_name) ? await c.componentId(r.component_name, r.component_type) : null;
      const type = req(r.relationship_type, 'relationship_type');
      if ((await c.q(`SELECT 1 FROM supplier_relationships WHERE supplier_id = $1 AND relationship_type = $2
                        AND system_id IS NOT DISTINCT FROM $3::uuid AND component_id IS NOT DISTINCT FROM $4::uuid`,
        [sup, type, sys, cmp])).rowCount) return 'skipped';
      await insertRow(c, 'supplier_relationships', {
        supplier_id: sup, relationship_type: type, department_id: await c.deptId(r.department_name),
        system_id: sys, component_id: cmp, description: txt(r.description), contract_ref: txt(r.contract_ref),
        contract_url: txt(r.contract_url), contract_start: txt(r.contract_start), contract_end: txt(r.contract_end),
        status: req(r.status, 'status'), created_by: await c.actor(),
      });
      return 'imported';
    } },

  // Additions only: an objective the file omits is not removed from the set.
  { slug: 'supplier-type-objectives', columns: ['applies_to', 'control_title'],
    handle: async (r, c) => (await insertRow(c, 'supplier_type_objectives',
      { applies_to: req(r.applies_to, 'applies_to'), control_id: await c.controlId(r.control_title), added_by: await c.actor() },
      ['applies_to', 'control_id']) ? 'imported' : 'skipped') },

  { slug: 'supplier-evidence', columns: ['supplier_name', 'relationship_type', 'system_name', 'component_name', 'component_type', 'kind', 'title', 'reference', 'url', 'issued_on', 'expires_on', 'control_titles'],
    handle: async (r, c) => {
      const rel = await c.relationshipId(r);
      const title = req(r.title, 'title');
      if ((await c.q('SELECT 1 FROM supplier_evidence WHERE relationship_id = $1 AND title = $2', [rel, title])).rowCount) return 'skipped';
      const { rows } = await c.q(
        `INSERT INTO supplier_evidence (relationship_id, kind, title, reference, url, issued_on, expires_on, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [rel, req(r.kind, 'kind'), title, txt(r.reference), txt(r.url), txt(r.issued_on), txt(r.expires_on), await c.actor()]);
      for (const t of (txt(r.control_titles) || '').split(' | ').map((x) => x.trim()).filter(Boolean)) {
        await c.q('INSERT INTO supplier_evidence_objectives (evidence_id, control_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [rows[0].id, await c.controlId(t)]);
      }
      return 'imported';
    } },
];

// ── CLI ──────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { format: 'csv' };
  const pos = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') out.format = argv[++i];
    else if (a === '--actor') out.actor = argv[++i];
    else if (a === '--password') out.password = argv[++i];
    else if (a === '--template') out.template = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else pos.push(a);
  }
  out.dir = pos[0];
  return out;
}

function writeTemplates(dir, ext, sep) {
  fs.mkdirSync(dir, { recursive: true });
  for (const ds of DATASETS) {
    fs.writeFileSync(path.join(dir, `${ds.slug}.${ext}`), ds.columns.join(sep) + '\r\n');
  }
  console.log(`[import] wrote ${DATASETS.length} header-only templates to ${dir}/`);
}

async function run(opts) {
  const ext = opts.format === 'tsv' ? 'tsv' : 'csv';
  const sep = ext === 'tsv' ? '\t' : ',';

  if (opts.template) { writeTemplates(opts.template, ext, sep); return; }
  if (!opts.dir) throw new Error('Usage: node db/import.js <dir> [--format csv|tsv] [--actor <email>] [--password <pw>] [--dry-run]');
  if (!fs.existsSync(opts.dir)) throw new Error(`Directory not found: ${opts.dir}`);

  const demoPassword = opts.password || process.env.DEMO_PASSWORD || null;
  const client = await pool.connect();
  const ctx = makeContext(client, opts.actor, demoPassword);
  let totalErrors = 0;
  let totalImported = 0;
  try {
    await client.query('BEGIN');
    for (const ds of DATASETS) {
      let file = path.join(opts.dir, `${ds.slug}.${ext}`);
      // Accept an alternate filename (e.g. the exporter's `user-roles.csv` for the
      // `user_roles` dataset) so a straight Data Export re-imports without renaming.
      if (!fs.existsSync(file) && ds.altSlugs) {
        for (const alt of ds.altSlugs) {
          const p = path.join(opts.dir, `${alt}.${ext}`);
          if (fs.existsSync(p)) { file = p; break; }
        }
      }
      if (!fs.existsSync(file)) { console.log(`  ${ds.slug}: (no file — skipped)`); continue; }
      const { records } = parse(fs.readFileSync(file, 'utf8'), sep);
      let imported = 0, skipped = 0, errors = 0;
      const samples = [];
      for (let n = 0; n < records.length; n++) {
        await client.query('SAVEPOINT row');
        try {
          const action = await ds.handle(records[n], ctx);
          if (action === 'imported') imported++; else skipped++;
          await client.query('RELEASE SAVEPOINT row');
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT row');
          errors++;
          if (samples.length < 3) samples.push(`row ${n + 2}: ${err.message}`);
        }
      }
      if (ds.after && imported > 0) await ds.after(ctx);
      totalErrors += errors; totalImported += imported;
      const tail = errors ? `  ⚠ ${samples.join(' | ')}` : '';
      console.log(`  ${ds.slug}: imported ${imported}, skipped ${skipped}, errors ${errors}${tail}`);
    }

    if (opts.dryRun) {
      await client.query('ROLLBACK');
      console.log(`[import] DRY RUN — rolled back. Would import ${totalImported} rows (${totalErrors} errors).`);
    } else {
      await client.query('COMMIT');
      console.log(`[import] done — imported ${totalImported} rows, ${totalErrors} errors.`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (totalErrors > 0) process.exitCode = 1;
}

run(parseArgs(process.argv))
  .catch((err) => { console.error(`[import] ERROR: ${err.message}`); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
