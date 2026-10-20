// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { rawColorClass, chipClass } from '../utils/riskColors';
import styles from './CiaBadge.module.css';

/**
 * Compact CIA value chip for table cells.
 *
 *   <CiaBadge value={s.impact_c} />  → "5" pill coloured per value
 *
 * Only the numeric value is rendered — the dimension (C/I/A) must be
 * provided by the surrounding column header. For inline contexts without a
 * column header, use CiaChipGroup (stacked letter-above-value).
 *
 * Colours come from the shared risk palette so impact badges across the app
 * read the same as risk-score chips on the heatmap.
 */
export function CiaBadge({ value }) {
  if (value == null) return <span className={styles.unset}>—</span>;
  return (
    <span className={`${chipClass()} ${rawColorClass(value)} ${styles.badge}`}>
      {value}
    </span>
  );
}
