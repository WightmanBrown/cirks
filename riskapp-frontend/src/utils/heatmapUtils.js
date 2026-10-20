// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * heatmapUtils.js
 *
 * Shared logic for all risk heatmap grids. Used by RiskHeatmapWidget and
 * MyRisksWidget (dashboard dual grids) and RiskSummaryPage (per-dimension
 * grids in expert view, one current-risk grid in business view, + cell filter).
 *
 * Every grid in the app plots risks at their DOMINANT dimension via
 * buildCurrentRiskMatrix or at a single named dimension via the C/I/A builders.
 * None of them mixes maxima across dimensions — see the note by
 * dominantDimension for why that matters.
 */

/**
 * Build a 5×5 matrix keyed by [probability][impact] = count.
 * Initialises all 25 cells to 0 so the grid always renders fully.
 *
 * @param {Array}    risks
 * @param {Function} probFn    (risk) => probability value 1–5
 * @param {Function} impactFn  (risk) => impact value 1–5
 * @returns {Object}           matrix[p][i] = count
 */
export function buildMatrix(risks, probFn, impactFn) {
  const m = {};
  for (let p = 1; p <= 5; p++) {
    m[p] = {};
    for (let i = 1; i <= 5; i++) m[p][i] = 0;
  }
  for (const r of risks) {
    const p = Math.min(5, Math.max(1, Math.round(probFn(r))));
    const i = Math.min(5, Math.max(1, Math.round(impactFn(r))));
    if (p && i) m[p][i]++;
  }
  return m;
}

/**
 * The dimension (c/i/a) whose probability × impact product is the largest —
 * i.e. the one that DRIVES the risk's current score.
 *
 * This is deliberately not GREATEST(prob) × GREATEST(impact): those maxima can
 * come from different dimensions, producing a cell no single dimension actually
 * occupies. A risk with prob (5,1,1) and impact (1,5,5) scores 5, but the
 * component-wise maxima would plot it at 5×5 = 25 — the mis-plot this replaced.
 */
export function dominantDimension(risk) {
  const impactOf = (d) => risk[`residual_impact_${d}`] ?? risk[`impact_${d}`] ?? 0;
  let best = 'c';
  let bestScore = -1;
  for (const d of ['c', 'i', 'a']) {
    const score = (risk[`prob_${d}`] ?? 0) * impactOf(d);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** Probability of the dominant dimension. */
export const currentProb = (r) => r[`prob_${dominantDimension(r)}`] ?? 0;

/** Impact of the dominant dimension (residual where present, else inherent). */
export const currentImpact = (r) => {
  const d = dominantDimension(r);
  return r[`residual_impact_${d}`] ?? r[`impact_${d}`] ?? 0;
};

/**
 * Current-risk matrix — each risk plotted at its DOMINANT dimension's
 * probability × impact, so a cell's position agrees exactly with the "Current
 * risk" column in the table beneath it. This is the business-view grid.
 */
export function buildCurrentRiskMatrix(risks) {
  return buildMatrix(risks, currentProb, currentImpact);
}

// There was once a buildMaxMatrix here — GREATEST(prob_c,i,a) ×
// GREATEST(impact_c,i,a) — used by the summary page and both dashboard
// heatmaps. It was removed rather than kept for reference because it
// systematically OVERSTATES: the two maxima can come from different dimensions,
// putting a risk in a cell whose score exceeds its real current risk (a
// pupil-records risk scoring 10 sat in the 25 cell). If you need a single grid,
// buildCurrentRiskMatrix is the one that agrees with the risk's score.

/** Confidentiality matrix — prob_c × residual_impact_c */
export function buildConfMatrix(risks) {
  return buildMatrix(risks, r => r.prob_c, r => r.residual_impact_c ?? r.impact_c);
}

/** Integrity matrix — prob_i × residual_impact_i */
export function buildIntMatrix(risks) {
  return buildMatrix(risks, r => r.prob_i, r => r.residual_impact_i ?? r.impact_i);
}

/** Availability matrix — prob_a × residual_impact_a */
export function buildAvailMatrix(risks) {
  return buildMatrix(risks, r => r.prob_a, r => r.residual_impact_a ?? r.impact_a);
}

/**
 * Return the CSS module class key for a cell based on impact × probability.
 *
 * @param {number} impact       1–5
 * @param {number} probability  1–5
 * @param {number} count        number of risks in this cell
 * @returns {string}            key into the CSS module
 */
export function severityKey(impact, probability, count) {
  if (count === 0) return 'cellEmpty';
  const score = impact * probability;
  if (score >= 20) return 'cellCritical';
  if (score >= 12) return 'cellHigh';
  if (score >= 6)  return 'cellMedium';
  return 'cellLow';
}

/**
 * Map a DB mitigation_status value to a human-readable display label.
 *
 * @param {string|null} status
 * @returns {string}
 */
export function mitigationLabel(status) {
  switch (status) {
    case 'in_progress': return 'In Progress';
    case 'planned':     return 'Proposed';
    case 'deferred':    return 'Stalled';
    default:            return 'No Mitigation';
  }
}

/**
 * Map a DB mitigation_status to a CSS module class key for badge styling.
 *
 * @param {string|null} status
 * @returns {string}
 */
export function mitigationSeverityKey(status) {
  switch (status) {
    case 'in_progress': return 'mitigationActive';
    case 'planned':     return 'mitigationProposed';
    case 'deferred':    return 'mitigationStalled';
    default:            return 'mitigationNone';
  }
}

/**
 * Filter a risks array to only those falling in a specific grid cell,
 * using the same probFn/impactFn pair used to build the matrix.
 * Returns the full array unchanged if targetP or targetI is null.
 *
 * @param {Array}    risks
 * @param {number|null} targetP   probability band 1–5
 * @param {number|null} targetI   impact band 1–5
 * @param {Function} probFn
 * @param {Function} impactFn
 * @returns {Array}
 */
export function filterByCell(risks, targetP, targetI, probFn, impactFn) {
  if (targetP == null || targetI == null) return risks;
  return risks.filter(r => {
    const p = Math.min(5, Math.max(1, Math.round(probFn(r))));
    const i = Math.min(5, Math.max(1, Math.round(impactFn(r))));
    return p === targetP && i === targetI;
  });
}
