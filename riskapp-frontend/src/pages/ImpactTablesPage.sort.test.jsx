// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { IMPACT_TABLE_ACCESSORS } from './ImpactTablesPage';

const t = (over) => ({ name: 'x', scope: 'department', published_at: null, mandatory: false, is_reputational: false, ...over });
const order = (rows, key, dir = 'asc') => sortRows(rows, IMPACT_TABLE_ACCESSORS[key], dir).map((r) => r.name);

describe('impact tables sort', () => {
  it('sorts status by the word shown, not the publication date', () => {
    const rows = [t({ name: 'pub', published_at: '2026-01-01' }), t({ name: 'draft' })];
    expect(order(rows, 'status')).toEqual(['draft', 'pub']);
  });

  it('puts tables with no attributes last, whichever way', () => {
    const rows = [t({ name: 'plain' }), t({ name: 'rep', is_reputational: true }), t({ name: 'man', mandatory: true })];
    expect(order(rows, 'attributes')).toEqual(['man', 'rep', 'plain']);
    expect(order(rows, 'attributes', 'desc')).toEqual(['rep', 'man', 'plain']);
  });
});
