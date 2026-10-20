'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Standards registry + reference-catalogue / mapping import (v87 Phase B).
//
// A standard (ISO 27001 / CIS v8 / NIST) is a REFERENCE lens: its checklist lives in
// `standard_controls`, and the org's CIRKS-native controls map to it via
// `control_mappings`. This router lets an admin enable a standard and import its
// reference catalogue + the crosswalk — the "select & import control sets" setup step.
//
// Reads: controls.read. Enable/disable + imports: controls.import (admin).
// Native-control import stays on POST /controls/import.

const { Router }   = require('express');
const authenticate = require('../../middleware/authenticate');
const { requireCapability } = require('../../auth/permissions');
const { query }    = require('../../db/pool');
const { parseCSV, multerUpload } = require('../controls/importControlsController');

const router = Router();
router.use(authenticate);

const canRead   = requireCapability('controls.read');
const canImport = requireCapability('controls.import');

// Run the shared multer upload inline so we can return JSON errors.
function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    multerUpload(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

// ── GET /standards ────────────────────────────────────────────────────────────
// The registry + per-standard counts for the setup page.
router.get('/', canRead, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT s.id, s.code, s.name, s.version, s.publisher, s.license,
             s.is_enabled, s.bundled, s.sort_index,
             COALESCE(rc.ref_count, 0)::int        AS reference_count,
             COALESCE(mc.mapped_count, 0)::int     AS mapped_count,
             COALESCE(ac.applicable_count, 0)::int AS applicable_count
      FROM standards s
      LEFT JOIN (SELECT standard_id, COUNT(*) AS ref_count FROM standard_controls GROUP BY standard_id) rc
        ON rc.standard_id = s.id
      LEFT JOIN (
        SELECT sc.standard_id, COUNT(DISTINCT cm.standard_control_id) AS mapped_count
        FROM standard_controls sc JOIN control_mappings cm ON cm.standard_control_id = sc.id
        GROUP BY sc.standard_id
      ) mc ON mc.standard_id = s.id
      -- Applicable = covered or partly covered: at least one mapped control is
      -- applicable and the requirement is not excluded. Derived from the one SoA
      -- record (v122); a requirement has no applicability of its own.
      LEFT JOIN (
        SELECT sc.standard_id, COUNT(*) AS applicable_count
        FROM standard_controls sc
        WHERE NOT EXISTS (SELECT 1 FROM standard_requirement_exclusions ex WHERE ex.standard_control_id = sc.id)
          AND EXISTS (SELECT 1 FROM control_mappings cm
                      JOIN soa_entries se ON se.control_id = cm.control_id AND se.applicable
                      WHERE cm.standard_control_id = sc.id)
        GROUP BY sc.standard_id
      ) ac ON ac.standard_id = s.id
      ORDER BY s.sort_index, s.name
    `);
    res.json({ standards: rows });
  } catch (err) { next(err); }
});

// ── PATCH /standards/:id ──────────────────────────────────────────────────────
// Enable/disable a standard (whether it shows as a SoA lens).
router.patch('/:id', canImport, async (req, res, next) => {
  try {
    const { is_enabled } = req.body || {};
    if (typeof is_enabled !== 'boolean') {
      return res.status(400).json({ error: 'is_enabled (boolean) is required.' });
    }
    const { rows } = await query(
      `UPDATE standards SET is_enabled = $1, updated_at = now() WHERE id = $2
       RETURNING id, code, is_enabled`,
      [is_enabled, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Standard not found.' });
    res.json({ standard: rows[0] });
  } catch (err) { next(err); }
});

// ── POST /standards/:id/controls/import ───────────────────────────────────────
// Import a standard's REFERENCE catalogue from CSV → standard_controls.
// Columns: ref_code (required), title (required), description, grouping,
// implementation_group (1–3). Idempotent on (standard_id, ref_code).
router.post('/:id/controls/import', canImport, async (req, res, next) => {
  try {
    await runUpload(req, res);
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Maximum 5 MB.' });
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Send the CSV as a form field named "file".' });

  const std = await query(`SELECT id FROM standards WHERE id = $1`, [req.params.id]);
  if (!std.rows.length) return res.status(404).json({ error: 'Standard not found.' });

  const { headers, rows } = parseCSV(req.file.buffer.toString('utf-8'));
  const REQUIRED = ['ref_code', 'title'];
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) return res.status(400).json({ error: `Missing required column(s): ${missing.join(', ')}.` });
  if (!rows.length)   return res.status(400).json({ error: 'File contains no data rows.' });

  const get = (fields, name) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (fields[idx] || '').trim() : '';
  };

  const valid = [];
  const errors = [];
  for (const { lineNumber, fields } of rows) {
    const ref_code = get(fields, 'ref_code');
    const title    = get(fields, 'title');
    if (!ref_code || !title) { errors.push({ row: lineNumber, message: 'ref_code and title are required.' }); continue; }
    const igRaw = get(fields, 'implementation_group');
    const ig = igRaw && ['1', '2', '3'].includes(igRaw) ? parseInt(igRaw, 10) : null;
    valid.push({
      ref_code, title,
      description: get(fields, 'description') || null,
      grouping:   get(fields, 'grouping') || null,
      implementation_group: ig,
      // Zero-padded numeric sort key from the ref (e.g. 10.3 -> 010.003.000).
      sort_index: ref_code.replace(/[^0-9.]/g, '').split('.').slice(0, 3)
        .map(n => (n || '0').padStart(3, '0')).join('.').padEnd(11, '.0'),
    });
  }
  if (!valid.length) return res.status(422).json({ imported: 0, skipped: 0, errors, message: 'No valid rows.' });

  try {
    const params = [req.params.id];
    const placeholders = valid.map((r, i) => {
      const b = i * 6 + 2;
      params.push(r.ref_code, r.title, r.description, r.grouping, r.implementation_group, r.sort_index);
      return `($1, $${b}, $${b+1}, $${b+2}, $${b+3}, $${b+4}::smallint, $${b+5})`;
    });
    const result = await query(
      `INSERT INTO standard_controls (standard_id, ref_code, title, description, grouping, implementation_group, sort_index)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (standard_id, ref_code) DO NOTHING
       RETURNING id`,
      params
    );
    const imported = result.rowCount;
    res.status(201).json({ imported, skipped: valid.length - imported, errors });
  } catch (err) { next(err); }
});

// ── POST /control-mappings/import ─────────────────────────────────────────────
// Import the native-control ⇄ standard-reference crosswalk from CSV.
// Columns: control_title (required), standard (code, required), standard_ref (required),
// coverage (full|partial, default full). Resolves by business keys; idempotent.
router.post('/mappings/import', canImport, async (req, res, next) => {
  try {
    await runUpload(req, res);
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Maximum 5 MB.' });
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Send the CSV as a form field named "file".' });

  const { headers, rows } = parseCSV(req.file.buffer.toString('utf-8'));
  const REQUIRED = ['control_title', 'standard', 'standard_ref'];
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) return res.status(400).json({ error: `Missing required column(s): ${missing.join(', ')}.` });
  if (!rows.length)   return res.status(400).json({ error: 'File contains no data rows.' });

  const get = (fields, name) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (fields[idx] || '').trim() : '';
  };

  let imported = 0, skipped = 0;
  const errors = [];
  for (const { lineNumber, fields } of rows) {
    const controlTitle = get(fields, 'control_title');
    const stdCode      = get(fields, 'standard');
    const stdRef       = get(fields, 'standard_ref');
    const coverage     = (get(fields, 'coverage') || 'full').toLowerCase();
    if (!controlTitle || !stdCode || !stdRef) { errors.push({ row: lineNumber, message: 'control_title, standard, standard_ref required.' }); continue; }
    if (!['full', 'partial'].includes(coverage)) { errors.push({ row: lineNumber, message: `coverage must be full|partial.` }); continue; }
    try {
      const r = await query(
        `INSERT INTO control_mappings (control_id, standard_control_id, coverage, created_by)
         SELECT c.id, sc.id, $4, $5
         FROM controls c, standard_controls sc JOIN standards s ON s.id = sc.standard_id
         WHERE lower(c.title) = lower($1) AND s.code = $2 AND sc.ref_code = $3
         ON CONFLICT (control_id, standard_control_id) DO NOTHING
         RETURNING id`,
        [controlTitle, stdCode, stdRef, coverage, req.user.id]
      );
      if (r.rowCount) imported++;
      else { skipped++; errors.push({ row: lineNumber, message: `No match for control "${controlTitle}" ↔ ${stdCode} ${stdRef} (or already mapped).` }); }
    } catch (e) {
      errors.push({ row: lineNumber, message: e.message });
    }
  }
  res.status(201).json({ imported, skipped, errors });
});

module.exports = router;
