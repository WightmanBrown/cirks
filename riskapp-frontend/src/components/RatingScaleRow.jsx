// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RISK_BANDS, riskWord, scaleLabels, bandRange } from '../utils/ratingScale';
import { RatingChip } from './RatingChip';
import styles from './RatingScaleRow.module.css';


/**
 * The full word ladder for a scale, shown as a row of muted chips with the
 * selected level lit in its severity colour. Anchors a business-view word
 * (e.g. "Major (4)") in its sequence so the reader sees how far up the scale it
 * is. Every rung carries its position, and the risk bands carry the score RANGE
 * they cover — the ladder is where a reader learns what the words mean, so
 * leaving the unselected rungs bare would withhold exactly that. Read-only — not an input.
 *
 *   scale 'impact' | 'probability'  → value is 1–5 (index = value)
 *   scale 'risk'                    → value is a 1–25 score, banded into the
 *                                     five RISK_BANDS labels.
 */
export function RatingScaleRow({ value, scale }) {
  if (scale === 'risk') {
    const selected = riskWord(value);
    return (
      <span className={styles.row} role="img" aria-label={selected ? `${selected} risk` : 'risk not set'}>
        {RISK_BANDS.map(band =>
          band.label === selected
            ? <RatingChip key={band.level} value={value} scale="risk" variant="word" />
            : <span key={band.level} className={styles.muted}>
                {band.label} ({bandRange(band.level)})
              </span>
        )}
      </span>
    );
  }

  const words = scaleLabels(scale);
  return (
    <span className={styles.row} role="img" aria-label={`${value} of ${words.length}`}>
      {words.map((word, idx) => {
        const v = idx + 1;
        return v === value
          ? <RatingChip key={v} value={v} scale={scale} variant="word" />
          : <span key={v} className={styles.muted}>{word}</span>;
      })}
    </span>
  );
}
