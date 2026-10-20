// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './EntityKind.module.css';

/**
 * Muted "- <kind>" suffix for entity titles. Use on every detail-page h1
 * and on every summary-card title so the user can always identify what
 * kind of thing they are looking at.
 *
 *   <h1>{asset.name}<EntityKind kind="information asset" /></h1>
 */
export function EntityKind({ kind }) {
  return <span className={styles.kind}>- {kind}</span>;
}
