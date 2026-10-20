// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { coverageForecast, gapPlanning, gapCounts, absentNextSteps } from './coverageForecast';

const IMPACT = { c: 4, i: 4, a: 4 };
const ctl = (o = {}) => ({
  id: 'c1', system_status: 'missing', has_open_action: false, probability_judged: true,
  probability_c: 3, probability_i: 3, probability_a: 3, components: [], ...o,
});

describe('coverageForecast', () => {
  it('is the MIN across all controls — the best one sets the floor', () => {
    const f = coverageForecast([
      ctl({ id: 'a', probability_c: 4, probability_i: 4, probability_a: 4 }),
      ctl({ id: 'b', probability_c: 1, probability_i: 2, probability_a: 3 }),
    ], IMPACT);
    expect(f.prob).toEqual({ c: 1, i: 2, a: 3 });
    expect(f.score).toBe(12);   // MAX over dims of prob × impact = 3 × 4
  });

  // The point of the forecast: a NOT-deployed control counts, because the
  // question is what closing the gap would buy.
  it('counts controls that are not deployed', () => {
    const f = coverageForecast([ctl({ system_status: 'missing', probability_c: 1,
      probability_i: 1, probability_a: 1 })], IMPACT);
    expect(f.score).toBe(4);
  });

  // Deliberately not the current aggregate with gaps filled: closing the gap
  // includes REPAIRING a degraded control, so its penalty does not apply.
  it('does not apply the degraded penalty — closing the gap includes repair', () => {
    const f = coverageForecast([ctl({ system_status: 'degraded', probability_c: 2,
      probability_i: 2, probability_a: 2 })], IMPACT);
    expect(f.prob.c).toBe(2);   // not 3
  });

  it('is null when nothing carries a figure', () => {
    expect(coverageForecast([], IMPACT).score).toBeNull();
    expect(coverageForecast([{ id: 'x' }], IMPACT).score).toBeNull();
  });
});

// A forecast is only as good as the control holding it down. On 6 of 203 risks
// that control is one nobody has deployed, so the figure is a claim about work
// that has not started — the panel has to be able to say so.
describe('what the forecast rests on', () => {
  it('names the control that sets the figure', () => {
    const f = coverageForecast([
      ctl({ id: 'weak',   probability_c: 4, probability_i: 4, probability_a: 4 }),
      ctl({ id: 'strong', probability_c: 1, probability_i: 1, probability_a: 1 }),
    ], IMPACT);
    expect(f.restsOn.map(c => c.id)).toEqual(['strong']);
  });

  it('flags it as absent when it is not deployed here', () => {
    const f = coverageForecast([
      ctl({ id: 'strong', system_status: 'missing',
            probability_c: 1, probability_i: 1, probability_a: 1 }),
    ], IMPACT);
    expect(f.absent.map(c => c.id)).toEqual(['strong']);
  });

  it.each(['operational', 'degraded'])('does not flag a %s control as absent', (system_status) => {
    const f = coverageForecast([ctl({ id: 'here', system_status })], IMPACT);
    expect(f.restsOn.map(c => c.id)).toEqual(['here']);
    expect(f.absent).toEqual([]);
  });

  it('names every control that ties on a dimension, not just the first', () => {
    const f = coverageForecast([
      ctl({ id: 'setsC', probability_c: 1, probability_i: 5, probability_a: 5 }),
      ctl({ id: 'setsI', probability_c: 5, probability_i: 1, probability_a: 5 }),
      ctl({ id: 'setsA', probability_c: 5, probability_i: 5, probability_a: 1 }),
    ], IMPACT);
    expect(f.restsOn.map(c => c.id).sort()).toEqual(['setsA', 'setsC', 'setsI']);
  });

  it('rests on nothing when nothing is judged', () => {
    const f = coverageForecast([ctl({ probability_judged: false })], IMPACT);
    expect(f.score).toBeNull();
    expect(f.restsOn).toBeUndefined();   // no forecast, so nothing to qualify
  });
});

