// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const PREFIX = 'cirks.scroll.';
const read = (key) => {
  try { const v = sessionStorage.getItem(PREFIX + key); return v == null ? null : Number(v); } catch { return null; }
};
const write = (key, y) => {
  try { sessionStorage.setItem(PREFIX + key, String(Math.round(y))); } catch { /* storage blocked: nothing remembered */ }
};

/**
 * Back to a long list lands where you left it.
 *
 * Every list page fetches its rows when it opens, so when the browser tries to
 * restore the scroll position on Back the page is still short and it lands at
 * the top. This remembers the position of each visit (each history entry, in
 * sessionStorage) and, on Back or Forward, scrolls there once the page says its
 * rows are drawn: pass `ready` = data loaded.
 *
 * Arriving any other way (a link, the menu) changes nothing. Keep the list's
 * own search, filters and sort in the address too (useUrlState), or Back
 * returns to the right height of a different list.
 */
export function useScrollRestore(ready) {
  const { key } = useLocation();
  const navType = useNavigationType();
  const settled = useRef(null);   // the history entry whose position is settled

  useEffect(() => {
    if (settled.current === key) return;
    // 'default' is a page opened afresh (typed or bookmarked): nothing to return to.
    if (navType !== 'POP' || key === 'default') {
      settled.current = key;
      write(key, window.scrollY);   // a search or filter change replaces the entry; keep its place
      return;
    }
    if (!ready) return;
    const y = read(key);
    if (y != null) window.scrollTo(0, y);
    settled.current = key;
  }, [key, navType, ready]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Not before the position is settled: while the rows load the page is
        // short, and the browser's clamped scroll would overwrite the saved one.
        if (settled.current === key) write(key, window.scrollY);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);
}
