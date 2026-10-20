// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { explainImplementation, partialQualifier } from './implementationStatus';

const derived = (o) => ({ implementation_source: 'derived', threat_systems: 9, threat_systems_present: 7,
  present_systems: 8, degraded_systems: 4, expected_systems: 51, expected_systems_present: 8, work_planned: false,
  partial_reasons: ['coverage', 'health'], implementation_status: 'partial', ...o });

describe('partialQualifier', () => {
  it('says which incompleteness made it partial', () => {
    expect(partialQualifier(derived())).toBe('on 7 of 9 at risk · degraded on 4 systems');
    expect(partialQualifier(derived({ partial_reasons: ['health'], degraded_systems: 1 }))).toBe('degraded on 1 system');
  });
  it('is silent for a stated status or anything but partial', () => {
    expect(partialQualifier(derived({ implementation_source: 'stated' }))).toBeNull();
    expect(partialQualifier(derived({ implementation_status: 'implemented' }))).toBeNull();
  });
});

describe('explainImplementation', () => {
  it('names at-risk systems whose state was never recorded apart from the missing ones', () => {
    expect(explainImplementation(derived({ threat_systems_unknown: 2 })).join(' '))
      .toMatch(/not recorded on 2 systems — check those/);
  });

  it('labels an implemented control as implemented for the risks we have identified', () => {
    const s = explainImplementation(derived({ implementation_status: 'implemented', threat_systems_present: 9,
      degraded_systems: 0, partial_reasons: [] })).join(' ');
    expect(s).toMatch(/for the risks we have identified: in place on 9 of 9 systems/);
    expect(s).toMatch(/Coverage where it applies: on 8 of 51 systems/);
  });
  it('explains a planned control', () => {
    const s = explainImplementation(derived({ implementation_status: 'planned', present_systems: 0, work_planned: true })).join(' ');
    expect(s).toMatch(/not operational on any system/);
    expect(s).toMatch(/security action is planned/);
  });
  it('says a stated status is stated, and asks for the mode when it is not stated', () => {
    expect(explainImplementation({ implementation_source: 'stated', delivery_not_stated: true })[0]).toMatch(/say so and CIRKS will derive/);
    expect(explainImplementation({ implementation_source: 'stated', delivery_not_stated: false })[0]).toMatch(/delivered once/);
  });
});
