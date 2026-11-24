// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { ACTION_ACCESSORS } from './ActionsPage';

const a = (over) => ({ title: 'x', status: 'planned', is_overdue: false, item_count: 0, items_done: 0, ...over });
const order = (rows, key, dir = 'asc') => sortRows(rows, ACTION_ACCESSORS[key], dir).map((r) => r.title);

describe('security actions sort', () => {
  it('sorts status by the word shown, an overdue action reading "overdue"', () => {
    const rows = [a({ title: 'plan' }), a({ title: 'late', status: 'in_progress', is_overdue: true }), a({ title: 'prog', status: 'in_progress' })];
    expect(order(rows, 'status')).toEqual(['prog', 'late', 'plan']);
  });

  it('sorts items by how far through they are, actions with none last', () => {
    const rows = [a({ title: 'none' }), a({ title: 'half', item_count: '4', items_done: 2 }), a({ title: 'one', item_count: 10, items_done: 1 })];
    expect(order(rows, 'items')).toEqual(['one', 'half', 'none']);
    expect(order(rows, 'items', 'desc')).toEqual(['half', 'one', 'none']);
  });
});
