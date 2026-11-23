// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A list page's setting (search, filter, sort) kept in the address instead of
 * in memory, so Back from an item returns to the same list, and a filtered list
 * can be bookmarked or sent. Like useState, with the value a string: the
 * default is left out of the address, and changes replace the history entry
 * rather than adding one, so Back still leaves the page.
 *
 * One change per event: two setters called in the same event each start from
 * the address as it was, and the second undoes the first. Keep values that
 * change together in one parameter (useUrlSortState does).
 */
export function useUrlState(param, initial = '') {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const value = raw === null ? initial : raw;
  const setValue = useCallback((next) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      const current = p.has(param) ? p.get(param) : initial;
      const v = typeof next === 'function' ? next(current) : next;
      if (v == null || v === '' || v === initial) p.delete(param);
      else p.set(param, String(v));
      return p;
    }, { replace: true });
  }, [param, initial, setParams]);
  return [value, setValue];
}

const parseSort = (s, dflt) => {
  if (!s) return dflt;
  const [key, dir] = s.split(':');
  return { key: key || null, dir: dir === 'desc' ? 'desc' : 'asc' };
};
const formatSort = (o) => (o && o.key ? `${o.key}:${o.dir}` : '');

/**
 * A table's sort `{ key, dir }` in the address as `sort=key:dir`. Returns
 * `[sort, setSort]`, setSort taking a value or an updater, so it can be handed
 * to useTableSort as its `state`.
 */
export function useUrlSortState(param = 'sort', dflt = { key: null, dir: 'asc' }) {
  const initial = formatSort(dflt);
  const [raw, setRaw] = useUrlState(param, initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sort = useMemo(() => parseSort(raw, dflt), [raw, initial]);
  const setSort = useCallback(
    (next) => setRaw((cur) => formatSort(typeof next === 'function' ? next(parseSort(cur, dflt)) : next)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setRaw, initial],
  );
  return [sort, setSort];
}
