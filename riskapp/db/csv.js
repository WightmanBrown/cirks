'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Minimal CSV/TSV parser — the read-side counterpart to the serialiser in
// routes/admin/export.js (RFC-4180-ish: double-quoted fields, "" escapes a
// quote, fields may contain the separator / CR / LF, CRLF or LF row endings).
// parse(text, sep) → array of objects keyed by the header row.

function parseDelimited(text, sep) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  let started = false; // whether the current row has any content/fields yet

  const endField = () => { row.push(field); field = ''; started = true; };
  const endRow = () => { rows.push(row); row = []; started = false; };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; started = true; i++; continue; }
    if (ch === sep) { endField(); i++; continue; }
    if (ch === '\r') { i++; continue; }            // swallow CR (CRLF or lone CR)
    if (ch === '\n') { endField(); endRow(); i++; continue; }
    field += ch; started = true; i++;
  }
  // Flush a trailing field/row that isn't newline-terminated.
  if (started || field.length || row.length) { endField(); endRow(); }
  return rows;
}

// Returns { columns: string[], records: Array<Object> }. Blank lines are
// ignored. A row with fewer cells than the header pads with '' ; extra
// cells are dropped.
//
// Files saved from a spreadsheet are read as they come (2026-10-13):
//   - Excel's "CSV UTF-8" starts the file with a byte-order mark, which would
//     otherwise become part of the first column's name ("\uFEFFname") and make
//     every row fail with `missing required "name"`;
//   - header names are trimmed, so "name " is still `name`;
//   - a row of nothing but separators (",,,": cells cleared but the row left
//     behind) is a blank line, not a record with every field missing.
function parse(text, sep = ',') {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const grid = parseDelimited(text, sep).filter(
    (r) => !r.every((cell) => cell.trim() === '')); // drop empty lines
  if (grid.length === 0) return { columns: [], records: [] };
  const columns = grid[0].map((c) => c.trim());
  const records = grid.slice(1).map((cells) => {
    const obj = {};
    columns.forEach((c, idx) => { obj[c] = idx < cells.length ? cells[idx] : ''; });
    return obj;
  });
  return { columns, records };
}

module.exports = { parse };
