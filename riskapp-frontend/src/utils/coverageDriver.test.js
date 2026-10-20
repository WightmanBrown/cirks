// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import {
  effectiveContribution, coverageDrivers, driverDims, isDeployed, penalisedDims,
} from './coverageDriver';

const INHERENT = { c: 4, i: 4, a: 4 };
const ctl = (id, status, p) => ({
  id, system_status: status,
  probability_c: p.c, probability_i: p.i, probability_a: p.a,
});

describe('effectiveContribution', () => {
  it('is the judged score for an operational control', () => {
    expect(effectiveContribution(ctl('x', 'operational', { c: 2, i: 2, a: 2 }), INHERENT))
      .toEqual({ c: 2, i: 2, a: 2 });
  });

  it('adds a rung for a degraded control', () => {
    expect(effectiveContribution(ctl('x', 'degraded', { c: 2, i: 3, a: 1 }), INHERENT))
      .toEqual({ c: 3, i: 4, a: 2 });
  });

  it('never exceeds the threat inherent', () => {
    expect(effectiveContribution(ctl('x', 'degraded', { c: 4, i: 4, a: 4 }), INHERENT))
      .toEqual({ c: 4, i: 4, a: 4 });
  });

  it.each(['missing', 'unknown', undefined])('is null when the control is %s', (status) => {
    expect(effectiveContribution(ctl('x', status, { c: 1, i: 1, a: 1 }), INHERENT)).toBeNull();
    expect(isDeployed(ctl('x', status, { c: 1, i: 1, a: 1 }))).toBe(false);
  });
});

describe('coverageDrivers', () => {
  // The behaviour that looks like a bug and is not: one control sets the number.
  it('names the single best control as the driver', () => {
    const controls = [
      ctl('best', 'operational', { c: 1, i: 1, a: 1 }),
      ctl('mid',  'operational', { c: 3, i: 3, a: 3 }),
      ctl('weak', 'operational', { c: 4, i: 4, a: 4 }),
    ];
    const d = coverageDrivers(controls, INHERENT);
    expect(d.floor).toEqual({ c: 1, i: 1, a: 1 });
    expect([...d.driverIds]).toEqual(['best']);
    expect(d.deployedCount).toBe(3);
  });

  it('can have a different driver per dimension', () => {
    const controls = [
      ctl('confidentiality', 'operational', { c: 1, i: 4, a: 4 }),
      ctl('availability',    'operational', { c: 4, i: 4, a: 2 }),
    ];
    const d = coverageDrivers(controls, INHERENT);
    expect(d.floor).toEqual({ c: 1, i: 4, a: 2 });
    // Each owns a different dimension outright, and they TIE on I at 4 — so both
    // are named there. A tie is real information: two controls equally weak.
    expect(driverDims('confidentiality', d.byDim)).toEqual(['c', 'i']);
    expect(driverDims('availability', d.byDim)).toEqual(['i', 'a']);
    expect(d.byDim.i.sort()).toEqual(['availability', 'confidentiality']);
  });

  it('a degraded control loses the floor to an operational one it would otherwise beat', () => {
    const controls = [
      ctl('degraded', 'degraded',    { c: 1, i: 1, a: 1 }),  // effective 2/2/2
      ctl('working',  'operational', { c: 2, i: 2, a: 2 }),
    ];
    const d = coverageDrivers(controls, INHERENT);
    expect(d.floor).toEqual({ c: 2, i: 2, a: 2 });
    // A tie: both contribute 2, so both are shown as setting it.
    expect([...d.driverIds].sort()).toEqual(['degraded', 'working']);
  });

  it('not-deployed controls never drive, however good their target score', () => {
    const controls = [
      ctl('target', 'missing',     { c: 1, i: 1, a: 1 }),
      ctl('real',   'operational', { c: 3, i: 3, a: 3 }),
    ];
    const d = coverageDrivers(controls, INHERENT);
    expect(d.floor).toEqual({ c: 3, i: 3, a: 3 });
    expect([...d.driverIds]).toEqual(['real']);
  });

  it('falls back to the threat inherent when nothing is deployed', () => {
    const d = coverageDrivers([ctl('gap', 'missing', { c: 1, i: 1, a: 1 })], INHERENT);
    expect(d.floor).toEqual(INHERENT);
    expect(d.driverIds.size).toBe(0);
    expect(d.deployedCount).toBe(0);
  });

  it('handles an empty control list', () => {
    const d = coverageDrivers([], INHERENT);
    expect(d.floor).toEqual(INHERENT);
    expect(d.driverIds.size).toBe(0);
  });
});

describe('penalisedDims', () => {
  // The confusion this flags: the row shows 2, the register computes from 3.
  it('names every dimension where a degraded control counts worse than its score', () => {
    expect(penalisedDims(ctl('x', 'degraded', { c: 2, i: 1, a: 3 }), INHERENT)).toEqual([
      { dim: 'c', scored: 2, counts: 3 },
      { dim: 'i', scored: 1, counts: 2 },
      { dim: 'a', scored: 3, counts: 4 },
    ]);
  });

  it('is empty where the penalty is absorbed by the cap at the inherent', () => {
    // Scored at the inherent already: one rung worse is still the inherent, so
    // nothing differs and there is nothing to flag.
    expect(penalisedDims(ctl('x', 'degraded', { c: 4, i: 4, a: 4 }), INHERENT)).toEqual([]);
  });

  it('flags only the dimensions that actually move', () => {
    expect(penalisedDims(ctl('x', 'degraded', { c: 1, i: 4, a: 4 }), INHERENT))
      .toEqual([{ dim: 'c', scored: 1, counts: 2 }]);
  });

  it('is empty for an operational control — its score is what counts', () => {
    expect(penalisedDims(ctl('x', 'operational', { c: 2, i: 2, a: 2 }), INHERENT)).toEqual([]);
  });

  it.each(['missing', 'unknown'])('is empty for a %s control — it counts for nothing', (st) => {
    expect(penalisedDims(ctl('x', st, { c: 1, i: 1, a: 1 }), INHERENT)).toEqual([]);
  });
});
