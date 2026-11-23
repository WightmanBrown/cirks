// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Test fixtures: S2 as GET /architecture/system-patterns returns it, and two
// Misty Isles systems against it — HR System (complete) and Billing and meter
// reading (no service recorded).
export const S2 = {
  code: 'S2', name: 'Supplier-run service', systems: 2,
  summary: 'A service the supplier runs from top to bottom.', complete_when: 'the service, the supplier and sign-in are recorded',
  variants: 'Also in our own tenancy of a supplier’s service.',
  slots: [
    { key: 'service', label: 'The service', kind: 'Technology · service', hint: 'the product', position: 'centre', required: true, fill: 'explicit', types: ['technology'] },
    { key: 'administrators', label: 'Who administers our settings', kind: 'People · administrators', hint: 'admin accounts', position: 'top', required: false, fill: 'explicit', types: ['people'], arrow: { dir: 'in', label: 'configure our settings' } },
    { key: 'supplier', label: 'Supplier', kind: 'Supplier · relationship', hint: 'runs it', position: 'left', required: true, fill: 'supplier', arrow: { dir: 'in', label: 'runs it' } },
    { key: 'sign_in', label: 'Sign-in', kind: 'Technology · identity', hint: 'theirs or ours', position: 'right', required: true, fill: 'group', arrow: { dir: 'out', label: 'signs in through' } },
    { key: 'network', label: 'Reached over', kind: 'Technology · network', hint: 'the internet', position: 'bottom', required: true, fill: 'group', arrow: { dir: 'out', label: 'reached over' } },
  ],
};

const slot = (key, label, required, fill, parts) => ({ key, label, required, fill, state: parts.length ? 'recorded' : required ? 'missing' : 'not_recorded', parts });
const part = (id, name, stated = false) => ({ id, name, component_type: 'technology', stated });

export const HR_FIT = {
  pattern: 'S2', state: 'complete', missing: [], also: [],
  slots: [
    slot('service', 'The service', true, 'explicit', [part('c-hr', 'PeopleFirst HR', true)]),
    slot('administrators', 'Who administers our settings', false, 'explicit', []),
    slot('supplier', 'Supplier', true, 'supplier', [{ id: 's-hr', name: 'PeopleFirst HR', component_type: 'supplier', stated: false }]),
    slot('sign_in', 'Sign-in', true, 'group', [part('c-si', 'Supplier-managed sign-in')]),
    slot('network', 'Reached over', true, 'group', [part('c-net', 'External internet')]),
  ],
};

export const BILLING_FIT = {
  ...HR_FIT, state: 'incomplete', missing: ['The service'],
  slots: HR_FIT.slots.map(s => (s.key === 'service' ? { ...s, state: 'missing', parts: [] } : s)),
};
