// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { componentStatusLabel, componentStatusOptions, componentTypeLabel, componentTypeShort } from './componentTypes';

describe('component types', () => {
  test('the information type is shown as Policies & documents, stored unchanged', () => {
    expect(componentTypeLabel('information')).toBe('Policies & documents');
    expect(componentTypeShort('information')).toBe('document');
    expect(componentTypeLabel('technology')).toBe('Technology');
  });
});

describe('component status words', () => {
  test('a policy reads published / under review / not published', () => {
    expect(componentStatusLabel('information', 'operational')).toBe('Published');
    expect(componentStatusLabel('information', 'degraded')).toBe('Under review');
    expect(componentStatusLabel('information', 'planned')).toBe('Not published');
    // the per-system reading of "not there" (v_component_presence)
    expect(componentStatusLabel('information', 'missing')).toBe('Not published');
  });

  test('every other type keeps the operational ladder', () => {
    expect(componentStatusLabel('technology', 'operational')).toBe('Operational');
    expect(componentStatusLabel('technology', 'degraded')).toBe('Degraded');
  });

  test('the edit forms offer only states the database accepts', () => {
    const valid = new Set(['operational', 'degraded', 'planned', 'decommissioned', 'unknown']);
    for (const t of ['people', 'process', 'information', 'technology', 'facility']) {
      for (const o of componentStatusOptions(t)) expect(valid.has(o.value)).toBe(true);
    }
    // used to offer 'non_operational', which the component_status enum refuses
    expect(componentStatusOptions('technology').map(o => o.value)).not.toContain('non_operational');
    expect(componentStatusOptions('information').map(o => o.label))
      .toEqual(['Unknown', 'Published', 'Under review', 'Not published']);
  });
});
