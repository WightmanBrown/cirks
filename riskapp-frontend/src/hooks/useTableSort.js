// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useCallback, useMemo, useState } from 'react';

// Sort `rows` by `accessor(row)`, ascending or descending. A null/undefined/''
// value always sorts to the bottom, regardless of direction (matches the
// "unrated sorts last" convention used on RiskSummaryPage). Numbers compare
// numerically; everything else compares as a case-insensitive locale string.
const asNumber = (v) => {
  if (typeof v === 'number') return v;
  // Postgres COUNT()/bigint columns arrive as numeric strings — treat those as
  // numbers so counts/scores sort 2 < 10, not "10" < "2".
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

export function sortRows(rows, accessor, dir = 'asc') {
  const factor = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    const na = va == null || va === '';
    const nb = vb == null || vb === '';
    if (na && nb) return 0;
    if (na) return 1;   // blanks always at the bottom…
    if (nb) return -1;  // …regardless of direction
    const nva = asNumber(va);
    const nvb = asNumber(vb);
    if (nva !== null && nvb !== null) return (nva - nvb) * factor;
    return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * factor;
  });
}

// Reusable client-side column sort for list tables. Pair with <SortableTh>.
// `accessors` maps a column key → (row) => value. `defaultCompare` (optional)
// orders the rows when no column is active, so a list keeps its meaningful
// default order until the user clicks a header. Clicking a header cycles
// ascending → descending → back to the default order.
export function useTableSort(rows, { accessors = {}, defaultCompare = null } = {}) {
  // key + dir in ONE state object so a single pure updater cycles them
  // (nesting one setter inside another's updater double-fires under StrictMode).
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  const toggleSort = useCallback((key) => {
    setSort((prev) => {
      if (prev.key !== key)   return { key, dir: 'asc' };   // new column → ascending
      if (prev.dir === 'asc') return { key, dir: 'desc' };  // same column → descending
      return { key: null, dir: 'asc' };                     // third click → default order
    });
  }, []);

  const clearSort = useCallback(() => setSort({ key: null, dir: 'asc' }), []);

  const sorted = useMemo(() => {
    if (sort.key && accessors[sort.key]) return sortRows(rows, accessors[sort.key], sort.dir);
    return defaultCompare ? [...rows].sort(defaultCompare) : rows;
  }, [rows, sort, accessors, defaultCompare]);

  return { sorted, sortKey: sort.key, sortDir: sort.dir, toggleSort, clearSort };
}
