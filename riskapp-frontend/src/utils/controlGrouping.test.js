// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import {
  classifyControl, groupControls, componentGaps,
  OPERATIONAL, IMPAIRED, MISSING, EXCLUDED,
} from './controlGrouping';

const ctl = (o = {}) => ({ id: 'c1', on_system: true, system_status: 'operational', components: [], ...o });
const cmp = (o = {}) => ({ id: 'x', on_system: true, system_status: 'operational', ...o });

describe('classifyControl', () => {
  it('is operational only when it is working AND its components are all here', () => {
    expect(classifyControl(ctl({ components: [cmp()] })).group).toBe(OPERATIONAL);
  });

  // The stricter half of the definition, and the one that moves the most rows:
  // 462 control rows on CIRKS-test are marked operational with a component gap.
  it('is IMPAIRED when marked operational but a component is absent', () => {
    const r = classifyControl(ctl({ components: [cmp({ on_system: false })] }));
    expect(r.group).toBe(IMPAIRED);
    expect(r.reason).toBe('components');
  });

  it('is IMPAIRED when a component is present but not working', () => {
    expect(classifyControl(ctl({ components: [cmp({ system_status: 'degraded' })] })).reason)
      .toBe('components');
  });

  // v128: delivered once, so its components are not tracked system by system.
  it('does not count per-system component gaps for a control delivered organisation-wide or for a group', () => {
    for (const delivery of ['organisation', 'group']) {
      const c = ctl({ delivery, components: [cmp({ on_system: false })] });
      expect(componentGaps(c)).toEqual([]);
      expect(classifyControl(c).group).toBe(OPERATIONAL);
    }
    expect(classifyControl(ctl({ delivery: 'system', components: [cmp({ on_system: false })] })).group)
      .toBe(IMPAIRED);
  });

  it('is IMPAIRED when the control itself is degraded', () => {
    expect(classifyControl(ctl({ system_status: 'degraded' })).reason).toBe('degraded');
  });

  // Two different faults needing different work; the reason keeps them apart.
  it('distinguishes degraded-and-incomplete from either alone', () => {
    expect(classifyControl(ctl({
      system_status: 'degraded', components: [cmp({ on_system: false })],
    })).reason).toBe('degraded_and_components');
  });

  it.each(['missing', 'unknown', null])('is MISSING when the status is %s', (system_status) => {
    expect(classifyControl(ctl({ system_status })).group).toBe(MISSING);
  });

  it('is MISSING when not on the system at all', () => {
    expect(classifyControl(ctl({ on_system: false })).group).toBe(MISSING);
  });

  // An exclusion is a decision, not a gap (0118) — it belongs in neither the
  // protection list nor the work list.
  it('keeps an excluded control out of all three working groups', () => {
    expect(classifyControl(ctl({ system_status: 'not_applicable' })).group).toBe(EXCLUDED);
  });
});

describe('componentGaps', () => {
  it('names only the components that are absent or not working', () => {
    const c = ctl({ components: [
      cmp({ id: 'ok' }), cmp({ id: 'gone', on_system: false }),
      cmp({ id: 'bad', system_status: 'missing' }),
    ] });
    expect(componentGaps(c).map(x => x.id)).toEqual(['gone', 'bad']);
  });

  it('is empty for a control with no components recorded', () => {
    expect(componentGaps(ctl())).toEqual([]);
    expect(componentGaps(null)).toEqual([]);
  });
});

describe('groupControls', () => {
  it('sorts every control into exactly one section', () => {
    const g = groupControls([
      ctl({ id: 'a' }),
      ctl({ id: 'b', system_status: 'degraded' }),
      ctl({ id: 'c', on_system: false }),
      ctl({ id: 'd', system_status: 'not_applicable' }),
    ]);
    expect(g[OPERATIONAL].map(c => c.id)).toEqual(['a']);
    expect(g[IMPAIRED].map(c => c.id)).toEqual(['b']);
    expect(g[MISSING].map(c => c.id)).toEqual(['c']);
    expect(g[EXCLUDED].map(c => c.id)).toEqual(['d']);
  });

  it('handles an empty panel', () => {
    const g = groupControls([]);
    expect(Object.values(g).every(a => a.length === 0)).toBe(true);
  });
});
