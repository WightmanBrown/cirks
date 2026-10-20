// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Which control is actually setting the current risk?
//
// The register derives `risks.probability_*` as the MIN, per C/I/A, over the
// DEPLOYED controls of their residual — a `degraded` one worsened by a rung and
// capped at the threat inherent (migrations 0092 → 0095 → 0115). MIN means the
// BEST control sets the floor, so on a risk with eight deployed controls the
// number on screen can come from exactly one of them and the other seven look
// like they are doing nothing.
//
// That is the model working as designed, but it is invisible, and invisible
// derivations get read as bugs. These helpers name the control (per dimension)
// that is setting the floor so the panel can say so out loud.

const DIMS = ['c', 'i', 'a'];

/** A control counts toward the CURRENT risk only while deployed and working. */
export function isDeployed(control) {
  return ['operational', 'degraded'].includes(control?.system_status);
}

/**
 * What this control actually contributes, per dimension — `null` when it is not
 * deployed (its score is a dormant target, not a contribution). A degraded
 * control contributes one rung worse, never above the threat inherent.
 */
export function effectiveContribution(control, inherent) {
  if (!isDeployed(control)) return null;
  const penalty = control.system_status === 'degraded' ? 1 : 0;
  const out = {};
  for (const d of DIMS) {
    const raw = control[`probability_${d}`];
    if (raw == null) return null;
    out[d] = Math.min(inherent?.[d] ?? raw + penalty, raw + penalty);
  }
  return out;
}

/**
 * The floor per dimension, and which controls set it.
 *
 * @returns {{floor: {c,i,a}, driverIds: Set<string>, byDim: {c:string[],i:string[],a:string[]}, deployedCount: number}}
 *   `floor` falls back to the threat inherent when nothing is deployed, matching
 *   the DB's COALESCE. `driverIds` is every control setting the floor on at
 *   least one dimension.
 */
export function coverageDrivers(controls = [], inherent = {}) {
  const contributions = controls
    .map(c => ({ id: c.id, eff: effectiveContribution(c, inherent) }))
    .filter(x => x.eff !== null);

  const floor = {};
  const byDim = { c: [], i: [], a: [] };
  for (const d of DIMS) {
    floor[d] = contributions.length
      ? Math.min(...contributions.map(x => x.eff[d]))
      : (inherent?.[d] ?? null);
    if (contributions.length) {
      byDim[d] = contributions.filter(x => x.eff[d] === floor[d]).map(x => x.id);
    }
  }

  return {
    floor,
    byDim,
    driverIds: new Set([...byDim.c, ...byDim.i, ...byDim.a]),
    deployedCount: contributions.length,
  };
}

/**
 * Dimensions where a DEGRADED control actually counts worse than the score shown
 * against it — i.e. the penalty bit, rather than being absorbed by the cap at the
 * threat inherent.
 *
 * The panel displays the *judged* score (what an analyst set, assuming the control
 * works). The register uses the *effective* contribution. For a degraded control
 * those differ by a rung, and showing only the first makes the risk look wrong —
 * the row says 2 while the risk is computed from 3. This is what the flag beside
 * each value exists to say.
 *
 * @returns {{dim: 'c'|'i'|'a', scored: number, counts: number}[]} empty when the
 *   control is not deployed, not degraded, or already capped at the inherent.
 */
export function penalisedDims(control, inherent) {
  const eff = effectiveContribution(control, inherent);
  if (!eff) return [];
  return DIMS
    .map(d => ({ dim: d, scored: control[`probability_${d}`], counts: eff[d] }))
    .filter(x => x.counts !== x.scored);
}

/** Which dimensions this control is setting — e.g. ['c','a'] → "C · A". */
export function driverDims(controlId, byDim) {
  return DIMS.filter(d => byDim?.[d]?.includes(controlId));
}
