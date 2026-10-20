// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The PPITF component types, and what to call them.
//
// The stored value `information` is kept, but it is shown as "Policies &
// documents" (owner's decision, 2026-09-29). PPITF's "I" had come to mean two
// different things: for a SYSTEM it is the business information it holds —
// information assets, rated and owned by an IAO (Business Architecture). For a
// CONTROL it is the documented information that delivers it — policies,
// standards, procedures (ISO 27001 clause 7.5). This type is the second; calling
// it "Information" put it next to the first and made it impossible to find.

export const COMPONENT_TYPES = ['people', 'process', 'information', 'technology', 'facility'];

// Headings, filters, badges.
export const COMPONENT_TYPE_LABEL = {
  people:      'People',
  process:     'Process',
  information: 'Policies & documents',
  technology:  'Technology',
  facility:    'Facility',
};

// The one-word tag shown inline beside a component's name.
const SHORT = { information: 'document' };

export const componentTypeLabel = (t) => COMPONENT_TYPE_LABEL[t] || t;
export const componentTypeShort = (t) => SHORT[t] || t;
export const COMPONENT_TYPE_OPTIONS = COMPONENT_TYPES.map(value => ({ value, label: COMPONENT_TYPE_LABEL[value] }));

// ── Status words ──────────────────────────────────────────────────────────────
// Stored as the one component_status enum, so coverage, findings and the
// catalogue treat every component alike. A policy or document is shown in the
// words its owners use (owner, 2026-09-29):
//   Published    = operational  — in force
//   Under review = degraded     — in force, not confirmed current
//   Not published= planned      — not in force; reads as missing
// `missing` is the per-system reading of "not there" (v_component_presence).
const STATUS_LABEL = {
  operational: 'Operational', degraded: 'Degraded', planned: 'Planned',
  decommissioned: 'Decommissioned', unknown: 'Unknown', missing: 'Missing',
};
const DOCUMENT_STATUS_LABEL = {
  operational: 'Published', degraded: 'Under review', planned: 'Not published',
  decommissioned: 'Withdrawn', unknown: 'Unknown', missing: 'Not published',
};

export function componentStatusLabel(type, status) {
  const map = type === 'information' ? DOCUMENT_STATUS_LABEL : STATUS_LABEL;
  return map[status] || status || 'Unknown';
}

// The states offered when editing a component of this type. Only real
// component_status values — the forms used to offer "non_operational", which
// the database refuses.
export function componentStatusOptions(type) {
  const values = type === 'information'
    ? ['unknown', 'operational', 'degraded', 'planned']
    : ['unknown', 'operational', 'degraded', 'planned', 'decommissioned'];
  return values.map(value => ({ value, label: componentStatusLabel(type, value) }));
}
