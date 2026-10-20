// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './ControlStatusPill.module.css';
import { OBJECTIVE_STATUS } from '../utils/objectiveStatus';

// The objective's DERIVED status (v124) — see utils/objectiveStatus.js.
const TONE_CLASS = {
  good:      styles.active,
  attention: styles.underReview,
  neutral:   styles.planned,
  muted:     styles.notApplicable,
};

export function ControlStatusPill({ status }) {
  const s = OBJECTIVE_STATUS[status];
  if (!s) return null;
  return <span className={`${styles.pill} ${TONE_CLASS[s.tone]}`} title={s.hint}>{s.label}</span>;
}
