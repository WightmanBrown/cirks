// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import {
  dominantDimension, currentProb, currentImpact,
  buildCurrentRiskMatrix, filterByCell,
} from './heatmapUtils';

// The retired buildMaxMatrix, kept here only as the counter-example these tests
// guard against: every grid in the app once plotted risks this way.
const maxGridCell = (r) => ({
  p: Math.max(r.prob_c, r.prob_i, r.prob_a),
  i: Math.max(
    r.residual_impact_c ?? r.impact_c,
    r.residual_impact_i ?? r.impact_i,
    r.residual_impact_a ?? r.impact_a
  ),
});

// A risk whose probability peaks on one dimension and impact on another — the
// case that separates the current-risk grid from the old max grid.
const skewed = {
  prob_c: 5, prob_i: 1, prob_a: 1,
  impact_c: 1, impact_i: 5, impact_a: 5,
};

// Straightforward: availability dominates on both axes.
const availDriven = {
  prob_c: 1, prob_i: 2, prob_a: 4,
  impact_c: 2, impact_i: 2, impact_a: 5,
};

describe('dominantDimension', () => {
  test('picks the dimension with the largest probability x impact product', () => {
    expect(dominantDimension(availDriven)).toBe('a');   // 4x5=20 beats 1x2 and 2x2
  });

  test('prefers residual impact over inherent when present', () => {
    const r = { prob_c: 1, prob_i: 5, prob_a: 1, impact_c: 5, impact_i: 1, impact_a: 1, residual_impact_i: 5 };
    expect(dominantDimension(r)).toBe('i');             // 5x5=25 once residual applies
  });

  test('is stable when dimensions tie — first of c,i,a wins', () => {
    const tied = { prob_c: 2, prob_i: 2, prob_a: 2, impact_c: 3, impact_i: 3, impact_a: 3 };
    expect(dominantDimension(tied)).toBe('c');
  });

  test('treats missing values as zero rather than NaN', () => {
    expect(dominantDimension({ prob_a: 3, impact_a: 4 })).toBe('a');
  });
});

describe('current-risk grid', () => {
  test('plots the dominant dimension, not the component-wise maxima', () => {
    // Every dimension scores 5, so the risk belongs in a 5-score cell...
    expect(currentProb(skewed) * currentImpact(skewed)).toBe(5);

    const current = buildCurrentRiskMatrix([skewed]);
    expect(current[5][1]).toBe(1);          // prob 5, impact 1 — a real dimension
    expect(current[5][5]).toBe(0);
  });

  test('never places a risk in a cell scoring above its actual current risk', () => {
    // The retired max grid put this risk at 5x5 = 25 — five times its real
    // score. This is the regression that must not come back.
    const bad = maxGridCell(skewed);
    expect(bad.p * bad.i).toBe(25);
    expect(currentProb(skewed) * currentImpact(skewed)).toBe(5);
  });

  test('matches the component-wise maxima when one dimension dominates both axes', () => {
    const same = maxGridCell(availDriven);
    expect(buildCurrentRiskMatrix([availDriven])[4][5]).toBe(1);
    expect([same.p, same.i]).toEqual([4, 5]);
  });

  test('every risk lands in exactly one cell', () => {
    const risks = [skewed, availDriven, { prob_c: 3, prob_i: 3, prob_a: 3, impact_c: 3, impact_i: 3, impact_a: 3 }];
    const m = buildCurrentRiskMatrix(risks);
    const total = Object.values(m).reduce(
      (sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0);
    expect(total).toBe(risks.length);
  });
});

describe('cell filtering matches the grid it was clicked on', () => {
  test('filterByCell with the current-risk accessors selects the plotted risk', () => {
    const risks = [skewed, availDriven];
    expect(filterByCell(risks, 5, 1, currentProb, currentImpact)).toEqual([skewed]);
    expect(filterByCell(risks, 4, 5, currentProb, currentImpact)).toEqual([availDriven]);
    expect(filterByCell(risks, 5, 5, currentProb, currentImpact)).toEqual([]);
  });
});
