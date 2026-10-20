// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { GROUPS } from './DataExportPage';

describe('DataExportPage GROUPS', () => {
  const keys = GROUPS.flatMap((g) => g.datasets.map((d) => d.key));

  test('exposes the ten expected groups', () => {
    expect(GROUPS.map((g) => g.title)).toEqual([
      'Account management', 'Threats & controls', 'PPITF components',
      'Information assets', 'Systems', 'Business services', 'Impact tables',
      'Statement of Applicability', 'Suppliers', 'Access control',
    ]);
  });

  test('dataset keys match the backend export endpoint slugs exactly', () => {
    expect(new Set(keys)).toEqual(new Set([
      'users', 'user-roles', 'departments',
      'threats', 'controls', 'control-threats', 'control-component-links',
      'delivery-patterns', 'delivery-pattern-objectives', 'delivery-pattern-parts',
      'architecture-rules', 'membership-groups', 'system-builds', 'solution-choices',
      'components', 'component-ip-addresses',
      'information-assets', 'asset-impact-ratings',
      'systems', 'system-assets', 'system-components', 'system-threats', 'system-controls',
      'business-services', 'business-service-systems',
      'impact-tables', 'impact-table-bil-levels', 'impact-table-cia-levels',
      'soa-entries', 'scopes', 'scope-systems', 'soa-entry-scopes',
      'suppliers', 'supplier-relationships', 'supplier-type-objectives', 'supplier-evidence',
      'role-permissions', 'sod-rules', 'access-settings', 'capabilities',
    ]));
  });

  test('every dataset has a label and description, keys are unique', () => {
    for (const g of GROUPS) {
      for (const d of g.datasets) {
        expect(d.label).toBeTruthy();
        expect(d.desc).toBeTruthy();
      }
    }
    expect(keys.length).toBe(new Set(keys).size);
  });
});
