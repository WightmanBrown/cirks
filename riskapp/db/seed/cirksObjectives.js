'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The CIRKS control objectives: the library CIRKS ships (owner, 2026-10-28), and
// the reporting sets mapped onto it.
//
// cirks_objectives_v1.csv is the source, exactly as the owner wrote and approved
// it: reference, subject, title, description, control type, and the ISO/IEC
// 27001:2022, CIS Controls v8.1 and NIST CSF 2.0 references each objective meets.
//
// NIST CSF is public domain and ships with its wording (nist_csf_reference.sql).
// ISO and CIS are licensed, so their requirements ship as REFERENCE NUMBERS ONLY;
// an organisation that holds a licence uploads its own copy (Setup → Objectives
// and standards) and the numbers gain their words. The mappings ship for all three.
//
// Loaded by db/seed.js into a NEW install only (no objectives yet). Everything is
// checked before anything is written, so a malformed sheet loads nothing.

const fs = require('fs');
const path = require('path');
const { parse } = require('../csv');

const SOURCE = path.join(__dirname, 'cirks_objectives_v1.csv');
const OWN_REF = /^CIRKS[0-9]+\.[A-Z]+-[0-9]{2}$/;
const TYPES = new Set(['preventive', 'detective', 'corrective', 'deterrent']);

// ISO/IEC 27001:2022: the management-system clauses and the 93 Annex A controls.
// Numbers only: they are the structure of the standard, not its text.
const ISO_CLAUSES = ['4.1', '4.2', '4.3', '4.4', '5.1', '5.2', '5.3', '6.1.1', '6.1.2', '6.1.3', '6.2', '6.3',
  '7.1', '7.2', '7.3', '7.4', '7.5', '8.1', '8.2', '8.3', '9.1', '9.2', '9.3', '10.1', '10.2'];
const ISO_ANNEX_A = [['5', 37], ['6', 8], ['7', 14], ['8', 34]]
  .flatMap(([theme, n]) => Array.from({ length: n }, (_, i) => `A.${theme}.${i + 1}`));
// CIS Controls v8.1: 18 controls and their 153 safeguards.
const CIS_SAFEGUARDS = [5, 7, 14, 12, 6, 8, 7, 12, 7, 7, 5, 8, 11, 9, 7, 14, 9, 5]
  .flatMap((n, c) => Array.from({ length: n }, (_, i) => `${c + 1}.${i + 1}`));
const LICENSED_TITLE = 'Wording not shipped: upload your licensed copy';

// "Clause 6.1.2, 6.1.3, A.5.2" → ['6.1.2', '6.1.3', 'A.5.2']; "No direct Annex A equivalent" → [].
function isoRefs(cell) {
  return cell.split(/[,;]/).map((t) => t.trim().replace(/^Clause\s+/i, ''))
    .filter((t) => /^(A\.)?\d+(\.\d+)+$/.test(t));
}
const list = (cell) => cell.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
// A sort key that orders 6.1.2 before 6.1.10 and A.5.9 before A.5.10.
const sortKey = (ref) => ref.replace(/^A\./, '1.').split('.').map((n) => n.padStart(3, '0')).join('.');

