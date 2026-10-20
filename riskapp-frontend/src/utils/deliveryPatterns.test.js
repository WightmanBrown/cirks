// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { deliverySentence, partWhere, deliveryLabel } from './deliveryPatterns';

describe('delivery pattern wording', () => {
  test('each delivery state says what it means', () => {
    expect(deliverySentence({ delivery: 'complete', pattern_name: 'CrowdStrike EDR' })).toBe('Delivered by CrowdStrike EDR');
    expect(deliverySentence({ delivery: 'degraded', pattern_name: 'CrowdStrike EDR', degraded_parts: ['SOC'] }))
      .toBe('Delivered by CrowdStrike EDR, but degraded: SOC');
    expect(deliverySentence({ delivery: 'incomplete', pattern_name: 'Veeam backup', missing_parts: ['Veeam agent'] }))
      .toBe('Veeam backup is not complete — missing: Veeam agent');
    expect(deliverySentence({ delivery: 'no_pattern_in_place' })).toBe('No security solution is in place here');
    expect(deliverySentence({ delivery: null })).toBeNull();
    expect(deliverySentence({ delivery: 'incomplete', pattern_kind: 'supplier', pattern_name: 'By the supplier' }))
      .toBe('Delivered by the supplier, but no current evidence from them covers it');
    expect(deliveryLabel('no_pattern_in_place')).toBe('No security solution in place');
  });
  test('each part says where it must be', () => {
    expect(partWhere({ location: 'on_system' })).toBe('on the system');
    expect(partWhere({ location: 'service', service_system_name: 'Host Intrusion Detection System' })).toBe('on Host Intrusion Detection System');
    expect(partWhere({ location: 'organisation' })).toBe('once for the organisation');
  });
});
