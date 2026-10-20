// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// How completely has an information asset been rated?
//
// A MANDATORY impact table applies to every asset — no exemptions (decision
// 2026-09-16, docs/reporting-requirements.md). So completeness is a count
// against a fixed denominator, not a per-asset judgement.
//
// Why this is not cosmetic: `recomputeAssetCia` takes MAX over whatever ratings
// happen to exist, so an asset's C/I/A derives from a possibly-partial
// assessment, and that value flows upward — asset → systems.impact_* → every
// risk score on that system. A missing mandatory table can only UNDERSTATE the
// impact. An asset rated against something must therefore not read as simply
// "rated" while a mandatory table is absent: that is the reading which lets an
// understated register look finished.
//
// Enforcement is deliberately soft (same decision): partial saves stay possible,
// and the gap is surfaced rather than blocked. This is the surfacing.

export const COMPLETE   = 'complete';
export const PARTIAL    = 'partial';
export const UNRATED    = 'unrated';
/** No mandatory tables are defined, so "complete" is not a meaningful claim. */
export const NO_MANDATE = 'no_mandate';

/**
 * @param {object} a  an asset row carrying mandatory_tables_total /
 *                    mandatory_tables_rated / rated_tables_total
 * @returns {{state: string, missing: number, label: string|null, short: string|null}}
 */
export function ratingCompleteness(a = {}) {
  const total  = Number(a.mandatory_tables_total ?? 0);
  const rated  = Number(a.mandatory_tables_rated ?? 0);
  const anyRat = Number(a.rated_tables_total ?? 0) > 0;

  if (total === 0) {
    // Nothing is mandatory, so the only honest distinction left is rated or not.
    return anyRat
      ? { state: NO_MANDATE, missing: 0, label: null, short: null }
      : { state: UNRATED, missing: 0, label: 'Not yet rated', short: 'unrated' };
  }

  const missing = Math.max(0, total - rated);
  if (missing === 0) return { state: COMPLETE, missing: 0, label: null, short: null };

  // Deliberately separate states. "Never rated" is untouched backlog; "partial"
  // is an asset somebody believed they had finished, which is the more
  // dangerous of the two and the reason the two are not merged.
  if (!anyRat) {
    return { state: UNRATED, missing, label: 'Not yet rated', short: 'unrated' };
  }
  return {
    state: PARTIAL,
    missing,
    label: `Not fully rated — ${missing} mandatory impact table${missing === 1 ? '' : 's'} missing`,
    short: `${missing} mandatory missing`,
  };
}
