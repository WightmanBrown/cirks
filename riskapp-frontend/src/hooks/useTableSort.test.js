// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { sortRows } from './useTableSort';

const names = (rows) => rows.map((r) => r.k);

describe('sortRows', () => {
  const byK = (r) => r.k;

  test('text: ascending then descending, case-insensitive', () => {
    const rows = [{ k: 'banana' }, { k: 'Apple' }, { k: 'cherry' }];
    expect(names(sortRows(rows, byK, 'asc'))).toEqual(['Apple', 'banana', 'cherry']);
    expect(names(sortRows(rows, byK, 'desc'))).toEqual(['cherry', 'banana', 'Apple']);
  });

  test('numbers sort numerically, not lexically', () => {
    const rows = [{ k: 2 }, { k: 10 }, { k: 1 }];
    expect(names(sortRows(rows, byK, 'asc'))).toEqual([1, 2, 10]);
    expect(names(sortRows(rows, byK, 'desc'))).toEqual([10, 2, 1]);
  });

  test('numeric STRINGS (Postgres bigint) sort numerically: 2 < 10', () => {
    const rows = [{ k: '2' }, { k: '10' }, { k: '1' }];
    expect(names(sortRows(rows, byK, 'asc'))).toEqual(['1', '2', '10']);
  });

  test('null / undefined / empty always sort to the bottom, both directions', () => {
    const rows = [{ k: 3 }, { k: null }, { k: 1 }, { k: undefined }, { k: 2 }];
    expect(names(sortRows(rows, byK, 'asc')).slice(0, 3)).toEqual([1, 2, 3]);
    expect(names(sortRows(rows, byK, 'asc')).slice(3)).toEqual([null, undefined]); // blanks last
    // descending keeps blanks last too (not flipped to the top)
    expect(names(sortRows(rows, byK, 'desc')).slice(0, 3)).toEqual([3, 2, 1]);
    expect(names(sortRows(rows, byK, 'desc')).slice(3).every((v) => v == null)).toBe(true);
  });

  test('does not mutate the input array', () => {
    const rows = [{ k: 3 }, { k: 1 }, { k: 2 }];
    const before = [...rows];
    sortRows(rows, byK, 'asc');
    expect(rows).toEqual(before);
  });
});
