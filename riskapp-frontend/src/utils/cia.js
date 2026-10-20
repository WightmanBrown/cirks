// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * CIA helpers shared across list/detail pages.
 */

/**
 * The single "Impact" value shown in business view: the highest of the
 * supplied C/I/A values, ignoring nulls. Returns null when every value is
 * null/undefined (i.e. not yet assessed) so CiaBadge can render "—".
 */
export function maxCia(...vals) {
  const nums = vals.filter(v => v != null);
  return nums.length ? Math.max(...nums) : null;
}
