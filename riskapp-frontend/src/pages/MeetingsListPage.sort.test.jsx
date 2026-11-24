// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { MEETING_ACCESSORS } from './MeetingsListPage';

const order = (rows, key, dir = 'asc') => sortRows(rows, MEETING_ACCESSORS[key], dir).map((r) => r.id);

describe('meetings list sort', () => {
  it('sorts the state in the order a meeting goes through them', () => {
    const rows = [{ id: 'p', state: 'planned' }, { id: 'm', state: 'minutes_issued' }, { id: 'c', state: 'closed' }];
    expect(order(rows, 'state')).toEqual(['p', 'c', 'm']);
  });

  it('sorts counts as numbers and puts a meeting with no chair last', () => {
    expect(order([{ id: 'ten', attendee_count: '10' }, { id: 'two', attendee_count: '2' }], 'attendees')).toEqual(['two', 'ten']);
    expect(order([{ id: 'none', chaired_by_name: null }, { id: 'a', chaired_by_name: 'Ann' }], 'chair')).toEqual(['a', 'none']);
  });
});
