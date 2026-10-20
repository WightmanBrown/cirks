// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { ratingCompleteness, COMPLETE, PARTIAL, UNRATED, NO_MANDATE } from './ratingCompleteness';

const asset = (o = {}) => ({
  mandatory_tables_total: 3, mandatory_tables_rated: 3, rated_tables_total: 4, ...o,
});

describe('ratingCompleteness', () => {
  it('is complete when every mandatory table is covered', () => {
    expect(ratingCompleteness(asset()).state).toBe(COMPLETE);
    expect(ratingCompleteness(asset()).label).toBeNull();   // nothing to shout about
  });

  // The dangerous state: rated against something, so it looks finished.
  it('is PARTIAL when rated against something but missing a mandatory table', () => {
    const r = ratingCompleteness(asset({ mandatory_tables_rated: 1, rated_tables_total: 2 }));
    expect(r.state).toBe(PARTIAL);
    expect(r.missing).toBe(2);
    expect(r.label).toBe('Not fully rated — 2 mandatory impact tables missing');
  });

  it('says "table" not "tables" for one', () => {
    expect(ratingCompleteness(asset({ mandatory_tables_rated: 2 })).label)
      .toBe('Not fully rated — 1 mandatory impact table missing');
  });

  // Untouched backlog is a different problem from a half-finished job, so the
  // two states stay separate rather than collapsing into "incomplete".
  it('is UNRATED, not PARTIAL, when there are no ratings at all', () => {
    const r = ratingCompleteness(asset({ mandatory_tables_rated: 0, rated_tables_total: 0 }));
    expect(r.state).toBe(UNRATED);
    expect(r.label).toBe('Not yet rated');
  });

  it('claims nothing about completeness when no table is mandatory', () => {
    expect(ratingCompleteness({ mandatory_tables_total: 0, rated_tables_total: 2 }).state)
      .toBe(NO_MANDATE);
    expect(ratingCompleteness({ mandatory_tables_total: 0, rated_tables_total: 0 }).state)
      .toBe(UNRATED);
  });

  it('survives a row that predates the new fields', () => {
    expect(ratingCompleteness({}).state).toBe(UNRATED);
    expect(ratingCompleteness().state).toBe(UNRATED);
  });
});
