// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { EXCEPTION_ACCESSORS } from './SecurityExceptionsPage';

const order = (rows, key, dir = 'asc') => sortRows(rows, EXCEPTION_ACCESSORS[key], dir).map((r) => r.id);

describe('security exceptions sort', () => {
  it('sorts the level by its score, so critical comes above low', () => {
    const rows = [{ id: 'low', risk_score: 3 }, { id: 'crit', risk_score: 20 }, { id: 'mid', risk_score: 8 }];
    expect(order(rows, 'level', 'desc')).toEqual(['crit', 'mid', 'low']);
  });

  it('sorts days as numbers, overdue first, and the cadence by its words', () => {
    const rows = [{ id: 'ten', days_until_expiry: 10 }, { id: 'late', days_until_expiry: -5 }, { id: 'two', days_until_expiry: 2 }];
    expect(order(rows, 'days')).toEqual(['late', 'two', 'ten']);
    const cad = [{ id: 'q', review_cadence: 'quarterly' }, { id: 'a', review_cadence: 'annual' }, { id: 'm', review_cadence: 'monthly' }];
    expect(order(cad, 'cadence')).toEqual(['a', 'm', 'q']);
  });

  it('puts an exception with no accepting person last', () => {
    const rows = [{ id: 'none', accepted_by_name: null }, { id: 'b', accepted_by_name: 'Bea' }, { id: 'a', accepted_by_name: 'Ann' }];
    expect(order(rows, 'acceptedBy', 'desc')).toEqual(['b', 'a', 'none']);
  });
});
