// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from './HelpDot';
import styles from './Th.module.css';

/**
 * Shared table header cell — the canonical mono/uppercase column header used
 * across the action, risk and SIRO list tables. `center` centres the label
 * (e.g. numeric C/I/A columns). `helpKey` adds an ⓘ after the label.
 */
export function Th({ children, center, helpKey, helpPlacement = 'bottom' }) {
  return (
    <th className={`${styles.th} ${center ? styles.thCenter : ''}`}>
      {children}
      {helpKey && <HelpDot k={helpKey} placement={helpPlacement} />}
    </th>
  );
}
