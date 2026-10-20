'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const multer = require('multer');
const { query } = require('../../db/pool');

// ── Multer setup ──────────────────────────────────────────────────────────────

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!/\.(csv|tsv|txt)$/i.test(file.originalname)) {
      return cb(Object.assign(
        new Error('Only .csv, .tsv or .txt files are accepted.'),
        { status: 400 }
      ));
    }
    cb(null, true);
  },
}).single('file');

// ── Normalisation maps ────────────────────────────────────────────────────────

const TYPE_MAP = {
  identify:   { control_type: 'preventive', framework_function: 'Identify' },
  protect:    { control_type: 'preventive', framework_function: 'Protect'  },
  detect:     { control_type: 'detective',  framework_function: 'Detect'   },
  respond:    { control_type: 'corrective', framework_function: 'Respond'  },
  recover:    { control_type: 'corrective', framework_function: 'Recover'  },
  preventive: { control_type: 'preventive', framework_function: null       },
  detective:  { control_type: 'detective',  framework_function: null       },
  corrective: { control_type: 'corrective', framework_function: null       },
  deterrent:  { control_type: 'deterrent',  framework_function: null       },
};

// ── CSV / TSV parser ──────────────────────────────────────────────────────────

function detectSeparator(firstLine) {
  const tabs   = (firstLine.match(/\t/g)  || []).length;
  const commas = (firstLine.match(/,/g)   || []).length;
  return tabs >= commas ? '\t' : ',';
}

function parseLine(line, sep) {
  const fields = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function splitCSVRows(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuote && normalized[i + 1] === '"') { current += '""'; i++; }
      else { inQuote = !inQuote; current += ch; }
    } else if (ch === '\n' && !inQuote) {
      if (current.trim().length > 0) rows.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) rows.push(current);
  return rows;
}

function parseCSV(text) {
  const rows = splitCSVRows(text);
  if (rows.length === 0) return { headers: [], rows: [] };

  const sep     = detectSeparator(rows[0]);
  const headers = parseLine(rows[0], sep).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const dataRows = rows.slice(1).map((row, i) => ({
    lineNumber: i + 2,
    fields: parseLine(row, sep),
  }));

  return { headers, rows: dataRows, sep };
}

// ── Row transformer ───────────────────────────────────────────────────────────

function transformRow(headers, fields, lineNumber) {
  const get = (name) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (fields[idx] || '').trim() : '';
  };

  const rawType      = get('control_type');
  const title        = get('title');
  const description  = get('description');
  const rawBaseline  = get('is_baseline').toLowerCase();
  // Optional (v123): the objective's own reference. Blank = none.
  const reference    = get('reference_code') || null;

  const errors = [];

  if (!title) errors.push('Missing required field: title');
  if (reference && reference.length > 100) errors.push('reference_code must be 100 characters or fewer');

  const typeEntry = TYPE_MAP[rawType.toLowerCase()];
  if (!typeEntry) errors.push(`Unknown control_type: "${rawType}"`);

  if (errors.length) return { lineNumber, errors };

  const is_baseline = ['true', '1', 'yes'].includes(rawBaseline);

  return {
    lineNumber,
    title,
    description:  description || null,
    control_type: typeEntry.control_type,
    is_baseline,
    reference_code: reference,
    errors: [],
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

async function importControls(req, res, next) {
  // Run multer inline so we can return proper JSON errors on failure.
  try {
    await new Promise((resolve, reject) => {
      multerUpload(req, res, (err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum 5 MB.' });
    }
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send the CSV as a form field named "file".' });
  }

  const text = req.file.buffer.toString('utf-8');
  const { headers, rows } = parseCSV(text);

  // Native-control import. Standard reference catalogues + mappings have their own
  // import endpoints (routes/standards). framework/framework_ref columns, if present,
  // are ignored here.
  const REQUIRED_HEADERS = ['control_type', 'title', 'description', 'is_baseline'];
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length) {
    return res.status(400).json({
      error: `Missing required column(s): ${missingHeaders.join(', ')}.`,
    });
  }

  if (rows.length === 0) {
    return res.status(400).json({ error: 'File contains no data rows.' });
  }

  // Transform and validate each row.
  const valid  = [];
  const errors = [];

  for (const { lineNumber, fields } of rows) {
    const result = transformRow(headers, fields, lineNumber);
    if (result.errors.length) {
      errors.push({ row: lineNumber, message: result.errors.join('; ') });
    } else {
      valid.push(result);
    }
  }

  // A reference must identify one objective (uq_controls_reference_code, v123).
  // A clash — within the file, or with an objective already in the library — is
  // reported for that row and the row skipped, rather than failing the batch.
  const withRef = valid.filter(r => r.reference_code);
  if (withRef.length) {
    const taken = await query(
      `SELECT lower(btrim(reference_code)) AS ref FROM controls
        WHERE lower(btrim(reference_code)) = ANY($1::text[])`,
      [withRef.map(r => r.reference_code.toLowerCase())]
    );
    const inDb = new Set(taken.rows.map(r => r.ref));
    const seen = new Set();
    const kept = [];
    for (const row of valid) {
      const key = row.reference_code?.toLowerCase();
      if (key && inDb.has(key)) {
        errors.push({ row: row.lineNumber, message: `reference_code "${row.reference_code}" is already used by another control objective` });
      } else if (key && seen.has(key)) {
        errors.push({ row: row.lineNumber, message: `reference_code "${row.reference_code}" appears more than once in this file` });
      } else {
        if (key) seen.add(key);
        kept.push(row);
      }
    }
    valid.splice(0, valid.length, ...kept);
  }

  if (valid.length === 0) {
    return res.status(422).json({
      imported: 0, skipped: 0, errors,
      message: 'No valid rows found. See errors for details.',
    });
  }

  // Batch insert native controls. Dedup by title (case-insensitive) against existing
  // rows so re-running the import is idempotent; no framework unique key any more.
  const params       = [];
  const placeholders = valid.map((row, i) => {
    const b = i * 6;
    params.push(row.title, row.description, row.control_type, row.is_baseline, req.user.id, row.reference_code);
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6})`;
  });

  try {
    const result = await query(
      `INSERT INTO controls (title, description, control_type, is_baseline, created_by, reference_code)
       SELECT v.title, v.description, v.control_type::control_type, v.is_baseline::boolean,
              v.created_by::uuid, NULLIF(btrim(v.reference_code), '')
       FROM (VALUES ${placeholders.join(',')}) AS v(title, description, control_type, is_baseline, created_by, reference_code)
       WHERE NOT EXISTS (SELECT 1 FROM controls c WHERE lower(c.title) = lower(v.title))
       RETURNING id`,
      params
    );

    const imported = result.rowCount;
    const skipped  = valid.length - imported;

    res.status(201).json({ imported, skipped, errors });
  } catch (err) {
    next(err);
  }
}

module.exports = { importControls, parseCSV, multerUpload };
