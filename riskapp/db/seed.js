#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CIRKS production reference-data seed.
//
//   node db/seed.js
//
// Idempotent. Populates the reference data a fresh (migrated) database needs to
// be a working install — the schema-only baseline carries NO data:
//   * org_config       — the singleton config row (org_name from ORG_NAME env)
//   * capabilities      — the capability catalogue (app-defined; additive upsert)
//   * standards         — the four SoA-lens registry rows
//   * role_permissions  — the canonical role→capability grants, derived from the
//                         single source of truth src/auth/capabilityDefaults.js.
//                         Seeded ONLY when the table is empty, so a later admin
//                         RBAC edit is never clobbered on restart.
//   * NIST CSF 2.0      — the bundled native control catalogue + reference +
//                         mapping (only when no native controls exist yet).
//
// Deliberately seeds NO users — create the first admin with db/create-admin.js.
// Connection resolves like src/db/pool.js (DATABASE_URL or DB_*).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');
const capabilityDefaults = require('../src/auth/capabilityDefaults');

const SEED_DIR = path.join(__dirname, 'seed');
const readSql = (f) => fs.readFileSync(path.join(SEED_DIR, f), 'utf8');

async function count(client, sql) {
  const { rows } = await client.query(sql);
  return parseInt(rows[0].n, 10);
}

async function main() {
  const client = await pool.connect();
  try {
    // ── org_config singleton ────────────────────────────────────────────────
    const orgName = process.env.ORG_NAME || 'My Organisation';
    const org = await client.query(
      `INSERT INTO org_config (id, org_name) VALUES (true, $1)
       ON CONFLICT (id) DO NOTHING RETURNING 1`, [orgName]);
    console.log(org.rowCount
      ? `[seed] org_config singleton created (org_name="${orgName}").`
      : '[seed] org_config already present — left untouched.');

    // ── capability catalogue (app-defined; safe additive upsert) ─────────────
    await client.query(readSql('capabilities.sql'));
    console.log(`[seed] capabilities catalogue ensured (${await count(client,
      'SELECT count(*) n FROM capabilities')} caps).`);

    // ── standards registry ───────────────────────────────────────────────────
    await client.query(readSql('standards.sql'));
    console.log(`[seed] standards registry ensured (${await count(client,
      'SELECT count(*) n FROM standards')} standards).`);

    // ── role_permissions — canonical grants, only when empty ─────────────────
    const rpCount = await count(client, 'SELECT count(*) n FROM role_permissions');
    if (rpCount === 0) {
      const values = [];
      const params = [];
      let i = 1;
      for (const role of Object.keys(capabilityDefaults)) {
        for (const g of capabilityDefaults[role]) {
          values.push(`($${i++}, $${i++}, $${i++})`);
          params.push(role, g.key, g.scope || 'all_depts');
        }
      }
      await client.query(
        `INSERT INTO role_permissions (role, capability_key, scope)
         VALUES ${values.join(', ')}
         ON CONFLICT (role, capability_key) DO NOTHING`, params);
      console.log(`[seed] role_permissions seeded from capabilityDefaults (${values.length} grants).`);
    } else {
      console.log(`[seed] role_permissions already populated (${rpCount} rows) — left untouched (admin-editable).`);
    }

    // ── IS1 Business Impact Level reference catalogue ────────────────────────
    // Read-only reference behind the impact-table editor's "Adopt example text"
    // picker. Unconditional and idempotent, unlike the NIST load below: this is
    // reference material an organisation copies FROM, not content it owns, so a
    // populated `impact_tables` is no reason to withhold it. Empty on every
    // install built from the v88 baseline until now — see the file header.
    await client.query(readSql('is1_bil_reference.sql'));
    console.log(`[seed] IS1 BIL reference ensured (${await count(client,
      'SELECT count(*) n FROM bil_reference_levels')} level descriptors across ${await count(client,
      'SELECT count(*) n FROM bil_subcategories')} sub-categories).`);

    // ── NIST CSF 2.0 catalogue (only when no native controls exist) ──────────
    const controlCount = await count(client, 'SELECT count(*) n FROM controls');
    if (controlCount === 0) {
      console.log('[seed] loading bundled NIST CSF 2.0 catalogue…');
      await client.query(readSql('nist_csf_catalogue.sql'));
      console.log(`[seed] NIST CSF catalogue loaded (${await count(client,
        'SELECT count(*) n FROM controls')} native controls).`);
      // The supplier control sets (v143) resolve through this catalogue, so a
      // fresh install seeds them here — the migration ran before it existed.
      // Only alongside the catalogue load, never on every boot: an objective an
      // organisation removed from a set must stay removed.
      const { rows } = await client.query('SELECT seed_supplier_type_objectives() AS n');
      console.log(`[seed] supplier control sets seeded (${rows[0].n} objectives).`);
    } else {
      console.log(`[seed] controls already present (${controlCount}) — skipping NIST CSF load.`);
    }

    console.log('[seed] done.');
  } finally {
    client.release();
  }
}

main()
  .catch((err) => { console.error(`[seed] ERROR: ${err.message}`); process.exitCode = 1; })
  .finally(() => pool.end().catch(() => {}));
