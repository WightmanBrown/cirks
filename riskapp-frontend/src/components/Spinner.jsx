// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './Spinner.module.css';

/**
 * Shared three-dot loading spinner. Replaces the per-page copies that were
 * byte-identical in markup but had drifted into two CSS looks:
 *   - tone="amber" (default) — the full-page loading look (amber, pulse)
 *   - tone="muted"           — the inline look (muted grey, bounce)
 */
export function Spinner({ tone = 'amber' }) {
  return (
    <span className={tone === 'muted' ? styles.muted : styles.amber} aria-hidden>
      <span /><span /><span />
    </span>
  );
}
