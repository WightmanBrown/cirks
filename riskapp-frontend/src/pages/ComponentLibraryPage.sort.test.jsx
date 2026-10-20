// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { SORT_ACCESSORS, STATUS_RANK } from './ComponentLibraryPage';

// The component-library column sort. Two of these accessors encode a judgement
// rather than reading a field, and both are the kind that regresses silently —
// a wrong sort looks like data, not like a bug.

const row = (over) => ({
  name: 'x', status: 'unknown', systems: [], vulnerable_risk_count: 0,
  vulnerable_max_score: null, max_risk_score: null, ...over,
});

const order = (rows, key, dir = 'asc') =>
  sortRows(rows, SORT_ACCESSORS[key], dir).map((r) => r.name);

describe('status sorts by health, not alphabet', () => {
  it('ascending runs healthiest → most in need of attention', () => {
    const rows = [
      row({ name: 'degraded',   status: 'degraded' }),
      row({ name: 'broken',     status: 'non_operational' }),
      row({ name: 'fine',       status: 'operational' }),
      row({ name: 'unknown',    status: 'unknown' }),
    ];
    expect(order(rows, 'status')).toEqual(['fine', 'unknown', 'degraded', 'broken']);
    // Alphabetically this would be degraded, broken(non_operational), fine, unknown
    // — an ordering that tells the reader nothing.
    expect(order(rows, 'status', 'desc')).toEqual(['broken', 'degraded', 'unknown', 'fine']);
  });

  it('an unrecognised status is treated as unknown rather than sorted off the end', () => {
    expect(SORT_ACCESSORS.status({ status: 'something_new' })).toBe(STATUS_RANK.unknown);
  });
});

describe('the two vulnerability columns sort on different halves of the fact', () => {
  // Vulnerable = how many risks name it; Risk score = how bad the worst is.
  // If both sorted on severity, one of the two columns would be dead weight.
  const rows = [
    row({ name: 'three-minor',  vulnerable_risk_count: 3, vulnerable_max_score: 4 }),
    row({ name: 'one-critical', vulnerable_risk_count: 1, vulnerable_max_score: 20 }),
  ];

  it('Vulnerable puts the most-named first', () => {
    expect(order(rows, 'vulnerable', 'desc')).toEqual(['three-minor', 'one-critical']);
  });

  it('Risk score puts the most severe first', () => {
    expect(order(rows, 'risk', 'desc')).toEqual(['one-critical', 'three-minor']);
  });
});

describe('Risk score is the risks NAMING the component, not those near it', () => {
  // The regression this guards, taken from real CIRKS-test data: IT
  // Administrators is named on a risk scoring 12 while sitting in a system that
  // carries an unrelated 25. Reading max_risk_score here would report 25 and
  // attribute someone else's risk to this component.
  it('ignores the worst risk on the systems it merely sits in', () => {
    const near = row({ name: 'it-admins', vulnerable_risk_count: 1,
                       vulnerable_max_score: 12, max_risk_score: 25 });
    expect(SORT_ACCESSORS.risk(near)).toBe(12);
  });

  it('is blank for a component no risk names, however risky its systems are', () => {
    const bystander = row({ name: 'bystander', max_risk_score: 25 });
    expect(SORT_ACCESSORS.risk(bystander)).toBeNull();
  });
});

describe('cells that render as a blank sink to the bottom either way', () => {
  // The three count/score columns render "—", "no risks" or nothing at all for
  // an absent value. Those must never outrank a real one just because the sort
  // was flipped, or the top of the list fills with rows that say nothing.
  const rows = [
    row({ name: 'has',  systems: [{}, {}], vulnerable_risk_count: 2, vulnerable_max_score: 9 }),
    row({ name: 'none' }),
  ];
  it.each(['systems', 'vulnerable', 'risk'])('%s', (key) => {
    expect(order(rows, key, 'asc')).toEqual(['has', 'none']);
    expect(order(rows, key, 'desc')).toEqual(['has', 'none']);
  });
});

// An organisation-wide component (v137) shows "organisation wide", not a count of
// the systems relying on it, and sorts as larger than any count.
describe('the systems column with an organisation-wide component', () => {
  const rows = [
    row({ name: 'three', systems: [{}, {}, {}] }),
    row({ name: 'shared', systems: [{}], instantiation: 'organisational' }),
    row({ name: 'none', systems: [] }),
  ];
  it('sorts above every count, and blanks still sink', () => {
    expect(order(rows, 'systems', 'desc')).toEqual(['shared', 'three', 'none']);
    expect(order(rows, 'systems', 'asc')).toEqual(['three', 'shared', 'none']);
  });
});
