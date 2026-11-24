// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { THREAT_ACCESSORS } from './ThreatsPage';

// The threat catalogue's column sort (owner, 2026-11-23).
const t = (over) => ({ name: 'x', threat_category: 'deliberate', source: 'external', reference_code: null,
  probability_c: 1, probability_i: 1, probability_a: 1, usage_count: 0, ...over });
const order = (rows, key, dir = 'asc') => sortRows(rows, THREAT_ACCESSORS[key], dir).map((r) => r.name);

describe('threat catalogue sort', () => {
  it('sorts by the highest of C, I and A, the figure business view shows', () => {
    const rows = [t({ name: 'low', probability_c: 2 }), t({ name: 'high', probability_a: 5 }), t({ name: 'mid', probability_i: 3 })];
    expect(order(rows, 'likelihood', 'desc')).toEqual(['high', 'mid', 'low']);
  });

  it('sorts active risks as numbers, and the category by its words', () => {
    const rows = [t({ name: 'ten', usage_count: '10' }), t({ name: 'two', usage_count: '2' })];
    expect(order(rows, 'risks')).toEqual(['two', 'ten']);
    const cats = [t({ name: 'env', threat_category: 'environmental' }), t({ name: 'acc', threat_category: 'accidental' })];
    expect(order(cats, 'category')).toEqual(['acc', 'env']);
  });

  it('puts a threat with no reference code last, whichever way', () => {
    const rows = [t({ name: 'none' }), t({ name: 'b', reference_code: 'T-2' }), t({ name: 'a', reference_code: 'T-1' })];
    expect(order(rows, 'ref')).toEqual(['a', 'b', 'none']);
    expect(order(rows, 'ref', 'desc')).toEqual(['b', 'a', 'none']);
  });
});
