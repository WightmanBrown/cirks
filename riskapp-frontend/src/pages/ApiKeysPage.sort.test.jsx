// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { API_KEY_ACCESSORS } from './ApiKeysPage';

const k = (over) => ({ label: 'x', revoked_at: null, expires_at: null, last_used_at: null, ...over });
const order = (rows, key, dir = 'asc') => sortRows(rows, API_KEY_ACCESSORS[key], dir).map((r) => r.label);

describe('API keys sort', () => {
  it('sorts status by the word shown', () => {
    const rows = [k({ label: 'live' }), k({ label: 'gone', revoked_at: '2026-01-01T00:00:00Z' }), k({ label: 'old', expires_at: '2020-01-01T00:00:00Z' })];
    expect(order(rows, 'status')).toEqual(['live', 'old', 'gone']);
  });

  it('puts a key never used last, whichever way', () => {
    const rows = [k({ label: 'never' }), k({ label: 'new', last_used_at: '2026-11-02T10:00:00Z' }), k({ label: 'early', last_used_at: '2026-01-02T10:00:00Z' })];
    expect(order(rows, 'last_used')).toEqual(['early', 'new', 'never']);
    expect(order(rows, 'last_used', 'desc')).toEqual(['new', 'early', 'never']);
  });
});