function readObjectives() {
  const rows = parse(fs.readFileSync(SOURCE, 'utf8')).records;
  const problems = [];
  const seenRef = new Set(); const seenTitle = new Set();
  const objectives = rows.map((r, i) => {
    const o = {
      ref: r.Reference.trim(), subject: r['Major subject'].trim(), title: r.Title.trim(),
      description: r.Description.trim(), type: r['Control type'].trim(),
      iso: isoRefs(r['ISO 27001:2022 mapping']), cis: list(r['CIS Controls v8.1 mapping']),
      nist: r['NIST CSF 2.0 mapping'].match(/[A-Z]{2}\.[A-Z]{2}-\d\d/g) || [],
    };
    const at = `row ${i + 2} (${o.ref || 'no reference'})`;
    if (!OWN_REF.test(o.ref)) problems.push(`${at}: the reference is not of the form CIRKS1.SUBJECT-NN`);
    if (seenRef.has(o.ref)) problems.push(`${at}: the reference is used twice`);
    if (seenTitle.has(o.title.toLowerCase())) problems.push(`${at}: the title is used twice`);
    if (!o.title || !o.description || !o.subject) problems.push(`${at}: subject, title and description are required`);
    if (!TYPES.has(o.type)) problems.push(`${at}: control type "${o.type}" is not one of ${[...TYPES].join(', ')}`);
    for (const x of o.iso) if (!ISO_CLAUSES.includes(x) && !ISO_ANNEX_A.includes(x)) problems.push(`${at}: ISO reference ${x} does not exist`);
    for (const x of o.cis) if (!CIS_SAFEGUARDS.includes(x)) problems.push(`${at}: CIS safeguard ${x} does not exist`);
    seenRef.add(o.ref); seenTitle.add(o.title.toLowerCase());
    return o;
  });
  if (problems.length) throw new Error(`cirks_objectives_v1.csv cannot be loaded:\n  ${problems.join('\n  ')}`);
  return objectives;
}

// Load the objectives, the ISO and CIS reference numbers, every mapping, and an
// SoA entry saying each objective applies (an organisation narrows it from there,
// as it did with the NIST library). `client` is inside the caller's connection.
async function loadCirksObjectives(client) {
  const objectives = readObjectives();
  const std = async (code) => {
    const { rows } = await client.query('SELECT id FROM standards WHERE code = $1', [code]);
    if (!rows.length) throw new Error(`standard ${code} is not registered (db/seed/standards.sql)`);
    return rows[0].id;
  };
  const [iso, cis, nist] = [await std('iso27001'), await std('cis_v8'), await std('nist_csf')];

  await client.query('BEGIN');
  try {
    const requirement = (standardId, ref) => client.query(
      `INSERT INTO standard_controls (standard_id, ref_code, title, sort_index)
       VALUES ($1, $2, $3, $4) ON CONFLICT (standard_id, ref_code) DO NOTHING`,
      [standardId, ref, LICENSED_TITLE, sortKey(ref)]);
    for (const ref of [...ISO_CLAUSES, ...ISO_ANNEX_A]) await requirement(iso, ref);
    for (const ref of CIS_SAFEGUARDS) await requirement(cis, ref);

    const { rows: [{ n: nistLoaded }] } = await client.query(
      'SELECT count(*)::int AS n FROM standard_controls WHERE standard_id = $1', [nist]);
    if (!nistLoaded) throw new Error('the NIST CSF requirements are not loaded (nist_csf_reference.sql runs first)');

    let mappings = 0;
    for (const o of objectives) {
      const { rows: [c] } = await client.query(
        `INSERT INTO controls (title, description, control_type, reference_code, subject)
         VALUES ($1, $2, $3::control_type, $4, $5) RETURNING id`,
        [o.title, o.description, o.type, o.ref, o.subject]);
      await client.query('INSERT INTO soa_entries (control_id, applicable) VALUES ($1, TRUE)', [c.id]);
      for (const [standardId, refs] of [[iso, o.iso], [cis, o.cis], [nist, o.nist]]) {
        for (const ref of new Set(refs)) {
          const r = await client.query(
            `INSERT INTO control_mappings (control_id, standard_control_id, coverage)
             SELECT $1, sc.id, 'full' FROM standard_controls sc WHERE sc.standard_id = $2 AND sc.ref_code = $3
             ON CONFLICT DO NOTHING`, [c.id, standardId, ref]);
          if (!r.rowCount) throw new Error(`${o.ref}: requirement ${ref} not found`);
          mappings += r.rowCount;
        }
      }
    }
    await client.query('COMMIT');
    return { objectives: objectives.length, mappings };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

module.exports = { loadCirksObjectives, readObjectives, isoRefs, ISO_CLAUSES, ISO_ANNEX_A, CIS_SAFEGUARDS };
