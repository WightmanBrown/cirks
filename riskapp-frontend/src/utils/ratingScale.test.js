// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import {
  impactWord, impactLabel, probabilityLabel, riskWord, riskLabel,
  scaleLabels, bandRange,
} from './ratingScale';

// The word alone is ambiguous — "Major" and "Moderate" read as near-synonyms,
// and neither says how far up a five-point scale it sits. The label carries the
// position so the claim is checkable.
describe('impactLabel / probabilityLabel', () => {
  it('pairs the word with its position on the scale', () => {
    expect(impactLabel(1)).toBe('Minimal (1)');
    expect(impactLabel(4)).toBe('Major (4)');
    expect(impactLabel(5)).toBe('Severe (5)');
    expect(probabilityLabel(1)).toBe('< Decadal (1)');
    expect(probabilityLabel(5)).toBe('> Monthly (5)');
  });

  it('leaves the bare word available for anything that needs it', () => {
    expect(impactWord(4)).toBe('Major');
  });

  it.each([null, undefined, 0, 6, NaN])('is null for %s', (v) => {
    expect(impactLabel(v)).toBeNull();
    expect(probabilityLabel(v)).toBeNull();
  });
});

// A band covers a RANGE of a 1–25 score, so a position index would be a lie.
// The honest companion figure is the score itself.
describe('riskLabel', () => {
  it('pairs the band with the actual score, not a position', () => {
    expect(riskLabel(14)).toBe('High (14)');
    expect(riskLabel(25)).toBe('Catastrophic (25)');
    expect(riskLabel(1)).toBe('Low (1)');
  });

  it('agrees with the band the score falls in', () => {
    for (const s of [1, 5, 6, 11, 12, 19, 20, 24, 25]) {
      expect(riskLabel(s)).toBe(`${riskWord(s)} (${s})`);
    }
  });

  it('is null for no score', () => {
    expect(riskLabel(null)).toBeNull();
  });
});

describe('scaleLabels', () => {
  it('labels every rung of the ladder with its position', () => {
    expect(scaleLabels('impact')).toEqual([
      'Minimal (1)', 'Minor (2)', 'Moderate (3)', 'Major (4)', 'Severe (5)']);
    expect(scaleLabels('probability')[2]).toBe('Annual (3)');
  });

  it('is empty for a scale with no 1–5 ladder', () => {
    expect(scaleLabels('risk')).toEqual([]);
  });
});

describe('bandRange', () => {
  // The ladder has no single score to show for an unselected band, so it shows
  // the span the band covers — which is what a reader needs to learn the scale.
  it('gives the score span each band covers', () => {
    expect(bandRange('low')).toBe('1–5');
    expect(bandRange('medium')).toBe('6–11');
    expect(bandRange('high')).toBe('12–19');
    expect(bandRange('critical')).toBe('20–24');
  });

  it('collapses a single-score band rather than printing "25–25"', () => {
    expect(bandRange('catastrophic')).toBe('25');
  });

  it('is null for an unknown band', () => {
    expect(bandRange('nonsense')).toBeNull();
  });
});
