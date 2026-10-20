// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './Th.module.css';

/**
 * Shared table header cell — the canonical mono/uppercase column header used
 * across the action, risk and SIRO list tables. `center` centres the label
 * (e.g. numeric C/I/A columns).
 */
export function Th({ children, center }) {
  return (
    <th className={`${styles.th} ${center ? styles.thCenter : ''}`}>{children}</th>
  );
}
