// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Words shared by the SoA register and the objective page, which now edits what
// the register reports (2026-09-22).
export const DRIVERS = ['risk', 'legal', 'regulatory', 'contractual', 'business'];

export const IMPLEMENTATION_STATUSES = [
  { value: 'not_implemented', label: 'Not implemented' },
  { value: 'planned',         label: 'Planned' },
  { value: 'partial',         label: 'Partial' },
  { value: 'implemented',     label: 'Implemented' },
];
export const IMPLEMENTATION_LABEL = Object.fromEntries(IMPLEMENTATION_STATUSES.map(s => [s.value, s.label]));

// How a control is delivered (v127). Exactly one per control; null = not stated.
export const DELIVERY_MODES = [
  { value: 'organisation', label: 'Organisation-wide', hint: 'Delivered once for everyone — e.g. a policy, awareness training for all staff.' },
  { value: 'group',        label: 'For a group',       hint: 'Delivered to a group of people (a people component) — e.g. secure coding for developers.' },
  { value: 'system',       label: 'On each system',    hint: 'Deployed and checked system by system — e.g. MFA, endpoint protection.' },
];
export const DELIVERY_LABEL = Object.fromEntries(DELIVERY_MODES.map(m => [m.value, m.label]));
