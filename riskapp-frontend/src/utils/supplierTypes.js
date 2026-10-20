// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The four supplier types (v142, docs/supplier-model.md) and
// what each is recorded against. The type is a property of the RELATIONSHIP, not
// the supplier: one supplier can host a SaaS for us and sell us software.
export const SUPPLIER_TYPES = [
  {
    value: 'onshore', label: 'Onshore contractors',
    short: 'onshore contractors',
    hint: 'People working inside the business on our equipment — recorded against the people component they are.',
    system: 'none', componentTypes: ['people'], componentRequired: true,
  },
  {
    value: 'contracted_service', label: 'Contracted-out service',
    short: 'contracted-out service',
    hint: 'A company that operates one of our systems — recorded against the system, and optionally the people or process that operates it.',
    system: 'required', componentTypes: ['people', 'process'], componentRequired: false,
  },
  {
    value: 'service_provider', label: 'Service provider (SaaS)',
    short: 'service provider',
    hint: 'Runs a system on our behalf — the SaaS is a system in our register, and this is recorded against it.',
    system: 'required', componentTypes: [], componentRequired: false,
  },
  {
    value: 'product', label: 'Software / hardware supplier',
    short: 'product supplier',
    hint: 'The origin of a technology component — recorded against that component.',
    system: 'none', componentTypes: ['technology'], componentRequired: true,
  },
];

const BY_VALUE = Object.fromEntries(SUPPLIER_TYPES.map(t => [t.value, t]));
export const supplierType = (value) => BY_VALUE[value] || null;
export const supplierTypeLabel = (value) => BY_VALUE[value]?.label ?? value;

export const SUPPLIER_STATUSES = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'active',   label: 'Active' },
  { value: 'exiting',  label: 'Exiting' },
  { value: 'ended',    label: 'Ended' },
];
export const supplierStatusLabel = (value) =>
  SUPPLIER_STATUSES.find(s => s.value === value)?.label ?? value;

// What a relationship touches, in words: "hosts Payroll", "Falcon agent".
export function supplierTouches(r) {
  const parts = [];
  if (r.system_name) parts.push(r.system_name);
  if (r.component_name) parts.push(r.component_name);
  return parts.join(' · ') || '—';
}

// A DATE as the server sends it ('2028-01-01', text — see RELATIONSHIP_SELECT),
// shown without passing through a local-time Date, which shifts it a day in BST.
export function fmtDay(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}
