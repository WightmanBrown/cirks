// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A department's colour in the pictures (relation diagrams, owner 2026-11-19):
// the same department wears the same colour on every page, on its own box and
// on everything it owns (systems, assets, a business service) and their lists.
// Five colours for many departments, so two may share one; the name is always
// written beside it, so colour is never the only signal.

export const DEPARTMENT_PALETTE = ['var(--ppitf-people)', 'var(--ppitf-process)', 'var(--ppitf-information)',
  'var(--ppitf-technology)', 'var(--ppitf-facility)'];

export function departmentColour(id) {
  if (!id) return 'var(--text-muted)';
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEPARTMENT_PALETTE[h % DEPARTMENT_PALETTE.length];
}
