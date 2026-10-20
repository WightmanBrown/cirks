// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './PdcdBadge.module.css';

const PDCD_TYPES = [
  { key: 'preventive', letter: 'P', label: 'Preventive',
    tip: 'Preventive — stops an incident from happening (e.g. access controls, encryption).' },
  { key: 'detective', letter: 'D', label: 'Detective',
    tip: 'Detective — identifies when an incident has occurred (e.g. audit logging, IDS).' },
  { key: 'corrective', letter: 'C', label: 'Corrective',
    tip: 'Corrective — limits damage and restores systems after an incident (e.g. backups, IR).' },
  { key: 'deterrent', letter: 'D', label: 'Deterrent',
    tip: 'Deterrent — discourages a threat actor from attempting an attack (e.g. CCTV signage, warning banners).' },
];

/**
 * Coverage badge for the four control categories.
 *
 * @param {object} counts — { preventive, detective, corrective, deterrent } (numbers)
 * @param {'compact'|'detailed'} variant
 *   compact  — four small lit/dim pips (for list rows)
 *   detailed — four pips with type label + count (for the detail page)
 */
export function PdcdBadge({ counts = {}, variant = 'compact' }) {
  return (
    <span className={`${styles.badge} ${variant === 'detailed' ? styles.detailed : styles.compact}`}>
      {PDCD_TYPES.map(t => {
        const n = counts[t.key] ?? 0;
        const lit = n > 0;
        return (
          <span
            key={t.key}
            className={`${styles.pip} ${lit ? styles.pipLit : styles.pipDim}`}
            title={`${t.tip}${variant === 'compact' ? ` (${n} linked)` : ''}`}
          >
            <span className={styles.pipLetter}>{t.letter}</span>
            {variant === 'detailed' && (
              <>
                <span className={styles.pipLabel}>{t.label}</span>
                <span className={styles.pipCount}>{n}</span>
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}
