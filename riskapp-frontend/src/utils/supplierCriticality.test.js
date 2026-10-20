// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { criticalityNarrative, dimensionsAt, listWords } from './supplierCriticality';

const billing = { name: 'Billing and meter reading', impact_c: 4, impact_i: 4, impact_a: 3, impact: 4 };
const saas = { id: 'r1', relationship_type: 'service_provider', status: 'active', max_impact: 4, criticality_systems: [billing] };

describe('where a supplier\'s criticality comes from', () => {
  test('one system: named, with how the supplier reaches it and on which dimensions', () => {
    const n = criticalityNarrative('Super Bill Ltd', [saas]);
    expect(n.level).toBe(4);
    expect(n.reasons[0].text).toBe(
      'It comes from Billing and meter reading, which Super Bill Ltd hosts as a service provider (SaaS). '
      + 'The information there is rated Major (4) for confidentiality and integrity.');
  });

  test('several systems: the first three named with their dimension, the rest counted', () => {
    const sys = (name, c, i, a) => ({ name, impact_c: c, impact_i: i, impact_a: a, impact: 5 });
    const product = { relationship_type: 'product', status: 'active', max_impact: 5, component_name: 'Falcon Agent',
      criticality_systems: [sys('Approach radar', 3, 3, 5), sys('Case Management', 5, 4, 3), sys('Court', 5, 5, 3), sys('Tax', 5, 3, 3)] };
    const n = criticalityNarrative('CrowdStrike', [saas, product]);
    expect(n.level).toBe(5);
    expect(n.reasons).toHaveLength(1);                    // only the relationship at the maximum
    expect(n.reasons[0].text).toBe(
      'It comes from Approach radar (availability), Case Management (confidentiality), Court (confidentiality and integrity) '
      + 'and 1 other system, which run CrowdStrike\'s Falcon Agent. Each holds information rated Severe (5) on the dimension shown.');
  });

  test('ended relationships do not count, as on the list', () => {
    expect(criticalityNarrative('X', [{ ...saas, status: 'ended' }])).toEqual({ level: null, reasons: [] });
  });

  test('two relationships at the same maximum give two reasons', () => {
    const operated = { ...saas, id: 'r2', relationship_type: 'contracted_service' };
    const texts = criticalityNarrative('Acme', [saas, operated]).reasons.map(r => r.text);
    expect(texts[1]).toMatch(/which Acme operates as a contracted-out service/);
  });
});

describe('helpers', () => {
  test('dimensionsAt', () => expect(dimensionsAt(billing, 4)).toEqual(['confidentiality', 'integrity']));
  test('listWords', () => {
    expect(listWords(['a'])).toBe('a');
    expect(listWords(['a', 'b'])).toBe('a and b');
    expect(listWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
