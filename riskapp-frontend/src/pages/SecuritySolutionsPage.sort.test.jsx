// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { SOLUTION_ACCESSORS } from './SecuritySolutionsPage';

const sol = (name, slots, state = 'incomplete') => ({ name, objectives: [], systems_in_place: 0, pattern_fit: { state, slots } });
const order = (rows, key, dir = 'asc') => sortRows(rows, SOLUTION_ACCESSORS[key], dir).map((r) => r.name);

describe('security solutions sort', () => {
  it('sorts against its pattern by the shortfall: complete, degraded, missing; no pattern last', () => {
    const rows = [
      sol('two missing', [{ state: 'missing' }, { state: 'not_in_place' }]),
      sol('none', [], 'no_pattern'),
      sol('degraded', [{ state: 'degraded' }, { state: 'complete' }], 'degraded'),
      sol('supplier', [], 'per_supplier'),
      sol('complete', [{ state: 'complete' }, { state: 'not_needed' }], 'complete'),
      sol('one missing', [{ state: 'missing' }]),
    ];
    expect(order(rows, 'fit')).toEqual(['complete', 'degraded', 'one missing', 'two missing', 'none', 'supplier']);
  });

  it('sorts what it delivers by the number of objectives', () => {
    const rows = [{ name: 'a', objectives: [1, 2, 3] }, { name: 'b', objectives: [1] }];
    expect(order(rows, 'delivers')).toEqual(['b', 'a']);
  });
});
