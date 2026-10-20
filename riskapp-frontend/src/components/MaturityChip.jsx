// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { maturityColorClass, chipClass, chipWordClass } from '../utils/riskColors';
import { maturityWord } from '../utils/ratingScale';

/**
 * COBIT control-maturity chip (1–5).
 *
 *   variant  'word'   (default) — shows the COBIT label (Initial … Optimising)
 *            'number'           — shows the numeric value
 *
 * Colour is always the same for a given value regardless of variant.
 * Null / out-of-range values render a muted "—" placeholder.
 */
export function MaturityChip({ value, variant = 'word' }) {
  const colorClass = maturityColorClass(value);

  if (value == null || Number.isNaN(Number(value)) || value < 1 || value > 5) {
    return <span className={`${chipClass()} ${colorClass}`}>—</span>;
  }

  const v = Math.round(Number(value));

  if (variant === 'number') {
    return <span className={`${chipClass()} ${colorClass}`}>{v}</span>;
  }

  return (
    <span className={`${chipClass()} ${chipWordClass()} ${colorClass}`}>
      {maturityWord(v) ?? v}
    </span>
  );
}
