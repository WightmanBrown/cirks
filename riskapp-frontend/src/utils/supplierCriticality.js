// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Where a supplier's criticality comes from, in words (owner, 2026-09-30): the
// list shows a figure, and the first question is "why that?". The answer is the
// system the supplier has access to that holds the most important information —
// named, with how the supplier reaches it and on which dimension it is rated.

import { impactLabel } from './ratingScale';

const DIMENSIONS = [['impact_c', 'confidentiality'], ['impact_i', 'integrity'], ['impact_a', 'availability']];

/** The dimensions on which a system reaches the given impact: ['confidentiality', 'integrity']. */
export function dimensionsAt(system, level) {
  return DIMENSIONS.filter(([k]) => system[k] === level).map(([, name]) => name);
}

/** 'a', 'a and b', 'a, b and c' */
export function listWords(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** How the supplier reaches the system, completing "…, which ___". */
export function accessPhrase(r, supplierName, many) {
  switch (r.relationship_type) {
    case 'service_provider':   return `${supplierName} hosts as a service provider (SaaS)`;
    case 'contracted_service': return `${supplierName} operates as a contracted-out service`;
    case 'onshore':            return `${supplierName}'s contractors (${r.component_name}) work on`;
    case 'product':            return `${many ? 'run' : 'runs'} ${supplierName}'s ${r.component_name}`;
    default:                   return `${supplierName} has access to`;
  }
}

/**
 * The supplier's criticality and where it comes from. Ended relationships do not
 * count, as on the list. Returns { level, reasons: [{ relationship, systems, text }] }
 * or { level: null } when no live relationship touches a rated system.
 */
export function criticalityNarrative(supplierName, relationships) {
  const counted = relationships.filter(r => r.status !== 'ended' && r.max_impact != null);
  if (!counted.length) return { level: null, reasons: [] };
  const level = Math.max(...counted.map(r => r.max_impact));
  const reasons = counted.filter(r => r.max_impact === level).map(r => {
    const systems = r.criticality_systems || [];
    const shown = systems.slice(0, 3);
    const others = systems.length - shown.length;
    const many = systems.length > 1;
    let text;
    if (!many) {
      const s = systems[0];
      text = `It comes from ${s?.name ?? 'a system'}, which ${accessPhrase(r, supplierName, false)}`
        + `. The information there is rated ${impactLabel(level)} for ${listWords(s ? dimensionsAt(s, level) : [])}.`;
    } else {
      const names = shown.map(s => `${s.name} (${listWords(dimensionsAt(s, level))})`);
      if (others > 0) names.push(`${others} other system${others === 1 ? '' : 's'}`);
      text = `It comes from ${listWords(names)}, which ${accessPhrase(r, supplierName, true)}. `
        + `Each holds information rated ${impactLabel(level)} on the dimension shown.`;
    }
    return { relationship: r, systems, text };
  });
  return { level, reasons };
}
