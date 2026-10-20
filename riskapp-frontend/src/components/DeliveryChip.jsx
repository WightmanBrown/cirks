// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './StatusPill.module.css';

// How a control is delivered on a system (v145), as a chip that stands out —
// reusing the canonical status-pill look (StatusPill) so "degraded" reads the
// same amber here as a state needing attention does elsewhere (owner, 2026-09-30).
const CHIP = {
  complete:            { label: 'delivered',  cls: styles.statusCompleted },
  degraded:            { label: 'degraded',   cls: styles.statusInProgress },
  incomplete:          { label: 'incomplete', cls: styles.statusOverdue },
  no_pattern_in_place: { label: 'no solution', cls: styles.statusOverdue },
};

export function DeliveryChip({ delivery, title }) {
  const c = CHIP[delivery];
  if (!c) return null;
  return <span className={`${styles.statusPill} ${c.cls}`} title={title}>{c.label}</span>;
}
