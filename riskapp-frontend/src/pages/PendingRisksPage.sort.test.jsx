// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { PENDING_RISK_ACCESSORS } from './PendingRisksPage';

const order = (rows, key, dir = 'asc') => sortRows(rows, PENDING_RISK_ACCESSORS[key], dir).map((r) => r.id);

describe('pending risks sort', () => {
  it('sorts the asset column by asset, then system', () => {
    const rows = [
      { id: 'b', asset_name: 'Payroll', system_name: 'SAP' },
      { id: 'a', asset_name: 'Payroll', system_name: 'Oracle' },
      { id: 'c', asset_name: 'Contracts', system_name: 'SAP' },
    ];
    expect(order(rows, 'asset')).toEqual(['c', 'a', 'b']);
  });

  it('puts a risk with no identified date last', () => {
    const rows = [{ id: 'none', identified_at: null }, { id: 'new', identified_at: '2026-10-01' }, { id: 'old', identified_at: '2026-01-01' }];
    expect(order(rows, 'identified', 'desc')).toEqual(['new', 'old', 'none']);
  });
});
