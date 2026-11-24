// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { FINDING_ACCESSORS, INSTANTIATION_ACCESSORS } from './FindingsPage';

const order = (rows, acc, dir = 'asc') => sortRows(rows, acc, dir).map((r) => r.id);

describe('assurance findings sort', () => {
  it('sorts the response by its word, unanswered ones as "no response"', () => {
    const acc = FINDING_ACCESSORS['rating-incomplete'].response;
    const rows = [{ id: 'none' }, { id: 'acc', exception_id: 'e' }, { id: 'act', action_id: 'a', action_status: 'proposed' }];
    expect(order(rows, acc)).toEqual(['acc', 'act', 'none']);
  });

  it('counts a document never scheduled for review as the most overdue', () => {
    const acc = FINDING_ACCESSORS['document-review'].extra;
    const rows = [{ id: 'ten', days_overdue: 10 }, { id: 'never', reason: 'no_review_date' }, { id: 'two', days_overdue: 200 }];
    expect(order(rows, acc, 'desc')).toEqual(['never', 'two', 'ten']);
  });

  it('does not sort an "Applies to" that is the organisation on every row', () => {
    expect(FINDING_ACCESSORS['document-review'].department).toBeUndefined();
    expect(FINDING_ACCESSORS['objective-solution'].department).toBeUndefined();
    expect(FINDING_ACCESSORS['supplier-assurance'].department).toBeTypeOf('function');
  });

  it('sorts supplier coverage by the share covered, and scope components by systems needed on', () => {
    const cov = FINDING_ACCESSORS['supplier-assurance'].extra;
    expect(order([{ id: 'most', met_count: 3, expected_count: 4 }, { id: 'least', met_count: 1, expected_count: 10 }], cov)).toEqual(['least', 'most']);
    const need = INSTANTIATION_ACCESSORS.needed_on;
    expect(order([{ id: 'many', implied_on: 32 }, { id: 'few', implied_on: 3 }], need)).toEqual(['few', 'many']);
  });
});