describe('gapPlanning', () => {
  const withCmp = (cmp) => ctl({ system_status: 'operational', components: cmp });

  it('is not_planned when no gap element has an open action', () => {
    expect(gapPlanning([ctl(), ctl({ id: 'c2' })]).state).toBe('not_planned');
  });

  it('is planned when every gap element has one', () => {
    expect(gapPlanning([ctl({ has_open_action: true })]).state).toBe('planned');
  });

  it('is part_planned in between, and says how many', () => {
    const r = gapPlanning([ctl({ has_open_action: true }), ctl({ id: 'c2' })]);
    expect(r).toMatchObject({ state: 'part_planned', planned: 1, total: 2 });
  });

  it('counts a missing COMPONENT of a deployed control as gap work', () => {
    const r = gapPlanning([withCmp([{ id: 'x', on_system: false, has_open_action: false }])]);
    expect(r).toMatchObject({ state: 'not_planned', total: 1 });
  });

  it('is `none` when there is no gap at all', () => {
    expect(gapPlanning([ctl({ system_status: 'operational' })]).state).toBe('none');
  });

  // An excluded control is a decision, not a gap (0118) — it must not appear as
  // outstanding work nobody has planned.
  it('ignores an excluded control', () => {
    expect(gapPlanning([ctl({ system_status: 'not_applicable' })]).state).toBe('none');
  });
});

describe('gapCounts', () => {
  it('counts missing controls and missing components separately', () => {
    const g = { controls: [
      ctl({ id: 'a' }),
      ctl({ id: 'b', system_status: 'operational',
            components: [{ id: 'x', on_system: false }, { id: 'y', on_system: true, system_status: 'operational' }] }),
    ] };
    expect(gapCounts(g)).toEqual({ controls: 1, components: 1, total: 2 });
  });

  it('is all zero for a clean panel, and survives no gap at all', () => {
    expect(gapCounts({ controls: [ctl({ system_status: 'operational' })] }).total).toBe(0);
    expect(gapCounts(null).total).toBe(0);
  });
});

// The flaw this guard exists for: an UNJUDGED control reports the threat
// inherent — "no control at all" — so counting it forecasts that closing the gap
// achieves nothing, and the MIN returns whatever the risk already scores. The
// panel would then announce a reduction to the number it is already at.
describe('unjudged controls', () => {
  it('are excluded from the forecast', () => {
    const f = coverageForecast([
      ctl({ id: 'judged', probability_c: 1, probability_i: 1, probability_a: 1 }),
      ctl({ id: 'unjudged', probability_judged: false,
            probability_c: 5, probability_i: 5, probability_a: 5 }),
    ], IMPACT);
    expect(f.prob).toEqual({ c: 1, i: 1, a: 1 });
    expect(f.judged).toBe(1);
    expect(f.total).toBe(2);
  });

  it('give no forecast at all when nothing is judged', () => {
    const f = coverageForecast([ctl({ probability_judged: false })], IMPACT);
    expect(f.score).toBeNull();
    expect(f.judged).toBe(0);
  });
});

describe('absentNextSteps — what to do about controls a forecast rests on', () => {
  const noSol = (title) => ({ title, delivery: 'system', solutions: [] });
  const withSol = (title, extra = {}) => ({ title, delivery: 'system', solutions: [{ id: 'p' }], ...extra });

  it('says an objective with no security solution cannot be put in place until it has one', () => {
    expect(absentNextSteps([noSol('A'), noSol('B')]))
      .toBe('No security solution delivers them yet, so they cannot be put in place until they are given one.');
    expect(absentNextSteps([noSol('A')]))
      .toBe('No security solution delivers it yet, so it cannot be put in place until it is given one.');
  });

  it('says nobody has committed only where there is a solution and no open action', () => {
    expect(absentNextSteps([withSol('A')])).toBe('Nobody has committed to putting it in place.');
    expect(absentNextSteps([withSol('A', { has_open_action: true })])).toBe('');
  });

  it('names each control when both apply', () => {
    expect(absentNextSteps([noSol('A'), withSol('B')]))
      .toBe('No security solution delivers A yet, so it cannot be put in place until it is given one. Nobody has committed to putting B in place.');
  });

  it('treats a control not delivered per system as one to commit to, not one needing a solution', () => {
    expect(absentNextSteps([{ title: 'C', delivery: null, solutions: [] }]))
      .toBe('Nobody has committed to putting it in place.');
  });
});
