// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './PatternFitChips.module.css';

// One chip per slot of a solution's (v176) or system's (v177) pattern: ✓ recorded, ! degraded or
// not yet in place, ✗ required and missing, — not needed, ○ optional and not
// recorded. The mark and the words carry the meaning, not only the colour.
const MARK = { complete: '✓', recorded: '✓', degraded: '!', not_in_place: '!', missing: '✗', not_needed: '—', not_recorded: '○' };
const SUFFIX = { degraded: ' degraded', not_in_place: ' not in place', not_needed: ' not needed', not_recorded: ' (optional)' };

export function PatternFitChips({ fit }) {
  if (!fit) return null;
  if (fit.state === 'per_supplier') return <span className={styles.note}>Checked per supplier relationship</span>;
  if (fit.state === 'no_pattern') return <span className={styles.note}>No pattern stated</span>;
  return (
    <span className={styles.chips}>
      {fit.slots.map(s => (
        <span key={s.key} className={`${styles.chip} ${styles[s.state] || ''}`}
          title={s.parts.length ? s.parts.map(p => p.name).join(', ') : undefined}>
          {MARK[s.state]} {s.label.toLowerCase()}{SUFFIX[s.state] || ''}
        </span>
      ))}
    </span>
  );
}
