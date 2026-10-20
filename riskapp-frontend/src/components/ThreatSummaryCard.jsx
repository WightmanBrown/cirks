// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { RatingScaleRow } from './RatingScaleRow';
import { RatingChip } from './RatingChip';
import { EntityKind } from './EntityKind';
import styles from './EntitySummaryCard.module.css';

const CATEGORY_LABEL = {
  accidental:    'Accidental',
  deliberate:    'Deliberate',
  environmental: 'Environmental',
};

// Compact read-only summary. Shown in the unfold row on ThreatsPage.
// `openHref` renders the "Open details →" button pointing at /threats/:id.
export function ThreatSummaryCard({ threat, openHref, isExpert = false }) {
  if (!threat) return null;

  const prob1d = Math.max(threat.probability_c ?? 0, threat.probability_i ?? 0, threat.probability_a ?? 0);

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.left}>
          <h2 className={styles.title}>
            {threat.name}<EntityKind kind="threat" />
          </h2>
          <div className={styles.meta}>
            {threat.threat_category && (
              <span className={styles.metaChip}>
                {CATEGORY_LABEL[threat.threat_category] || threat.threat_category}
              </span>
            )}
            {threat.source && (
              <span className={styles.metaChip}>{threat.source}</span>
            )}
            {threat.reference_code && (
              <span className={styles.metaLine}>{threat.reference_code}</span>
            )}
          </div>
        </div>

        <div className={styles.right}>
          {isExpert ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <RatingChip value={threat.probability_c} scale="probability" variant="number" />
              <RatingChip value={threat.probability_i} scale="probability" variant="number" />
              <RatingChip value={threat.probability_a} scale="probability" variant="number" />
            </div>
          ) : (
            <RatingScaleRow value={prob1d} scale="probability" />
          )}
        </div>
      </div>

      {threat.description && (
        <div className={styles.body}>
          <div className={styles.bodyRow}>
            <span className={styles.bodyLabel}>Description</span>
            <span className={styles.bodyValue}>{threat.description}</span>
          </div>
        </div>
      )}

      {openHref && (
        <div className={styles.actions}>
          <Link to={openHref} className={styles.openBtn}>
            Open details →
          </Link>
        </div>
      )}
    </div>
  );
}
