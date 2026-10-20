// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// One probability picker instead of three.
//
// The model keeps C/I/A separately — a threat can be far likelier to breach
// confidentiality than availability, and the register's arithmetic depends on
// that. But the SCREEN asking an analyst for three numbers per control, on a
// panel listing eight controls, was twenty-four pickers producing one judgement
// nobody was really making three times. The backend is unchanged; this is purely
// how the question is asked.
//
// Owner's instruction, 2026-09-18: "the full CIA rating for probability is just
// making the view complex and adds nothing but confusion".

const DIMS = ['c', 'i', 'a'];

/**
 * The single figure to SHOW for a stored triple.
 *
 * The MAX, because a higher probability is the worse case and a summary should
 * not flatter. It also round-trips with `expand` below: store 3/4/4 under an
 * inherent of 3/5/5, read back 4, set 4 again, get 3/4/4 unchanged.
 */
export function collapse(triple, prefix = 'probability_') {
  const vals = DIMS.map(d => triple?.[`${prefix}${d}`]).filter(v => v != null);
  return vals.length === DIMS.length ? Math.max(...vals) : null;
}

/** True when the stored dimensions are not all equal — the picker says so. */
export function isMixed(triple, prefix = 'probability_') {
  const vals = DIMS.map(d => triple?.[`${prefix}${d}`]);
  if (vals.some(v => v == null)) return false;
  return new Set(vals).size > 1;
}

/** "2/4/4" — for the tooltip that keeps a flattened triple visible. */
export function tripleText(triple, prefix = 'probability_') {
  const vals = DIMS.map(d => triple?.[`${prefix}${d}`]);
  return vals.some(v => v == null) ? null : vals.join('/');
}

/**
 * Turn the single value back into three, per dimension.
 *
 * NOT simply `{c: v, i: v, a: v}`. The threat's inherent probability is the
 * ceiling on every dimension — a control can only reduce the chance of an
 * attack, never raise it — and 11 of 20 threats have a non-uniform inherent. So
 * a dimension already below the chosen figure keeps its own ceiling.
 *
 * Picking 4 against an inherent of 3/5/5 therefore yields 3/4/4, which is what
 * the analyst meant: bring it down to 4 where it can go that low. Capping the
 * PICKER at 3 instead would have forced them to claim a better figure than they
 * believed, understating the probability and so the risk.
 */
export function expand(value, inherent) {
  if (value == null) return null;
  const out = {};
  for (const d of DIMS) {
    const ceiling = inherent?.[d];
    out[`probability_${d}`] = ceiling != null ? Math.min(value, ceiling) : value;
  }
  return out;
}
