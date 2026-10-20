'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// ── Statement splitting, for no-transaction files only ───────────────────────
//
// `client.query(wholeFile)` sends every statement as ONE simple query, and
// Postgres runs a multi-statement simple query in a single IMPLICIT transaction.
// So `-- migrate:no-transaction` did not actually mean "no transaction": a file
// adding an enum value and then using it was still refused with "unsafe use of
// new value … of enum type", exactly as if the directive were absent. That took
// CIRKS-test down on 2026-09-10.
//
// psql does not hit this because it sends statements one at a time. This does
// the same, so the directive now means what it says.
//
// Respects the three things that make a naive split on ';' wrong: single-quoted
// strings (with '' escaping), dollar-quoted bodies ($$ … $$ / $tag$ … $tag$,
// which is how every function in this schema is written), and comments.
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const rest = sql.slice(i);

    if (ch === "'") {                                   // single-quoted string
      const m = /^'(?:[^']|'')*'/.exec(rest);
      if (m) { buf += m[0]; i += m[0].length; continue; }
    }
    if (ch === '$') {                                   // dollar-quoted body
      const open = /^\$[A-Za-z_]*\$/.exec(rest);
      if (open) {
        const tag = open[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        buf += sql.slice(i, stop); i = stop; continue;
      }
    }
    if (rest.startsWith('--')) {                        // line comment
      const nl = sql.indexOf('\n', i);
      const stop = nl === -1 ? sql.length : nl + 1;
      buf += sql.slice(i, stop); i = stop; continue;
    }
    if (rest.startsWith('/*')) {                        // block comment
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      buf += sql.slice(i, stop); i = stop; continue;
    }
    if (ch === ';') { out.push(buf); buf = ''; i += 1; continue; }

    buf += ch; i += 1;
  }
  out.push(buf);
  // Keep only statements with something executable in them.
  return out.filter((st) => st.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0);
}

module.exports = { splitStatements };
