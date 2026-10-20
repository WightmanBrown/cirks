// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './StatusPill.module.css';

const STATUS_CLASS = {
  planned:     styles.statusPlanned,
  in_progress: styles.statusInProgress,
  completed:   styles.statusCompleted,
  deferred:    styles.statusDeferred,
  cancelled:   styles.statusCancelled,
};

/**
 * Shared security-action status pill. `isOverdue` overrides the status colour
 * with the overdue (red) treatment. Palette is the saturated/weight-700 look
 * chosen as canonical (formerly ActionDetailPage's).
 */
export function StatusPill({ status, isOverdue }) {
  if (isOverdue) {
    return <span className={`${styles.statusPill} ${styles.statusOverdue}`}>overdue</span>;
  }
  const cls = STATUS_CLASS[status] ?? '';
  return <span className={`${styles.statusPill} ${cls}`}>{(status ?? '').replace('_', ' ')}</span>;
}
