// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A control objective's status — DERIVED on the server (v_control_status, v124)
// from its SoA entry and its maturity rating, never stored. One vocabulary here so
// every badge, pill, filter and count uses the same words.
//
// `tone` picks the existing colour class in each component's own stylesheet:
// good (green) · attention (amber) · neutral · muted.
export const OBJECTIVE_STATUSES = [
  { value: 'adopted',        label: 'Adopted',        tone: 'good',      hint: 'Adopted in the SoA, and its maturity has been rated.' },
  { value: 'not_assessed',   label: 'Not assessed',   tone: 'attention', hint: 'Adopted in the SoA; its maturity has not been rated yet.' },
  { value: 'not_decided',    label: 'Not decided',    tone: 'neutral',   hint: 'Nobody has yet decided in the SoA whether it applies.' },
  { value: 'not_applicable', label: 'Not applicable', tone: 'muted',     hint: 'Judged not applicable in the SoA.' },
];

export const OBJECTIVE_STATUS = Object.fromEntries(OBJECTIVE_STATUSES.map(s => [s.value, s]));
