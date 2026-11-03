'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The CIRKS starter library (owner, 2026-11-02: "make life easy"): what a new
// organisation would otherwise have to write before CIRKS can do anything for it.
// The files in starter/ are in db/import.js format, so the SAME files load into an
// existing installation with `node db/import.js db/seed/starter` (anything already
// there is skipped).
//
//   threats.csv, control-threats.csv — the 20 threats of the Misty Isles training
//     dataset and their 157 links to the CIRKS control objectives. The links are
//     what make a deployed objective count against a risk (a risk's controls are
//     system_controls ∩ control_threats) and what the "Suggested for this threat"
//     list reads. Each threat's probabilities are CIRKS's starting estimates, to be
//     revised. Loaded by db/seed.js alongside the CIRKS objectives on a NEW
//     installation, and only into an empty threat catalogue — never on a later
//     boot, so threats an organisation removed stay removed.
//
//   components.csv, control-component-links.csv — 25 policies, standards and
//     procedures, each NOT PUBLISHED (status planned) and organisational, linked
//     to the objectives it supports. Not published counts for nothing: a draft is
//     not in place, and the review finding looks only at published documents. A
//     component needs a creating user, which a new installation does not have
//     until its first administrator, so db/create-admin.js loads them — only when
//     there are no policies or documents yet.
//
// Links whose objective is not in the library (an installation on its own
// objectives) are skipped, never failed.

const fs = require('fs');
const path = require('path');
const { parse } = require('../csv');

const DIR = path.join(__dirname, 'starter');
const read = (file) => parse(fs.readFileSync(path.join(DIR, file), 'utf8')).records;
const blank = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

async function controlIdByTitle(client, title) {
  const { rows } = await client.query('SELECT id FROM controls WHERE title = $1', [title]);
  return rows.length === 1 ? rows[0].id : null;
}

// Threats + their objective links, into an EMPTY catalogue only. Returns the
// counts, or null when the catalogue already has threats.
async function loadStarterThreats(client) {
  const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM threats');
  if (n > 0) return null;

  await client.query('BEGIN');
  try {
    const ids = new Map();
    for (const t of read('threats.csv')) {
      const { rows: [row] } = await client.query(
        `INSERT INTO threats (name, description, threat_category, source, probability_c, probability_i,
                              probability_a, probability_notes, default_baseline_probability,
                              reference_code, is_active)
         VALUES ($1, $2, $3::threat_category, $4::threat_source, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [t.name, blank(t.description), t.threat_category, t.source, Number(t.probability_c),
         Number(t.probability_i), Number(t.probability_a), blank(t.probability_notes),
         blank(t.default_baseline_probability) && Number(t.default_baseline_probability),
         blank(t.reference_code), t.is_active !== 'false']);
      ids.set(t.name, row.id);
    }
    let links = 0;
    for (const l of read('control-threats.csv')) {
      const control = await controlIdByTitle(client, l.control_title);
      const threat = ids.get(l.threat_name);
      if (!control || !threat) continue;
      const r = await client.query(
        `INSERT INTO control_threats (control_id, threat_id, notes) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [control, threat, blank(l.notes)]);
      links += r.rowCount;
    }
    await client.query('COMMIT');
    return { threats: ids.size, links };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

// Not-published policies, standards and procedures + the objectives each
// supports, created by `userId` — only when there are no documents yet. Returns
// the counts, or null when documents already exist.
async function loadStarterDocuments(client, userId) {
  const { rows: [{ n }] } = await client.query(
    `SELECT count(*)::int AS n FROM control_components WHERE component_type = 'information'`);
  if (n > 0) return null;

  await client.query('BEGIN');
  try {
    const ids = new Map();
    for (const d of read('components.csv')) {
      const { rows: [row] } = await client.query(
        `INSERT INTO control_components (name, component_type, status, description, notes, created_by,
                                         instantiation, document_kind)
         VALUES ($1, 'information', $2::component_status, $3, $4, $5, $6, $7) RETURNING id`,
        [d.name, d.status, blank(d.description), blank(d.notes), userId, blank(d.instantiation),
         blank(d.document_kind)]);
      ids.set(d.name, row.id);
    }
    let links = 0;
    for (const l of read('control-component-links.csv')) {
      const control = await controlIdByTitle(client, l.control_title);
      const component = ids.get(l.component_name);
      if (!control || !component) continue;
      const r = await client.query(
        `INSERT INTO control_component_links (control_id, component_id, role, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [control, component, blank(l.role), userId]);
      links += r.rowCount;
    }
    await client.query('COMMIT');
    return { documents: ids.size, links };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

module.exports = { loadStarterThreats, loadStarterDocuments, STARTER_DIR: DIR };
