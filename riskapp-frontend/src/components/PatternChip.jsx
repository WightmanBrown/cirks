// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './PatternChip.module.css';

// One chip wherever a pattern appears, so the three kinds are recognised at a
// glance (owner, 2026-10-06). Each kind has its own colour AND its own tiny
// graph, so the chip still reads icon-only and without colour vision:
//   template — a hub with empty slots to fill          (blue)
//   solution — three parts, each connected to the rest (green)
//   pattern  — one build fanning out to its components (violet)
const KINDS = {
  template: {
    label: 'Template', full: 'Systems architecture template',
    glyph: (<>
      <path d="M8 8 8 3M8 8 3.5 11.5M8 8 12.5 11.5" />
      <circle className={styles.node} cx="8" cy="8" r="1.8" />
      <circle className={styles.slot} cx="8" cy="3" r="1.6" />
      <circle className={styles.slot} cx="3.5" cy="11.5" r="1.6" />
      <circle className={styles.slot} cx="12.5" cy="11.5" r="1.6" />
    </>),
  },
  solution: {
    label: 'Security solution', full: 'Security solution',
    glyph: (<>
      <path d="M8 3.5 3.5 12 12.5 12Z" />
      <circle className={styles.node} cx="8" cy="3.5" r="1.8" />
      <circle className={styles.node} cx="3.5" cy="12" r="1.8" />
      <circle className={styles.node} cx="12.5" cy="12" r="1.8" />
    </>),
  },
  pattern: {
    label: 'Architecture pattern', full: 'System architecture pattern',
    glyph: (<>
      <path d="M8 3.5 3 12M8 3.5 8 12M8 3.5 13 12" />
      <circle className={styles.node} cx="8" cy="3.5" r="1.9" />
      <circle className={styles.node} cx="3" cy="12" r="1.5" />
      <circle className={styles.node} cx="8" cy="12" r="1.5" />
      <circle className={styles.node} cx="13" cy="12" r="1.5" />
    </>),
  },
};

/**
 *   <PatternChip kind="solution" />            icon + "Security solution"
 *   <PatternChip kind="pattern" iconOnly />    icon alone, named for assistive tech
 */
export function PatternChip({ kind, iconOnly = false }) {
  const k = KINDS[kind];
  if (!k) return null;
  return (
    <span className={`${styles.chip} ${styles[kind]} ${iconOnly ? styles.iconOnly : ''}`}
      title={k.full} {...(iconOnly ? { role: 'img', 'aria-label': k.full } : {})}>
      <svg className={styles.glyph} viewBox="0 0 16 16" aria-hidden="true">{k.glyph}</svg>
      {!iconOnly && k.label}
    </span>
  );
}
