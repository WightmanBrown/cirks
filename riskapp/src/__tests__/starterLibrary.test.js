'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The CIRKS starter library (db/seed/starter/, owner 2026-11-02) is data a new
// installation loads without anyone checking it by eye, so its consistency is
// checked here, without a database:
//   * every link names a CIRKS objective that exists, and a threat or document
//     in the same folder — a link that resolves to nothing is skipped silently
//     by the loader, so it must not be possible to ship one;
//   * the threats and their links are the Misty Isles ones: a training install
//     finds them already loaded and skips its own, so the two must not drift.

const fs = require('fs');
const path = require('path');
const { parse } = require('../../db/csv');
const { STARTER_DIR } = require('../../db/seed/starterLibrary');
const { STARTER_TABLES } = require('../routes/bil/starterTables');

const read = (dir, file) => parse(fs.readFileSync(path.join(dir, file), 'utf8')).records;
const starter = (file) => read(STARTER_DIR, file);
const MIG = path.join(__dirname, '..', '..', 'db', 'dataset', 'misty-isles', 'baseline');
const objectiveTitles = new Set(
  read(path.join(__dirname, '..', '..', 'db', 'seed'), 'cirks_objectives_v1.csv').map((o) => o.Title));

describe('the starter threats', () => {
  const threats = starter('threats.csv');
  const links = starter('control-threats.csv');

  test('20 threats, each with a valid category, source and probabilities', () => {
    expect(threats).toHaveLength(20);
    for (const t of threats) {
      expect(['accidental', 'deliberate', 'environmental']).toContain(t.threat_category);
      expect(['internal', 'external', 'natural']).toContain(t.source);
      for (const p of [t.probability_c, t.probability_i, t.probability_a]) expect(Number(p)).toBeGreaterThanOrEqual(1);
      expect(t.description).not.toMatch(/\bMIG\b|Misty/);
    }
  });

  test('every link names a CIRKS objective and a starter threat, once', () => {
    const names = new Set(threats.map((t) => t.name));
    const pairs = links.map((l) => `${l.control_title}|${l.threat_name}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const l of links) {
      expect(objectiveTitles.has(l.control_title)).toBe(true);
      expect(names.has(l.threat_name)).toBe(true);
    }
    expect(links.length).toBe(157);
  });

  test('are the Misty Isles threats and links, so a training install is unchanged', () => {
    const migThreats = read(MIG, 'threats.csv').map((t) => t.name).sort();
    expect(threats.map((t) => t.name).sort()).toEqual(migThreats);
    const migPairs = read(MIG, 'control-threats.csv').filter((l) => l.control_title && l.threat_name)
      .map((l) => `${l.control_title}|${l.threat_name}`).sort();
    expect(links.map((l) => `${l.control_title}|${l.threat_name}`).sort()).toEqual(migPairs);
  });
});

describe('the starter documents', () => {
  const docs = starter('components.csv');
  const links = starter('control-component-links.csv');

  test('policies, standards and procedures, organisational and NOT published', () => {
    expect(docs.length).toBeGreaterThanOrEqual(20);
    for (const d of docs) {
      expect(d.component_type).toBe('information');
      expect(['policy', 'standard', 'procedure']).toContain(d.document_kind);
      expect(d.status).toBe('planned');            // Not published: counts for nothing
      expect(d.instantiation).toBe('organisational');
      expect(d.document_approved_on).toBe('');
      expect(d.document_next_review).toBe('');
      expect(d.description).toBeTruthy();
    }
    // The architecture template cites this one by name.
    expect(docs.map((d) => d.name)).toContain('Security architecture standard');
  });

  test('every document supports at least one objective, and every link resolves', () => {
    const names = new Set(docs.map((d) => d.name));
    for (const l of links) {
      expect(objectiveTitles.has(l.control_title)).toBe(true);
      expect(names.has(l.component_name)).toBe(true);
    }
    for (const n of names) expect(links.some((l) => l.component_name === n)).toBe(true);
  });
});

describe('the starter impact tables', () => {
  test('six tables, five levels each, in words not figures', () => {
    expect(STARTER_TABLES).toHaveLength(6);
    for (const t of STARTER_TABLES) {
      expect(t.levels).toHaveLength(5);
      // A figure is the organisation's decision: shipping one would be a
      // placeholder that looks like an answer.
      for (const l of t.levels) expect(l).not.toMatch(/[£$€]|\d/);
    }
  });
});
