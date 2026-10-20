// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { SUPPLIER_TYPES, supplierType, supplierTypeLabel, supplierStatusLabel } from './supplierTypes';
import { supplierOwnerText } from '../components/SupplierRelationshipsTable';

describe('supplier types', () => {
  test('the four kinds, each saying what it is recorded against', () => {
    expect(SUPPLIER_TYPES.map(t => t.value)).toEqual(['onshore', 'contracted_service', 'service_provider', 'product']);
    // Mirrors the database's chk_sr_touches.
    expect(supplierType('onshore')).toMatchObject({ system: 'none', componentTypes: ['people'], componentRequired: true });
    expect(supplierType('contracted_service')).toMatchObject({ system: 'required', componentRequired: false });
    expect(supplierType('service_provider')).toMatchObject({ system: 'required', componentTypes: [] });
    expect(supplierType('product')).toMatchObject({ system: 'none', componentTypes: ['technology'] });
  });

  test('labels fall back to the stored value', () => {
    expect(supplierTypeLabel('service_provider')).toBe('Service provider (SaaS)');
    expect(supplierTypeLabel('mystery')).toBe('mystery');
    expect(supplierStatusLabel('exiting')).toBe('Exiting');
  });
});

describe('who is accountable', () => {
  test('names the role — the IAO, or the SIRO when the department has none', () => {
    expect(supplierOwnerText({ owner_names: 'Ann Lee', department_name: 'Finance', owner_is_siro_fallback: false }))
      .toBe('Ann Lee — IAO, Finance');
    expect(supplierOwnerText({ owner_names: 'Sam Roe', department_name: 'Legal', owner_is_siro_fallback: true }))
      .toBe('Sam Roe — SIRO (Legal has no IAO)');
    expect(supplierOwnerText({ owner_names: null })).toBe('—');
  });
});

import { fmtDay } from './supplierTypes';
import { coverageOf, evidenceLabel } from '../components/SupplierAssurance';

describe('assurance wording (v144)', () => {
  test('a DATE is shown as written, never shifted by the local clock', () => {
    expect(fmtDay('2028-01-01')).toBe('1 Jan 2028');
    expect(fmtDay(null)).toBe('—');
  });

  test('each piece of evidence says until when it counts', () => {
    expect(evidenceLabel({ title: 'SOC 2', effective_expiry: '2027-03-31', is_current: true })).toBe('SOC 2 (valid until 31 Mar 2027)');
    expect(evidenceLabel({ title: 'SOC 2 2024', effective_expiry: '2025-03-31', is_current: false })).toBe('SOC 2 2024 (expired 31 Mar 2025)');
    expect(evidenceLabel({ title: 'MSA cl. 14', effective_expiry: null, is_current: true })).toBe('MSA cl. 14 (valid while the contract runs)');
  });

  test('an objective can be covered by several pieces of evidence, current and expired apart', () => {
    const ev = [
      { id: 1, control_ids: ['a', 'b'], is_current: true },
      { id: 2, control_ids: ['b'], is_current: true },
      { id: 3, control_ids: ['c'], is_current: false },
    ];
    expect(coverageOf({ control_id: 'b' }, ev).current.map(e => e.id)).toEqual([1, 2]);
    expect(coverageOf({ control_id: 'c' }, ev)).toMatchObject({ current: [], expired: [{ id: 3 }] });
    expect(coverageOf({ control_id: 'z' }, ev)).toEqual({ current: [], expired: [] });
  });
});
