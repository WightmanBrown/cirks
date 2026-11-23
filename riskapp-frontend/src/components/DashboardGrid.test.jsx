// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { vi } from 'vitest';
vi.mock('../api', () => ({ getDashboardLayout: vi.fn(), putDashboardLayout: vi.fn() }));
import { gridAt, mergePositions, defaultPositions, MIN_WIDGET_W } from './DashboardGrid';

describe('the dashboard never squeezes a widget below the minimum width (owner, 2026-11-18)', () => {
  test('a laptop gets two columns, a wide monitor three, a narrow window one', () => {
    expect(gridAt(1300).columns).toBe(2);
    expect(gridAt(1850).columns).toBe(3);
    expect(gridAt(900).columns).toBe(1);
  });

  test('at every width a widget is at least the minimum', () => {
    for (let width = 320; width <= 2600; width += 7) {
      const g = gridAt(width);
      const w = g.bp === 'three' ? 4 : g.bp === 'two' ? 6 : 1;
      if (g.columns > 1) expect(g.widthOf(w)).toBeGreaterThanOrEqual(MIN_WIDGET_W);
    }
  });

  test('a layout saved four to a row keeps its order, repacked into the new columns', () => {
    const old = { lg: [{ i: 'b', x: 0, y: 0, w: 3 }, { i: 'a', x: 3, y: 0, w: 3 }, { i: 'c', x: 0, y: 1, w: 3 }] };
    const merged = mergePositions(['a', 'b', 'c'], old);
    expect(merged.two.map(it => it.i)).toEqual(['b', 'a', 'c']);
    expect(merged.two.map(it => it.w)).toEqual([6, 6, 6]);
    expect(merged.two.map(it => [it.x, it.y])).toEqual([[0, 0], [6, 0], [0, 1]]);
  });

  test('a layout saved in the new columns keeps its positions; the width is always the design width', () => {
    const saved = { two: [{ i: 'a', x: 6, y: 0, w: 3 }, { i: 'b', x: 0, y: 0, w: 6 }] };
    const merged = mergePositions(['a', 'b'], saved);
    expect(merged.two).toEqual([{ i: 'a', x: 6, y: 0, w: 6 }, { i: 'b', x: 0, y: 0, w: 6 }]);
    expect(mergePositions(['a'], null)).toEqual(defaultPositions(['a']));
  });
});
