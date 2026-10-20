// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { EntityKind } from './EntityKind';
import { Gap } from './Gap';
import { RatingChip } from './RatingChip';
import { maxCia } from '../utils/cia';
import styles from './EntitySummaryCard.module.css';

// Expert view shows per-dimension C/I/A numbers. (Business view collapses to a
// single max-impact word — see below.)
function CiaCellChip({ value }) {
  return (
    <span className={styles.ciaCellChip}>
      <RatingChip value={value} scale="impact" variant="number" />
    </span>
  );
}

/**
 * CIA display for the system and service summary cards.
 *
 * - Business view: a single descriptive word for the MAX impact across C/I/A
 *   (matches the list pages' single "Impact" column).
 * - Expert view: the contribution grid — the entity's derived C/I/A on top,
 *   then one row per linked information asset (same grid so columns align).
 *
 * `assets === null` means "not loaded yet"; `[]` shows the `emptyLabel` gap.
 */
export function CiaContributionTable({ topLabel = 'Maximum impact', c, i, a, assets, emptyLabel, isExpert = true }) {
  if (!isExpert) {
    return (
      <div className={styles.ciaMaxLine}>
        <span className={styles.ciaMaxLabel}>{topLabel}</span>
        <RatingChip value={maxCia(c, i, a)} scale="impact" variant="word" />
      </div>
    );
  }

  return (
    <div className={styles.ciaTable}>
      <div className={styles.ciaTableHeader}>
        <span />
        <span className={styles.ciaColLabel}>C</span>
        <span className={styles.ciaColLabel}>I</span>
        <span className={styles.ciaColLabel}>A</span>
      </div>

      <div className={`${styles.ciaTableRow} ${styles.ciaTableRowSystem}`}>
        <span className={styles.ciaRowName}>{topLabel}</span>
        <CiaCellChip value={c} />
        <CiaCellChip value={i} />
        <CiaCellChip value={a} />
      </div>

      {assets === null ? (
        <span className={styles.ciaEmpty}>Open details to see contributing assets.</span>
      ) : assets.length === 0 ? (
        <Gap label={emptyLabel} />
      ) : (
        assets.map(ia => (
          <div key={ia.id} className={styles.ciaTableRow}>
            <span className={`${styles.ciaRowName} ${styles.ciaRowNameMuted}`}>{ia.name}<EntityKind kind="information asset" /></span>
            <CiaCellChip value={ia.confidentiality} />
            <CiaCellChip value={ia.integrity} />
            <CiaCellChip value={ia.availability} />
          </div>
        ))
      )}
    </div>
  );
}
