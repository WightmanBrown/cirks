// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './FilterChip.module.css';

// THE chip naming the box in a picture whose records are listed beneath
// (relation diagrams, owner 2026-11-19): in the box's colour, with × to fold the
// list away. No counts: the box in the picture carries them. With no `stripe`
// (List all, no box chosen) it is uncoloured.
export function FilterChip({ words, stripe, onClose }) {
  return (
    <p className={styles.line} role="status">
      <span className={styles.chip} style={stripe ? {
        borderColor: stripe, background: `color-mix(in srgb, ${stripe} 16%, var(--bg-elevated))` } : undefined}>
        {stripe && <span className={styles.dot} style={{ background: stripe }} aria-hidden="true" />}
        {words}
        <button type="button" className={styles.close} onClick={onClose} aria-label={`Close the list: ${words}`} title="Close the list">×</button>
      </span>
    </p>
  );
}
