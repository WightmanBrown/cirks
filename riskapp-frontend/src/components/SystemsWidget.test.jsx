// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The dashboard told an IAM she had 19 systems. Her department owned 4 and held
// information in 5 more; the other 10 were shared systems she had no stake in.
// The widget filtered on `own dept OR is_shared`, so every shared system in the
// estate landed on every IAM's dashboard.

import { describe, test, expect } from 'vitest';
import { scopeToRemit } from './SystemsWidget';

const IAM = { role: 'information_asset_manager', department_id: 'health' };

const sys = (over) => ({ id: 'x', department_id: 'other', is_shared: false, viewer_asset_count: 0, ...over });

describe('scopeToRemit', () => {
  test('includes systems the department owns, even with no information in them', () => {
    const rows = [sys({ id: 'own', department_id: 'health' })];
    expect(scopeToRemit(rows, IAM).map(s => s.id)).toEqual(['own']);
  });

  test('includes a shared system the department holds information in', () => {
    const rows = [sys({ id: 'mignet', is_shared: true, viewer_asset_count: 5 })];
    expect(scopeToRemit(rows, IAM).map(s => s.id)).toEqual(['mignet']);
  });

  test('EXCLUDES a shared system the department holds nothing in — the bug', () => {
    const rows = [sys({ id: 'someone-elses', is_shared: true, viewer_asset_count: 0 })];
    expect(scopeToRemit(rows, IAM)).toEqual([]);
  });

  test('the reported case: 4 owned + 5 with a stake + 10 empty shared → 9', () => {
    const rows = [
      ...Array.from({ length: 4 },  (_, i) => sys({ id: `own${i}`,    department_id: 'health' })),
      ...Array.from({ length: 5 },  (_, i) => sys({ id: `stake${i}`,  is_shared: true, viewer_asset_count: 2 })),
      ...Array.from({ length: 10 }, (_, i) => sys({ id: `empty${i}`,  is_shared: true })),
    ];
    expect(scopeToRemit(rows, IAM)).toHaveLength(9);
  });

  test('roles that are not department-scoped see everything unchanged', () => {
    const rows = [sys({ id: 'a' }), sys({ id: 'b', is_shared: true })];
    expect(scopeToRemit(rows, { role: 'ciso', department_id: 'health' })).toHaveLength(2);
  });

  test('a user with no department is not filtered into an empty dashboard', () => {
    const rows = [sys({ id: 'a' })];
    expect(scopeToRemit(rows, { role: 'information_asset_manager' })).toHaveLength(1);
  });
});
