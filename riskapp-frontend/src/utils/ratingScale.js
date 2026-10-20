// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Rating vocabularies for business-mode word chips.
//
// Hard-coded for now. The risk-score bands (labels + thresholds) are intended
// to become admin/CISO-configurable later; impact and probability are fixed
// 1:1 labels for the 1–5 scale (no thresholds — one word per integer).
//
// Words are deliberately distinct between scales: impact uses severity words,
// probability uses expected frequency, and no impact/probability word reuses a
// risk-band word (so "Critical" never means two things at once).

// Impact severity, value 1–5 (index 0 → value 1).
export const IMPACT_WORDS = ['Minimal', 'Minor', 'Moderate', 'Major', 'Severe'];

// Expected FREQUENCY, value 1–5. Replaced the ISO 31000 likelihood ladder
// ('Rare' … 'Almost Certain') on 2026-08-24.
//
// Verbal likelihood is not falsifiable: two analysts asked whether something is
// "Possible" or "Likely" reliably disagree and neither can be shown wrong. A
// frequency can be checked against the incident log, and it makes a control's
// effect a claim you can challenge — "this takes interception from Annual to
// less-than-decadal" rather than "from Possible to Rare".
//
// The outer two carry '<' and '>' because the scale has to absorb its tails:
// a 1-in-50-year flood is not "once a decade", and daily port scans are not
// "monthly". The symbols qualify HOW OFTEN, so they run the same way as the
// scale — '<' at the bottom, '>' at the top.
//
// The steps are logarithmic (~3–4× per rung), not linear. That is normal for an
// ordinal scale but worth knowing: risk score = impact × frequency is an
// ordinal product, not arithmetic with units.
//
// The UI label stays "Probability" deliberately (decided 2026-08-24). The values
// are frequencies, so "Frequency" would be more literal — but "Probability" is
// the term risk practitioners and ISO 27001 readers expect in that column, and
// the words themselves say what is meant. Not worth a ten-file rename or a
// column rename in the DB (`probability_c/i/a` stay).
export const PROBABILITY_WORDS = ['< Decadal', 'Triennial', 'Annual', 'Quarterly', '> Monthly'];

// Risk score (1–25) bands. `min` is the inclusive lower bound on the score;
// `level` matches the colour-band name in riskColors.js / riskColors.module.css.
export const RISK_BANDS = [
  { level: 'low',          label: 'Low',          min: 1 },
  { level: 'medium',       label: 'Medium',       min: 6 },
  { level: 'high',         label: 'High',         min: 12 },
  { level: 'critical',     label: 'Critical',     min: 20 },
  { level: 'catastrophic', label: 'Catastrophic', min: 25 },
];

function word1to5(words, v) {
  if (v == null || Number.isNaN(v)) return null;
  const i = Math.round(v);
  return i >= 1 && i <= 5 ? words[i - 1] : null;
}

export function impactWord(v)      { return word1to5(IMPACT_WORDS, v); }
export function probabilityWord(v) { return word1to5(PROBABILITY_WORDS, v); }

// The word ALONE is ambiguous. "Major" and "Moderate" are neighbours that read
// as near-synonyms in English, and nothing in the word says how far up a
// five-point scale it sits — so two readers can agree on the label and disagree
// about the severity. Showing the position removes that: "Major (4)" is the
// same claim, checkable.
//
// This is not a retreat to expert mode. Expert view shows the number ALONE,
// which assumes the reader knows what 4 means on this scale; business view shows
// the word and its position, which teaches the scale as it goes.
//
// Deliberately NOT applied to the risk-score bands: those map to RANGES of a
// 1–25 score (High is 12–19), so a single number would be a lie. `riskLabel`
// below pairs the band with the actual score instead, which is the equivalent
// move for a banded scale.
function withValue(word, v) {
  return word == null ? null : `${word} (${v})`;
}

export function impactLabel(v)      { return withValue(impactWord(v), v); }
export function probabilityLabel(v) { return withValue(probabilityWord(v), v); }

/** The full 1–5 ladder, each rung labelled with its position. */
export function scaleLabels(scale) {
  const words = scale === 'impact' ? IMPACT_WORDS
              : scale === 'probability' ? PROBABILITY_WORDS : [];
  return words.map((w, i) => `${w} (${i + 1})`);
}

// Control maturity (COBIT), value 1–5.
export const MATURITY_WORDS = ['Initial', 'Repeatable', 'Defined', 'Managed', 'Optimising'];
export function maturityWord(v) { return word1to5(MATURITY_WORDS, v); }

/**
 * Band plus the actual score — "High (14)". The band alone is as ambiguous as an
 * impact word, but a band covers a RANGE, so the honest companion figure is the
 * score itself rather than a position on the ladder.
 */
export function riskLabel(score) {
  const w = riskWord(score);
  return w == null ? null : `${w} (${score})`;
}

/** The score range a band covers, e.g. "12–19" — for the ladder, where there is
 *  no single score to show. The top band is open-ended at 25, the scale's max. */
export function bandRange(level) {
  const i = RISK_BANDS.findIndex(b => b.level === level);
  if (i < 0) return null;
  const lo = RISK_BANDS[i].min;
  const hi = i + 1 < RISK_BANDS.length ? RISK_BANDS[i + 1].min - 1 : 25;
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

// Word for a 1–25 risk score (highest band whose `min` the score reaches).
export function riskWord(score) {
  if (score == null || Number.isNaN(score)) return null;
  let label = null;
  for (const b of RISK_BANDS) if (score >= b.min) label = b.label;
  return label;
}
