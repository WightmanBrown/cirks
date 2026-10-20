// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { collapse, expand, isMixed, tripleText } from './singleProbability';

describe('collapse', () => {
  // The worse case, because a summary should not flatter.
  it('shows the highest of the three', () => {
    expect(collapse({ probability_c: 2, probability_i: 4, probability_a: 4 })).toBe(4);
    expect(collapse({ probability_c: 3, probability_i: 3, probability_a: 3 })).toBe(3);
  });

  it('is null unless all three are present', () => {
    expect(collapse({ probability_c: 2, probability_i: 4 })).toBeNull();
    expect(collapse({})).toBeNull();
    expect(collapse(null)).toBeNull();
  });

  it('reads any prefix, so item targets work too', () => {
    expect(collapse({ target_p_c: 1, target_p_i: 2, target_p_a: 3 }, 'target_p_')).toBe(3);
  });
});

describe('isMixed / tripleText', () => {
  // 467 of 728 stored judgements differ across dimensions, so flattening must be
  // visible rather than silent.
  it('flags a non-uniform triple and can spell it out', () => {
    const t = { probability_c: 2, probability_i: 4, probability_a: 4 };
    expect(isMixed(t)).toBe(true);
    expect(tripleText(t)).toBe('2/4/4');
  });

  it('is not mixed when all three agree', () => {
    expect(isMixed({ probability_c: 3, probability_i: 3, probability_a: 3 })).toBe(false);
  });

  it('is not mixed when the triple is incomplete — there is nothing to compare', () => {
    expect(isMixed({ probability_c: 3 })).toBe(false);
  });
});

describe('expand', () => {
  it('applies one value to all three when the ceiling allows', () => {
    expect(expand(2, { c: 5, i: 5, a: 5 }))
      .toEqual({ probability_c: 2, probability_i: 2, probability_a: 2 });
  });

  // The reason this is not {c:v, i:v, a:v}: the threat inherent caps each
  // dimension, and 11 of 20 threats have a non-uniform inherent.
  it('keeps a dimension at its own ceiling when that is lower', () => {
    expect(expand(4, { c: 3, i: 5, a: 5 }))
      .toEqual({ probability_c: 3, probability_i: 4, probability_a: 4 });
  });

  it('round-trips with collapse', () => {
    const inherent = { c: 3, i: 5, a: 5 };
    const stored = expand(4, inherent);
    expect(collapse(stored)).toBe(4);
    expect(expand(collapse(stored), inherent)).toEqual(stored);
  });

  it('survives an unknown ceiling', () => {
    expect(expand(3, undefined))
      .toEqual({ probability_c: 3, probability_i: 3, probability_a: 3 });
  });

  it('is null for no value', () => {
    expect(expand(null, { c: 5, i: 5, a: 5 })).toBeNull();
  });
});
