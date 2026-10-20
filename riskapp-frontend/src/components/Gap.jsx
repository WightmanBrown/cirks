// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './EntitySummaryCard.module.css';

/**
 * Data-gap indicator (amber dot + label) used inside the entity summary cards.
 * Reuses EntitySummaryCard.module.css so the look is identical to the inline
 * copies it replaces in Asset/Service/SystemSummaryCard.
 */
export function Gap({ label }) {
  return (
    <span className={styles.gap} title={`${label} — data gap`}>
      <span className={styles.gapDot} aria-hidden="true" />
      {label}
    </span>
  );
}
