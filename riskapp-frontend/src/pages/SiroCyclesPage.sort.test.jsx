// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { SIRO_CYCLE_ACCESSORS } from './SiroCyclesPage';

const order = (rows, key, dir = 'asc') => sortRows(rows, SIRO_CYCLE_ACCESSORS[key], dir).map((r) => r.id);

describe('SIRO cycles sort', () => {
  it('sorts changes by the total the cycle carries', () => {
    const rows = [
      { id: 'few', new_risks: 1, increased_risks: 0, reduced_risks: 0, new_actions: 0, closed_actions: 0 },
      { id: 'many', new_risks: '2', increased_risks: '3', reduced_risks: 1, new_actions: 4, closed_actions: 2 },
      { id: 'none', new_risks: 0, increased_risks: 0, reduced_risks: 0 },
    ];
    expect(order(rows, 'changes', 'desc')).toEqual(['many', 'few', 'none']);
  });

  it('sorts the period by its start date', () => {
    const rows = [{ id: 'q2', start_date: '2026-04-01' }, { id: 'q1', start_date: '2026-01-01' }];
    expect(order(rows, 'period')).toEqual(['q1', 'q2']);
  });
});
