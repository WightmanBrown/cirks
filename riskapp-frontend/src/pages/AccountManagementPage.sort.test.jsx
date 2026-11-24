// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { ACCOUNT_ACCESSORS } from './AccountManagementPage';

const order = (rows, key, dir = 'asc') => sortRows(rows, ACCOUNT_ACCESSORS[key], dir).map((r) => r.id);

describe('accounts sort', () => {
  it('sorts the role by the words shown', () => {
    const rows = [{ id: 's', role: 'siro' }, { id: 'a', role: 'admin' }, { id: 'i', role: 'information_asset_owner' }];
    expect(order(rows, 'role')).toEqual(['a', 'i', 's']);
  });

  it('sorts active and credentials by words, locked accounts together', () => {
    expect(order([{ id: 'off', is_active: false }, { id: 'on', is_active: true }], 'active')).toEqual(['on', 'off']);
    const rows = [{ id: 'locked', password_set: false }, { id: '2fa', password_set: true, totp_enabled: true }, { id: 'pw', password_set: true }];
    expect(order(rows, 'credentials')).toEqual(['2fa', 'pw', 'locked']);
  });

  it('puts an account with no department last', () => {
    const rows = [{ id: 'none', department_name: null }, { id: 'f', department_name: 'Finance' }];
    expect(order(rows, 'department', 'desc')).toEqual(['f', 'none']);
  });
});
