// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { byMaxRiskThenMeanCiaThenName } from './assetSort';
import { byMaxRiskDescThenName } from './systemSort';
import { byMaxRiskThenMeanEffectiveCiaThenName } from './serviceSort';

// The unfold pattern relies on the widget preview and the full list page sorting
// identically, so a clicked row lands in the same position. These comparators are
// that shared contract — pin the ordering rules.
//
// Sorting is on max_risk_score (1–25); the frontend derives the band for display.

function sorted(arr, cmp) {
  return [...arr].sort(cmp).map(x => x.name);
}

describe('assetSort: max risk → mean CIA → name', () => {
  test('orders by risk score first', () => {
    const assets = [
      { name: 'low', max_risk_score: 3 },
      { name: 'crit', max_risk_score: 22 },
      { name: 'med', max_risk_score: 8 },
      { name: 'none', max_risk_score: null },
    ];
    expect(sorted(assets, byMaxRiskThenMeanCiaThenName)).toEqual(['crit', 'med', 'low', 'none']);
  });

  test('mean CIA breaks risk ties, higher first', () => {
    const assets = [
      { name: 'lowCia',  max_risk_score: 15, confidentiality: 1, integrity: 1, availability: 1 },
      { name: 'highCia', max_risk_score: 15, confidentiality: 5, integrity: 5, availability: 5 },
    ];
    expect(sorted(assets, byMaxRiskThenMeanCiaThenName)).toEqual(['highCia', 'lowCia']);
  });

  test('name breaks remaining ties, case-insensitive', () => {
    const assets = [
      { name: 'beta',  max_risk_score: 15, confidentiality: 3 },
      { name: 'Alpha', max_risk_score: 15, confidentiality: 3 },
    ];
    expect(sorted(assets, byMaxRiskThenMeanCiaThenName)).toEqual(['Alpha', 'beta']);
  });

  test('null CIA values are ignored in the mean (not treated as 0)', () => {
    const assets = [
      { name: 'partial', max_risk_score: 15, confidentiality: 5, integrity: null, availability: null }, // mean 5
      { name: 'full',    max_risk_score: 15, confidentiality: 4, integrity: 4,    availability: 4 },     // mean 4
    ];
    expect(sorted(assets, byMaxRiskThenMeanCiaThenName)).toEqual(['partial', 'full']);
  });
});

describe('systemSort: max risk → name', () => {
  test('orders by risk then name', () => {
    const systems = [
      { name: 'b', max_risk_score: 15 },
      { name: 'a', max_risk_score: 15 },
      { name: 'c', max_risk_score: 22 },
    ];
    expect(sorted(systems, byMaxRiskDescThenName)).toEqual(['c', 'a', 'b']);
  });
});

describe('serviceSort: max risk → mean effective CIA → name', () => {
  test('effective CIA breaks risk ties', () => {
    const services = [
      { name: 'low',  max_risk_score: 8, effective_c: 1, effective_i: 1, effective_a: 1 },
      { name: 'high', max_risk_score: 8, effective_c: 5, effective_i: 5, effective_a: 5 },
    ];
    expect(sorted(services, byMaxRiskThenMeanEffectiveCiaThenName)).toEqual(['high', 'low']);
  });
});
