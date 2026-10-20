// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// How a control objective with security solutions (v145/v147) is delivered on
// one system, in words for the risk page's coverage panel. One complete solution
// is enough: the others are alternatives, never gaps.

const STATE = { complete: 'complete', degraded: 'degraded', incomplete: 'incomplete' };

/**
 * { inUse, alsoComplete, alternatives } from a control's `solutions` (null when
 * the objective has none — the flat component list applies then).
 */
export function solutionSummary(solutions) {
  if (!solutions?.length) return null;
  const inUse = solutions.find(s => s.in_use) || null;
  const rest = solutions.filter(s => s !== inUse);
  return {
    inUse,
    alsoComplete: rest.filter(s => s.in_play && s.state === 'complete'),
    alternatives: rest.filter(s => !(s.in_play && s.state === 'complete')),
  };
}

export const solutionStateLabel = (s) => STATE[s] ?? 'not in place';
