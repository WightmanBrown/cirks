// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { SCOPE_ACCESSORS } from './ScopesPage';

describe('scopes sort', () => {
  it('sorts the counts as numbers', () => {
    const rows = [{ name: 'ten', system_count: '10', objective_count: 1 }, { name: 'two', system_count: '2', objective_count: 5 }];
    expect(sortRows(rows, SCOPE_ACCESSORS.systems).map((r) => r.name)).toEqual(['two', 'ten']);
    expect(sortRows(rows, SCOPE_ACCESSORS.objectives, 'desc').map((r) => r.name)).toEqual(['two', 'ten']);
  });
});
