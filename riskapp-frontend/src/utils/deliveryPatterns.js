// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Words for security solutions (v145 delivery patterns; the UI name since v147). One vocabulary, so the objective page, the
// system page and the findings say the same thing.

export const PART_LOCATIONS = [
  { value: 'on_system',    label: 'On the system itself',          hint: 'e.g. an agent, a client, a TLS setting — recorded on each system' },
  { value: 'service',      label: 'On a security system',          hint: 'e.g. the console or SOC team, as recorded on the security system that provides them' },
  { value: 'organisation', label: 'Once for the organisation',     hint: 'e.g. a policy or a process — exists once, in its own state' },
];

/**
 * Where a part may be, from its component's scope (v137): a component that
 * exists once per system is on the system itself; one that exists once for the
 * organisation is either once for the organisation or on a security system;
 * unstated, the scope has to be stated first (null).
 */
export function partLocationsFor(component) {
  if (!component?.instantiation) return null;
  if (component.instantiation === 'per_system') return PART_LOCATIONS.filter(l => l.value === 'on_system');
  return PART_LOCATIONS.filter(l => l.value !== 'on_system');
}

export function partWhere(part) {
  if (part.location === 'on_system') return 'on the system';
  if (part.location === 'service') return `on ${part.service_system_name || 'a security system'}`;
  return 'once for the organisation';
}

const DELIVERY = {
  complete:            { label: 'Delivered',                tone: 'good' },
  degraded:            { label: 'Delivered, degraded',      tone: 'warn' },
  incomplete:          { label: 'Solution incomplete',      tone: 'warn' },
  no_pattern_in_place: { label: 'No security solution in place', tone: 'warn' },
};
export const deliveryLabel = (d) => DELIVERY[d]?.label ?? '—';
export const deliveryTone = (d) => DELIVERY[d]?.tone ?? 'muted';

/** One line: "Delivered by CrowdStrike EDR" / "CrowdStrike EDR is missing: Falcon agent". */
export function deliverySentence(d) {
  if (!d || !d.delivery) return null;
  if (d.delivery === 'no_pattern_in_place') return 'No security solution is in place here';
  if (d.pattern_kind === 'supplier') {
    return d.delivery === 'complete'
      ? 'Delivered by the supplier, shown by their current evidence'
      : 'Delivered by the supplier, but no current evidence from them covers it';
  }
  if (d.delivery === 'complete') return `Delivered by ${d.pattern_name}`;
  if (d.delivery === 'degraded') return `Delivered by ${d.pattern_name}, but degraded: ${(d.degraded_parts || []).join(', ')}`;
  return `${d.pattern_name} is not complete — missing: ${(d.missing_parts || []).join(', ')}`;
}
