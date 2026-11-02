'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// lib/cirksDelivers.js: the objectives CIRKS itself can deliver. A mistyped code
// would never match and the suggestion would silently never appear, so every code
// is checked against the catalogue CIRKS loads: the CIRKS objectives, and NIST CSF
// 2.0 for an install whose library is still NIST.

const fs = require('fs');
const path = require('path');
const { CIRKS_DELIVERS, NIST_DELIVERS, cirksReasonFor } = require('../lib/cirksDelivers');
const { readObjectives } = require('../../db/seed/cirksObjectives');

const nist = new Set(fs.readFileSync(
  path.join(__dirname, '..', '..', 'seed-data', 'standards', 'nist_csf_2.0_reference.csv'), 'utf8')
  .split(/\r?\n/).map((l) => l.split(',')[0]).filter((c) => /^[A-Z]{2}\.[A-Z]{2}-\d{2}$/.test(c)));
const cirks = new Set(readObjectives().map((o) => o.ref));

describe('CIRKS as a security solution: what it can deliver', () => {
  test('both catalogues were read', () => {
    expect(nist.size).toBe(106);
    expect(cirks.size).toBe(156);
  });

  test.each(Object.keys(CIRKS_DELIVERS))('%s is a CIRKS objective, with a reason', (ref) => {
    expect(cirks.has(ref)).toBe(true);
    expect(CIRKS_DELIVERS[ref].length).toBeGreaterThan(40);
  });

  test.each(Object.keys(NIST_DELIVERS))('%s is a NIST CSF 2.0 subcategory, with a reason', (ref) => {
    expect(nist.has(ref)).toBe(true);
    expect(NIST_DELIVERS[ref].length).toBeGreaterThan(40);
  });

  test('a CIRKS objective is matched by its own reference', () => {
    expect(cirksReasonFor([], 'CIRKS1.IRM-08')).toEqual({ ref: 'CIRKS1.IRM-08', reason: CIRKS_DELIVERS['CIRKS1.IRM-08'] });
  });

  test('a CIRKS objective never falls back to its NIST mapping', () => {
    // CVM-03 Configuration change control maps to ID.RA-07, which CIRKS meets on
    // a NIST library (exceptions); CIRKS does not control configuration change.
    expect(cirksReasonFor([{ standard: 'nist_csf', ref: 'ID.RA-07' }], 'CIRKS1.CVM-03')).toBeNull();
  });

  test('an objective with no CIRKS reference matches by its NIST CSF mapping only', () => {
    expect(cirksReasonFor([{ standard: 'iso27001', ref: 'GV.SC-04' }])).toBeNull();
    expect(cirksReasonFor([{ standard: 'iso27001', ref: 'A.5.19' }, { standard: 'nist_csf', ref: 'GV.SC-04' }]))
      .toEqual({ ref: 'GV.SC-04', reason: NIST_DELIVERS['GV.SC-04'] });
    expect(cirksReasonFor([{ standard: 'nist_csf', ref: 'PR.DS-01' }])).toBeNull();
    expect(cirksReasonFor(null)).toBeNull();
    // An organisation's own reference that is not a shipped one is not a CIRKS objective.
    expect(cirksReasonFor([{ standard: 'nist_csf', ref: 'GV.SC-04' }], 'CIRKS.OT.T-01'))
      .toEqual({ ref: 'GV.SC-04', reason: NIST_DELIVERS['GV.SC-04'] });
  });
});
