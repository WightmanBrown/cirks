// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { SUPPLIER_ACCESSORS } from './SuppliersPage';

const s = (over) => ({ name: 'x', relationship_count: 0, departments: [], max_impact: null, live_count: 1,
  objectives_met: 0, objectives_expired: 0, objectives_missing: 0, ...over });
const order = (rows, key, dir = 'asc') => sortRows(rows, SUPPLIER_ACCESSORS[key], dir).map((r) => r.name);

describe('suppliers sort', () => {
  it('sorts assurance by the percentage met, none expected or no live relationship last', () => {
    const rows = [
      s({ name: 'none expected' }),
      s({ name: 'half', objectives_met: 1, objectives_missing: 1 }),
      s({ name: 'not live', live_count: 0, objectives_met: 5 }),
      s({ name: 'all', objectives_met: 3 }),
      s({ name: 'third', objectives_met: 1, objectives_expired: 2 }),
    ];
    expect(order(rows, 'assurance')).toEqual(['third', 'half', 'all', 'none expected', 'not live']);
    expect(order(rows, 'assurance', 'desc')).toEqual(['all', 'half', 'third', 'none expected', 'not live']);
  });

  it('sorts relationships as numbers and criticality with unrated last', () => {
    expect(order([s({ name: 'ten', relationship_count: '10' }), s({ name: 'two', relationship_count: '2' })], 'relationships'))
      .toEqual(['two', 'ten']);
    expect(order([s({ name: 'none' }), s({ name: 'high', max_impact: 4 }), s({ name: 'low', max_impact: 1 })], 'criticality', 'desc'))
      .toEqual(['high', 'low', 'none']);
  });
});
