// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { scoreColorClass, rawColorClass, chipClass, chipWordClass } from '../utils/riskColors';
import { impactLabel, probabilityLabel, riskLabel } from '../utils/ratingScale';

/**
 * Severity chip for impact / probability / risk values.
 *
 *   scale    'impact' | 'probability'  → 1–5 value, coloured via rawLevel
 *            'risk'                     → 1–25 score, coloured via scoreLevel
 *   variant  'number' (expert view)    → shows the numeric value alone
 *            'word'   (business view)  → the word AND its value, e.g. "Major (4)"
 *
 * Business view carries the number because the word alone is ambiguous: "Major"
 * and "Moderate" read as near-synonyms, and nothing in either says how far up a
 * five-point scale it sits. For a risk score the companion figure is the score
 * itself, since a band covers a range.
 *
 * Colour is always the same for a given value regardless of variant, so a
 * business "SEVERE" chip and an expert "5" chip read identically.
 */
export function RatingChip({ value, scale, variant = 'word' }) {
  const colorClass = scale === 'risk' ? scoreColorClass(value) : rawColorClass(value);

  if (value == null || Number.isNaN(value) || value <= 0) {
    return <span className={`${chipClass()} ${colorClass}`}>—</span>;
  }

  if (variant === 'number') {
    return <span className={`${chipClass()} ${colorClass}`}>{value}</span>;
  }

  const label =
    scale === 'impact'      ? impactLabel(value)      :
    scale === 'probability' ? probabilityLabel(value) :
                              riskLabel(value);

  return (
    <span className={`${chipClass()} ${chipWordClass()} ${colorClass}`}>
      {label ?? value}
    </span>
  );
}
