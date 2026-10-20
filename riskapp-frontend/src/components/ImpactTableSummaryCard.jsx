// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { EntityKind } from './EntityKind';
import styles from './EntitySummaryCard.module.css';
import cardStyles from './ImpactTableSummaryCard.module.css';

// Compact read-only summary for the unfold row on ImpactTablesPage.
export function ImpactTableSummaryCard({ table, openHref }) {
  if (!table) return null;

  const isOrg = table.scope === 'organisation';
  const published = !!table.published_at;

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.left}>
          <h2 className={styles.title}>
            {table.name}<EntityKind kind="impact table" />
          </h2>
          <div className={styles.meta}>
            <span className={styles.metaChip}>
              {isOrg ? 'Organisation' : 'Department'}
            </span>
            {!isOrg && table.department_name && (
              <span className={styles.metaChip}>{table.department_name}</span>
            )}
            {published
              ? <span className={cardStyles.badgePublished}>Published</span>
              : <span className={cardStyles.badgeDraft}>Draft</span>
            }
            {table.mandatory && (
              <span className={cardStyles.badgeMandatory}>Mandatory</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {table.description && (
          <div className={styles.bodyRow}>
            <span className={styles.bodyLabel}>Description</span>
            <span className={styles.bodyValue}>{table.description}</span>
          </div>
        )}
        <div className={styles.bodyRow}>
          <span className={styles.bodyLabel}>Status</span>
          <span className={styles.bodyValue}>
            {published
              ? `Published ${new Date(table.published_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
              : 'Draft — not yet published'}
          </span>
        </div>
      </div>

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
