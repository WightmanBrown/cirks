// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { maturityColorClass, chipClass, chipWordClass } from '../utils/riskColors';
import { maturityWord, maturityScaleText } from '../utils/ratingScale';

/**
 * THE way to show a control's effectiveness (COBIT maturity levels, 1–5). The row of amber dots it
 * sat beside said nothing about what it meant and is gone (owner, 2026-11-23).
 *
 *   variant  'word'   (default) — the number and its word: "3 Defined"
 *            'number'           — the number alone, where space is short
 *
 * Every chip carries a mouseover giving the whole scale, one sentence a level,
 * with its own level marked. Colour is the same for a value in either variant.
 * No rating renders a muted "Not rated" ("—" in the number variant).
 */
export function MaturityChip({ value, variant = 'word' }) {
  const colorClass = maturityColorClass(value);

  if (value == null || Number.isNaN(Number(value)) || value < 1 || value > 5) {
    return (
      <span className={`${chipClass()} ${variant === 'word' ? chipWordClass() : ''} ${colorClass}`}
            title={`Not yet rated.\n${maturityScaleText()}`}>
        {variant === 'word' ? 'Not rated' : '—'}
      </span>
    );
  }

  const v = Math.round(Number(value));
  const title = maturityScaleText(v);

  if (variant === 'number') {
    return <span className={`${chipClass()} ${colorClass}`} title={title}>{v}</span>;
  }

  return (
    <span className={`${chipClass()} ${chipWordClass()} ${colorClass}`} title={title}>
      {v} {maturityWord(v) ?? ''}
    </span>
  );
}
