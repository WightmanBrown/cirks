// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { PATTERN_SYSTEM_ACCESSORS, UNSTATED_SYSTEM_ACCESSORS } from './SystemPatternsPage';

const names = (rows, acc, dir) => sortRows(rows, acc, dir).map((r) => r.name);

describe('system patterns sort', () => {
  it('sorts systems against their pattern by unanswered required questions', () => {
    const rows = [
      { name: 'two gaps', pattern_fit: { state: 'incomplete', missing: ['a', 'b'] } },
      { name: 'complete', pattern_fit: { state: 'complete', missing: [] } },
      { name: 'one gap', pattern_fit: { state: 'incomplete', missing: ['a'] } },
    ];
    expect(names(rows, PATTERN_SYSTEM_ACCESSORS.fit)).toEqual(['complete', 'one gap', 'two gaps']);
  });

  it('sorts systems with no pattern by their closest pattern, none last', () => {
    const rows = [{ name: 'none', near: null }, { name: 's2', near: { code: 'S2' } }, { name: 's1', near: { code: 'S1' } }];
    expect(names(rows, UNSTATED_SYSTEM_ACCESSORS.closest)).toEqual(['s1', 's2', 'none']);
    expect(names(rows, UNSTATED_SYSTEM_ACCESSORS.closest, 'desc')).toEqual(['s2', 's1', 'none']);
  });
});
