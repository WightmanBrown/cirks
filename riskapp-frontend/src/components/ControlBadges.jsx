// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './ControlBadges.module.css';
import { OBJECTIVE_STATUS } from '../utils/objectiveStatus';

const FRAMEWORK_LABELS = {
  cirks:    'CIRKS',
  iso27001: 'ISO',
  cis_v8:   'CIS',
  nist_csf: 'NIST',
  custom:   'CUSTOM',
};

// Where an objective applies: the Statement of Applicability's answer, derived
// by the API (v185, owner 2026-11-23). It replaced the typed Baseline/Specific
// flag, which disagreed with the SoA on almost every objective.
const APPLICABILITY = {
  organisation:   { label: 'Whole organisation', tip: 'Adopted in the Statement of Applicability for the whole organisation, so it applies to every system.' },
  scopes:         { label: 'In scopes',          tip: 'Adopted in the Statement of Applicability only in named scopes, so it applies to the systems in them' },
  not_applicable: { label: 'Not applicable',     tip: 'Ruled not applicable in the Statement of Applicability, with a reason.' },
  not_decided:    { label: 'Not decided',        tip: 'The Statement of Applicability has not yet said whether this objective applies.' },
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

export function ApplicabilityBadge({ applicability, appliesIn = [] }) {
  const a = APPLICABILITY[applicability] || APPLICABILITY.not_decided;
  const names = (appliesIn || []).filter(Boolean);
  const label = applicability === 'scopes' && names.length === 1 ? names[0]
    : applicability === 'scopes' && names.length > 1 ? `${names.length} scopes` : a.label;
  const tip = applicability === 'scopes' ? `${a.tip}: ${names.join(', ') || 'none named'}.` : a.tip;
  return (
    <span className={`${styles.applicabilityBadge} ${applicability === 'organisation' ? styles.applicabilityEverywhere : styles.applicabilityOther}`}>
      {label}
      <span className={styles.tooltip}>{tip}</span>
    </span>
  );
}
