// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * The `?selected=<id>` row-unfold mechanic shared by the entity list pages
 * (assets / systems / services). Reads/writes the `selected` search param,
 * toggles it, and smooth-scrolls the expanded summary row into view once
 * loading settles.
 *
 * Pass the page's `loading` flag so the scroll fires after data is in.
 * Returns `{ selectedId, toggleSelect, summaryRowRef }` — put the ref on the
 * expanded row.
 */
export function useSelectedRow(loading) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('selected');
  const summaryRowRef = useRef(null);

  function toggleSelect(id) {
    if (selectedId === id) {
      searchParams.delete('selected');
    } else {
      searchParams.set('selected', id);
    }
    setSearchParams(searchParams, { replace: true });
  }

  useEffect(() => {
    if (!selectedId || loading) return;
    if (summaryRowRef.current) {
      summaryRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedId, loading]);

  return { selectedId, toggleSelect, summaryRowRef };
}
