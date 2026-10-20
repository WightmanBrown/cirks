'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './ReadOnlyBadge.module.css';

export function ReadOnlyBadge({ reason = 'Your role has view-only access.' }) {
  return (
    <span className={styles.badge} title={reason} aria-label={`View only: ${reason}`}>
      view only
    </span>
  );
}
