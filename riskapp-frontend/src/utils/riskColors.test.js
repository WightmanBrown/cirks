// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { scoreLevel, rawLevel } from './riskColors';
import { impactWord, probabilityWord, riskWord } from './ratingScale';

// The colour bands are a cross-app convention (a "4" reads high everywhere).
// Lock the band boundaries so a refactor can't silently shift them.

describe('scoreLevel (1–25 risk score)', () => {
  test.each([
    [25, 'catastrophic'],
    [24, 'critical'], [20, 'critical'],
    [19, 'high'],     [12, 'high'],
    [11, 'medium'],   [6,  'medium'],
    [5,  'low'],      [1,  'low'],
    [null, 'none'],   [NaN, 'none'],
  ])('score %p → %s', (value, level) => {
    expect(scoreLevel(value)).toBe(level);
  });
});

describe('rawLevel (1–5 single dimension)', () => {
  test.each([
    [5, 'catastrophic'],
    [4, 'high'],
    [3, 'medium'],
    [2, 'low'], [1, 'low'],
    [0, 'none'], [null, 'none'], [NaN, 'none'],
  ])('raw %p → %s', (value, level) => {
    expect(rawLevel(value)).toBe(level);
  });
});

describe('rating words', () => {
  test('impact words map 1–5', () => {
    expect([1, 2, 3, 4, 5].map(impactWord))
      .toEqual(['Minimal', 'Minor', 'Moderate', 'Major', 'Severe']);
  });
  test('frequency words map 1–5', () => {
    expect([1, 2, 3, 4, 5].map(probabilityWord))
      .toEqual(['< Decadal', 'Triennial', 'Annual', 'Quarterly', '> Monthly']);
  });
  test('the outer two carry their range symbol, so the tails are covered', () => {
    // A 1-in-50-year event is not "once a decade" and daily port scans are not
    // "monthly"; without '<' and '>' both tails would be silently mis-stated.
    expect(probabilityWord(1)).toMatch(/^</);
    expect(probabilityWord(5)).toMatch(/^>/);
  });
  test('no frequency word collides with an impact or risk-band word', () => {
    // "Critical" must never mean two things at once — the same guarantee the
    // ISO ladder gave, re-checked now the vocabulary has changed.
    const freq = [1, 2, 3, 4, 5].map(probabilityWord);
    const impact = [1, 2, 3, 4, 5].map(impactWord);
    const bands = [5, 6, 12, 20, 25].map(riskWord);
    for (const w of freq) {
      expect(impact).not.toContain(w);
      expect(bands).not.toContain(w);
    }
  });
  test('risk score bands', () => {
    expect([5, 6, 12, 20, 24, 25].map(riskWord))
      .toEqual(['Low', 'Medium', 'High', 'Critical', 'Critical', 'Catastrophic']);
  });
  test('out-of-range / null → null', () => {
    expect(impactWord(null)).toBeNull();
    expect(impactWord(6)).toBeNull();
    expect(riskWord(null)).toBeNull();
  });
});
