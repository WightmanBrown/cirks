'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// lib/cirksDelivers.js: the objectives CIRKS itself can deliver. A mistyped code
// would never match and the suggestion would silently never appear, so every code
// is checked against the NIST CSF 2.0 catalogue CIRKS loads.

const fs = require('fs');
const path = require('path');
const { CIRKS_DELIVERS, cirksReasonFor } = require('../lib/cirksDelivers');

const catalogue = new Set(fs.readFileSync(
  path.join(__dirname, '..', '..', 'seed-data', 'standards', 'nist_csf_2.0_reference.csv'), 'utf8')
  .split(/\r?\n/).map((l) => l.split(',')[0]).filter((c) => /^[A-Z]{2}\.[A-Z]{2}-\d{2}$/.test(c)));

describe('CIRKS as a security solution: what it can deliver', () => {
  test('the catalogue was read', () => {
    expect(catalogue.size).toBe(106);
  });

  test.each(Object.keys(CIRKS_DELIVERS))('%s is a NIST CSF 2.0 subcategory, with a reason', (ref) => {
    expect(catalogue.has(ref)).toBe(true);
    expect(CIRKS_DELIVERS[ref].length).toBeGreaterThan(40);
  });

  test('matches only the NIST CSF mapping of an objective', () => {
    expect(cirksReasonFor([{ standard: 'iso27001', ref: 'GV.SC-04' }])).toBeNull();
    expect(cirksReasonFor([{ standard: 'iso27001', ref: 'A.5.19' }, { standard: 'nist_csf', ref: 'GV.SC-04' }]))
      .toEqual({ ref: 'GV.SC-04', reason: CIRKS_DELIVERS['GV.SC-04'] });
    expect(cirksReasonFor([{ standard: 'nist_csf', ref: 'PR.DS-01' }])).toBeNull();
    expect(cirksReasonFor(null)).toBeNull();
  });
});
