// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { CONTROL_ACCESSORS } from './ControlLibraryPage';

const order = (rows, key, dir = 'asc') => sortRows(rows, CONTROL_ACCESSORS[key], dir).map((r) => r.id);

describe('control library sort', () => {
  it('sorts the status by its words', () => {
    const rows = [{ id: 'nd', status: 'not_decided' }, { id: 'ad', status: 'adopted' }, { id: 'na', status: 'not_applicable' }];
    expect(order(rows, 'status')).toEqual(['ad', 'na', 'nd']);
  });

  it('sorts effectiveness by the rating, unrated last either way', () => {
    const rows = [{ id: 'none', effectiveness: null }, { id: 'four', effectiveness: 4 }, { id: 'two', effectiveness: 2 }];
    expect(order(rows, 'effectiveness')).toEqual(['two', 'four', 'none']);
    expect(order(rows, 'effectiveness', 'desc')).toEqual(['four', 'two', 'none']);
  });

  it('sorts applicability as the SoA has it: whole organisation, scopes, not decided, not applicable', () => {
    const rows = [{ id: 'na', applicability: 'not_applicable' }, { id: 'nd', applicability: 'not_decided' },
                  { id: 'org', applicability: 'organisation' }, { id: 'sc', applicability: 'scopes' }];
    expect(order(rows, 'applicability')).toEqual(['org', 'sc', 'nd', 'na']);
  });
});
