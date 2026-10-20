// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './ControlBadges.module.css';
import { OBJECTIVE_STATUS } from '../utils/objectiveStatus';

const FRAMEWORK_LABELS = {
  iso27001: 'ISO',
  cis_v8:   'CIS',
  nist_csf: 'NIST',
  custom:   'CUSTOM',
};

const APPLICABILITY_TIPS = {
  baseline: 'Part of the mandatory minimum control set — applies to all systems regardless of risk profile.',
  specific:  'Applied in response to a specific risk — supplements the baseline control set.',
};

// The objective's DERIVED status (v124) — see utils/objectiveStatus.js.
const TONE_CLASS = {
  good:      styles.statusActive,
  attention: styles.statusUnderReview,
  neutral:   styles.statusPlanned,
  muted:     styles.statusNotApplicable,
};

// `label` is the standard's registered name, for standards loaded after this map
// was written; without it an unknown code would show raw.
export function FrameworkRef({ framework, frameworkRef, label }) {
  return (
    <span className={styles.refCell}>
      <span className={styles.frameworkBadge}>
        {FRAMEWORK_LABELS[framework] ?? label ?? framework ?? '—'}
      </span>
      <span className={styles.refCode}>{frameworkRef || '—'}</span>
    </span>
  );
}

export function TypePill({ type }) {
  if (!type) return null;
  return (
    <span className={`${styles.typePill} ${styles[`type_${type}`] ?? ''}`}>
      {type}
    </span>
  );
}

export function StatusPill({ status }) {
  const s = OBJECTIVE_STATUS[status];
  return (
    <span className={`${styles.statusPill} ${s ? TONE_CLASS[s.tone] : ''}`} title={s?.hint}>
      {s?.label ?? status ?? '—'}
    </span>
  );
}

export function EffectivenessDots({ value }) {
  if (value === null || value === undefined) {
    return <span className={styles.unrated}>— unrated</span>;
  }
  return (
    <span className={styles.dots} title={`${value}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < value ? styles.dotFilled : styles.dotEmpty} />
      ))}
    </span>
  );
}

export function ApplicabilityBadge({ isBaseline }) {
  const label = isBaseline ? 'Baseline' : 'Specific';
  const tip   = isBaseline ? APPLICABILITY_TIPS.baseline : APPLICABILITY_TIPS.specific;
  return (
    <span className={`${styles.applicabilityBadge} ${isBaseline ? styles.applicabilityBaseline : styles.applicabilitySpecific}`}>
      {label}
      <span className={styles.tooltip}>{tip}</span>
    </span>
  );
}
