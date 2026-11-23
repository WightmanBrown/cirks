'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// System patterns (owner, 2026-11-10; docs/system-patterns.md).
//
// The eight shapes a business system takes. Six were found by reading the 49
// business systems in the Misty Isles record; S7 (IaaS) and S8 (PaaS) were split
// from S1 so that the applications follow the cloud service models people know
// (on premises, IaaS, PaaS, SaaS; NIST SP 800-145), because who answers for each
// layer is what changes the questions (owner, 2026-11-18). The codes are kept,
// so S7 and S8 come after S6 in code but sit between S1 and S2 in the list. Each is a few SLOTS — the questions a
// system of that shape answers about itself — and a system is complete against
// its pattern when every required slot is answered. A slot is required only
// where something reads the answer (owner, 2026-11-10): the security pattern
// triggers (operating system, hosting, network, sign-in), supplier assurance
// (supplier). Sign-in is required even where it triggers nothing: "no central
// sign-in" is what matters on OT and supplier-run services. Shipped with the
// code, like lib/solutionPatterns.js.
//
// Slot keys are one vocabulary across the patterns: `users` is "Who uses it" on
// an application and "Operators" on dedicated equipment, and the same component
// role answers both. A slot is filled by
//   role       a component recorded on the system that can play the role
//              (control_components.roles, v178);
//   explicit   only a component a person has put in the slot on this system
//              (system_components.slot_key) — the application, the control
//              system, the printed document: nothing else says which one it is;
//   supplier   a live supplier relationship on the system.
// A component a person has put in a slot fills that slot whatever its roles; a
// component with several roles fills each of their slots.
//
// The slots are repeated in SQL (system_pattern_slots(), v178) for the gaps
// view; systemPatterns.integration.test.js holds the two together.
//
// Report only: nothing here changes a status or a score.
//
// `position` places the slot on the diagram (centre, top, bottom, left, right
// and the four corners), and `arrow` joins it to the centre: `out` points from
// the centre to the slot.

const PATTERNS = [
  {
    code: 'S1', name: 'Application on premises',
    summary: 'A business application on servers we own, in a building we run. Our own team installs and patches it, and people sign in to it through our directory. We answer for every layer, from the building to the application.',
    complete_when: 'its operating system, where it runs, its network and how people sign in are recorded: the answers the security pattern triggers read',
    variants: 'Also in colocation (our servers in someone else\'s data centre) or run for us by a managed service provider: the same questions; the building or the support team is then a supplier. On cloud infrastructure it is S7; on a cloud platform, S8.',
    slots: [
      { key: 'application', label: 'The application', kind: 'Technology · application', hint: 'what the business uses',
        position: 'centre', required: false, fill: 'explicit', types: ['technology'] },
      { key: 'operating_system', label: 'Operating system', kind: 'Technology · on the system', hint: 'we patch it',
        position: 'top', required: true, fill: 'role', arrow: { dir: 'out', label: 'runs on' } },
      { key: 'users', label: 'Who uses it', kind: 'People · users', hint: 'a user group',
        position: 'top_left', required: false, fill: 'role', arrow: { dir: 'in', label: 'use it' } },
      { key: 'support_team', label: 'Support team', kind: 'People · team', hint: 'runs and patches it',
        position: 'left', required: false, fill: 'role', arrow: { dir: 'in', label: 'runs it' } },
      { key: 'sign_in', label: 'Sign-in', kind: 'Technology · identity', hint: 'a directory or identity service',
        position: 'right', required: true, fill: 'role', arrow: { dir: 'out', label: 'signs in through' } },
      { key: 'hosting', label: 'Where it runs', kind: 'Facility', hint: 'our server room, or a colocation site',
        position: 'bottom', required: true, fill: 'role', arrow: { dir: 'out', label: 'hosted in' } },
      { key: 'network', label: 'Network', kind: 'Technology · network', hint: 'where it is reached from',
        position: 'bottom_right', required: true, fill: 'role', arrow: { dir: 'out', label: 'connected to' } },
    ],
  },
  {
    code: 'S7', name: 'Application on cloud infrastructure (IaaS)',
    summary: 'A business application on virtual servers we rent from a cloud provider (infrastructure as a service). The provider runs the buildings, the hardware and the physical network; we install and patch the operating system and everything above it.',
    complete_when: 'its operating system, the cloud region it runs in, its network, how people sign in and the cloud provider are recorded',
    variants: 'Containers on servers we patch are IaaS too. Where the provider patches the operating system for us, it is S8.',
    slots: [
      { key: 'application', label: 'The application', kind: 'Technology · application', hint: 'what the business uses',
        position: 'centre', required: false, fill: 'explicit', types: ['technology'] },
      { key: 'operating_system', label: 'Operating system', kind: 'Technology · on the system', hint: 'we patch it',
        position: 'top', required: true, fill: 'role', arrow: { dir: 'out', label: 'runs on' } },
      { key: 'users', label: 'Who uses it', kind: 'People · users', hint: 'a user group',
        position: 'top_left', required: false, fill: 'role', arrow: { dir: 'in', label: 'use it' } },
      { key: 'support_team', label: 'Support team', kind: 'People · team', hint: 'runs and patches it',
        position: 'left', required: false, fill: 'role', arrow: { dir: 'in', label: 'runs it' } },
      { key: 'sign_in', label: 'Sign-in', kind: 'Technology · identity', hint: 'a directory or identity service',
        position: 'right', required: true, fill: 'role', arrow: { dir: 'out', label: 'signs in through' } },
      { key: 'supplier', label: 'Cloud provider', kind: 'Supplier · relationship', hint: 'runs the buildings and hardware',
        position: 'bottom_left', required: true, fill: 'supplier', arrow: { dir: 'in', label: 'provides the infrastructure' } },
      { key: 'hosting', label: 'Cloud region', kind: 'Facility', hint: 'where the provider runs it',
        position: 'bottom', required: true, fill: 'role', arrow: { dir: 'out', label: 'hosted in' } },
      { key: 'network', label: 'Cloud network', kind: 'Technology · network', hint: 'our virtual network',
        position: 'bottom_right', required: true, fill: 'role', arrow: { dir: 'out', label: 'connected to' } },
    ],
  },
  {
    code: 'S8', name: 'Application on a cloud platform (PaaS)',
    summary: 'A business application we build or configure on a cloud provider\'s platform (platform as a service), such as a managed web app, database or functions service. The provider runs and patches the operating system; we answer for the application, its settings and who can sign in.',
    complete_when: 'the cloud region it runs in, how it is reached, how people sign in and the platform provider are recorded. There is no operating system of ours to ask about',
    variants: 'Serverless functions and managed containers are PaaS too.',
    slots: [
      { key: 'application', label: 'The application', kind: 'Technology · application', hint: 'our code or configuration',
        position: 'centre', required: false, fill: 'explicit', types: ['technology'] },
      { key: 'platform', label: 'Platform service', kind: 'Technology · platform', hint: 'the managed service it runs on',
        position: 'top', required: false, fill: 'explicit', types: ['technology'], arrow: { dir: 'out', label: 'runs on' } },
      { key: 'users', label: 'Who uses it', kind: 'People · users', hint: 'a user group',
        position: 'top_left', required: false, fill: 'role', arrow: { dir: 'in', label: 'use it' } },
      { key: 'support_team', label: 'Support team', kind: 'People · team', hint: 'builds and runs our application',
        position: 'left', required: false, fill: 'role', arrow: { dir: 'in', label: 'runs it' } },
      { key: 'sign_in', label: 'Sign-in', kind: 'Technology · identity', hint: 'a directory or identity service',
        position: 'right', required: true, fill: 'role', arrow: { dir: 'out', label: 'signs in through' } },
      { key: 'supplier', label: 'Platform provider', kind: 'Supplier · relationship', hint: 'runs and patches the platform',
        position: 'bottom_left', required: true, fill: 'supplier', arrow: { dir: 'in', label: 'runs the platform' } },
      { key: 'hosting', label: 'Cloud region', kind: 'Facility', hint: 'where the provider runs it',
        position: 'bottom', required: true, fill: 'role', arrow: { dir: 'out', label: 'hosted in' } },
      { key: 'network', label: 'Reached over', kind: 'Technology · network', hint: 'the internet or our virtual network',
        position: 'bottom_right', required: true, fill: 'role', arrow: { dir: 'out', label: 'reached over' } },
    ],
  },
  {
    code: 'S2', name: 'Software as a service (SaaS)',
    summary: 'A service a supplier runs from top to bottom (software as a service), such as an online product we subscribe to. We control only our own settings and who can sign in; there is no operating system or server room of ours to ask about.',
    complete_when: 'the supplier that runs it, how people sign in and how it is reached are recorded',
    variants: 'Also in our own tenancy of a supplier\'s service: sign-in is our own identity service, and more of our own processes sit around it.',
    slots: [
      { key: 'service', label: 'The service', kind: 'Technology · service', hint: 'the product we subscribe to',
        position: 'centre', required: false, fill: 'explicit', types: ['technology'] },
      { key: 'administrators', label: 'Who administers our settings', kind: 'People', hint: 'admin accounts, sharing, retention',
        position: 'top', required: false, fill: 'explicit', types: ['people'], arrow: { dir: 'in', label: 'configure our settings' } },
      { key: 'users', label: 'Who uses it', kind: 'People · users', hint: 'a user group',
        position: 'top_left', required: false, fill: 'role', arrow: { dir: 'in', label: 'use it' } },
      { key: 'supplier', label: 'Supplier', kind: 'Supplier · relationship', hint: 'runs it under contract',
        position: 'left', required: true, fill: 'supplier', arrow: { dir: 'in', label: 'runs it' } },
      { key: 'sign_in', label: 'Sign-in', kind: 'Technology · identity', hint: 'the supplier\'s own, or ours',
        position: 'right', required: true, fill: 'role', arrow: { dir: 'out', label: 'signs in through' } },
      { key: 'network', label: 'Reached over', kind: 'Technology · network', hint: 'usually the internet',
        position: 'bottom', required: true, fill: 'role', arrow: { dir: 'out', label: 'reached over' } },
    ],
  },
  {
    code: 'S3', name: 'Dedicated equipment and operational technology',
    summary: 'Equipment bought from a vendor to do one job, including operational technology (OT) such as a building, radar or plant control system. It usually sits on its own isolated network at one site, is used by an operations team, and often has local or vendor accounts rather than our directory.',
    complete_when: 'how people sign in, its network and where it is are recorded. Its control system, the computer it runs on, its operators and who maintains it are asked, not required',
    slots: [
      { key: 'control_system', label: 'Control system', kind: 'Technology · vendor product', hint: 'what the operators use',
        position: 'centre', required: false, fill: 'explicit', types: ['technology'] },
      { key: 'operating_system', label: 'Computer it runs on', kind: 'Technology · on the system', hint: 'where there is one we can see',
        position: 'top', required: false, fill: 'role', arrow: { dir: 'out', label: 'runs on' } },
      { key: 'support_team', label: 'Who maintains it', kind: 'People · team', hint: 'our team or the vendor',
        position: 'top_right', required: false, fill: 'role', arrow: { dir: 'in', label: 'maintains it' } },
      { key: 'users', label: 'Operators', kind: 'People · operators', hint: 'an operations team',
        position: 'left', required: false, fill: 'role', arrow: { dir: 'in', label: 'operate it' } },
      { key: 'sign_in', label: 'Accounts', kind: 'Technology · identity', hint: 'local or vendor accounts',
        position: 'right', required: true, fill: 'role', arrow: { dir: 'out', label: 'sign in with' } },
      { key: 'network', label: 'Isolated network', kind: 'Technology · network', hint: 'its own network',
        position: 'bottom', required: true, fill: 'role', arrow: { dir: 'out', label: 'sits on' } },
      { key: 'hosting', label: 'Where it is', kind: 'Facility', hint: 'the site or room',
        position: 'bottom_left', required: true, fill: 'role', arrow: { dir: 'out', label: 'installed in' } },
    ],
  },
  {
    code: 'S4', name: 'End-user device',
    summary: 'A computer people use directly: a laptop, desktop or tablet carrying the standard set of applications. We patch it, people sign in to it, and it is used on our premises or anywhere through the VPN.',
    complete_when: 'the device and its operating system, where it is used, its network and how people sign in are recorded',
    slots: [
      { key: 'operating_system', label: 'Device and operating system', kind: 'Technology · device', hint: 'we patch it',
        position: 'centre', required: true, fill: 'role' },
      { key: 'applications', label: 'Applications', kind: 'Technology · on the device', hint: 'the standard set',
        position: 'top', required: false, fill: 'explicit', types: ['technology'], arrow: { dir: 'out', label: 'carries' } },
      { key: 'support_team', label: 'Support team', kind: 'People · team', hint: 'looks after it',
        position: 'top_right', required: false, fill: 'role', arrow: { dir: 'in', label: 'supports it' } },
      { key: 'users', label: 'Who uses it', kind: 'People · users', hint: 'a user group',
        position: 'left', required: false, fill: 'role', arrow: { dir: 'in', label: 'use it' } },
      { key: 'sign_in', label: 'Sign-in', kind: 'Technology · identity', hint: 'a directory or identity service',
        position: 'right', required: true, fill: 'role', arrow: { dir: 'out', label: 'signs in through' } },
      { key: 'hosting', label: 'Where it is used', kind: 'Facility', hint: 'our premises or anywhere',
        position: 'bottom', required: true, fill: 'role', arrow: { dir: 'out', label: 'used in' } },
      { key: 'network', label: 'Network', kind: 'Technology · network', hint: 'ours, or the internet through the VPN',
        position: 'bottom_right', required: true, fill: 'role', arrow: { dir: 'out', label: 'connects through' } },
    ],
  },
  {
    code: 'S5', name: 'Network infrastructure',
    summary: 'The network other systems sit on: the switches, routers and links at our sites, the operating system they run, and the team or supplier that runs them.',
    complete_when: 'its operating system and the sites it covers are recorded',
    slots: [
      { key: 'equipment', label: 'Network equipment', kind: 'Technology · equipment', hint: 'switches, routers, links',
        position: 'centre', required: false, fill: 'explicit', types: ['technology'] },
      { key: 'operating_system', label: 'Network operating system', kind: 'Technology · on the equipment', hint: 'we patch it',
        position: 'top', required: true, fill: 'role', arrow: { dir: 'out', label: 'runs' } },
      { key: 'support_team', label: 'Who runs it', kind: 'People or supplier', hint: 'our team, a supplier, or both',
        position: 'left', required: false, fill: 'role', arrow: { dir: 'in', label: 'runs it' } },
      { key: 'management', label: 'Managed from', kind: 'Technology · management', hint: 'the management platform',
        position: 'right', required: false, fill: 'explicit', types: ['technology'], arrow: { dir: 'out', label: 'managed from' } },
      { key: 'hosting', label: 'Sites', kind: 'Facility', hint: 'where the equipment is',
        position: 'bottom', required: true, fill: 'role', arrow: { dir: 'out', label: 'installed in' } },
    ],
  },
  {
    code: 'S6', name: 'Document record',
    summary: 'Information kept and used on paper, such as a printed procedure, plan or register. Its copies are kept in known, locked places and tracked in a register of copies. The same shape as the Governing document security solution pattern.',
    complete_when: 'where the copies are kept is recorded. The document, its owner, who uses it and the register of copies are asked, not required',
    slots: [
      { key: 'document', label: 'The document', kind: 'Information · document', hint: 'the controlled copy',
        position: 'centre', required: false, fill: 'explicit', types: ['information'] },
      { key: 'owner', label: 'Owner', kind: 'People · owner', hint: 'keeps it current and reviewed',
        position: 'top', required: false, fill: 'explicit', types: ['people'], arrow: { dir: 'in', label: 'kept current by' } },
      { key: 'users', label: 'Who uses it', kind: 'People · users', hint: 'trained to use it',
        position: 'left', required: false, fill: 'role', arrow: { dir: 'in', label: 'use it' } },
      { key: 'hosting', label: 'Where copies are kept', kind: 'Facility', hint: 'locked, known places',
        position: 'right', required: true, fill: 'role', arrow: { dir: 'out', label: 'kept in' } },
      { key: 'copy_register', label: 'Copy register', kind: 'Information · record', hint: 'which copy is where, which version',
        position: 'bottom', required: false, fill: 'explicit', types: ['information'], arrow: { dir: 'out', label: 'tracked in' } },
    ],
  },
];

const BY_CODE = Object.fromEntries(PATTERNS.map((p) => [p.code, p]));
const patternOf = (code) => BY_CODE[code] || null;
const slotOf = (code, key) => patternOf(code)?.slots.find((s) => s.key === key) || null;
const requiredSlots = (code) => (patternOf(code)?.slots || []).filter((s) => s.required).map((s) => s.key);
// The roles a component can play: every slot key a pattern fills by role, with
// the labels it goes by and the patterns that require it or ask it as optional.
// The same list as chk_component_roles (v178).
const ROLES = (() => {
  const out = new Map();
  for (const p of PATTERNS) {
    for (const s of p.slots) {
      if (s.fill !== 'role') continue;
      if (!out.has(s.key)) out.set(s.key, { key: s.key, labels: [], required_in: [], optional_in: [] });
      const e = out.get(s.key);
      if (!e.labels.includes(s.label)) e.labels.push(s.label);
      (s.required ? e.required_in : e.optional_in).push(p.code);
    }
  }
  return [...out.values()];
})();

/**
 * How a system measures up to its pattern.
 *
 * @param {object} s  { system_pattern, components: [{ id, name, component_type,
 *   slot_key, roles: [the roles it can play] }],
 *   suppliers: [{ id, name }] }
 * @returns {{ pattern, state, slots, also, missing }} state is no_pattern |
 *   complete | incomplete; each slot's state is recorded | missing | not_recorded.
 */
function fitOf(s) {
  const pattern = patternOf(s.system_pattern);
  if (!pattern) return { pattern: null, state: 'no_pattern', slots: [], also: [], missing: [] };
  const filled = Object.fromEntries(pattern.slots.map((slot) => [slot.key, []]));
  const also = [];
  for (const c of s.components || []) {
    const entry = { id: c.id, name: c.name, component_type: c.component_type, stated: false };
    if (c.slot_key && filled[c.slot_key]) {
      filled[c.slot_key].push({ ...entry, stated: true });
      continue;
    }
    // A component with two roles answers both questions (IT Administrators:
    // support team and who uses it).
    const slots = pattern.slots.filter((x) => x.fill === 'role' && (c.roles || []).includes(x.key));
    for (const slot of slots) filled[slot.key].push(entry);
    if (!slots.length) also.push(entry);
  }
  const supplierSlot = pattern.slots.find((x) => x.fill === 'supplier');
  if (supplierSlot) {
    for (const sup of s.suppliers || []) filled[supplierSlot.key].push({ id: sup.id, name: sup.name, component_type: 'supplier', stated: false });
  }
  const slots = pattern.slots.map((slot) => {
    const parts = filled[slot.key];
    const state = parts.length ? 'recorded' : slot.required ? 'missing' : 'not_recorded';
    return { key: slot.key, label: slot.label, required: slot.required, fill: slot.fill, state, parts };
  });
  const missing = slots.filter((x) => x.state === 'missing').map((x) => x.label);
  return { pattern: pattern.code, state: missing.length ? 'incomplete' : 'complete', slots, also, missing };
}

// The questions a system normally answers once (owner, 2026-11-18, decision 24
// in docs/system-patterns.md). A second standard build that answers one again
// (a second operating system, a second place it runs) is applied only once the
// person confirms, because the answer changes which security solutions are
// implied and often means the record should be two systems. Users, support
// teams, networks and sign-in can rightly have several answers. End-user
// devices are used anywhere, network infrastructure spans sites and runs more
// than one vendor's operating system, and a document is kept in many places, so
// those patterns allow several.
const ONE_ANSWER_ROLES = ['operating_system', 'hosting'];
const SEVERAL_ALLOWED = { S4: ['hosting'], S5: ['operating_system', 'hosting'], S6: ['hosting'] };
const DEFAULT_LABEL = { operating_system: 'Operating system', hosting: 'Where it runs' };
function oneAnswerSlots(code) {
  const allowed = SEVERAL_ALLOWED[code] || [];
  return ONE_ANSWER_ROLES
    .filter((key) => !allowed.includes(key))
    .filter((key) => !patternOf(code) || slotOf(code, key))
    .map((key) => ({ key, label: slotOf(code, key)?.label || DEFAULT_LABEL[key] }));
}

/**
 * Where applying a build would give a system a second answer to a question it
 * normally answers once.
 *
 * @param {string|null} code   the system's pattern
 * @param {Array} recorded     the system's components { id, name, slot_key, roles }
 * @param {Array} adding       the build's components not yet on the system { id, name, roles }
 * @returns {Array<{ slot, label, recorded: [{id,name}], adding: [{id,name}] }>}
 */
function buildOverlaps(code, recorded, adding) {
  const out = [];
  for (const { key, label } of oneAnswerSlots(code)) {
    // As fitOf: a component placed in a slot by hand answers that slot only.
    const has = recorded.filter((c) => (c.slot_key ? c.slot_key === key : (c.roles || []).includes(key)));
    const more = adding.filter((c) => (c.roles || []).includes(key));
    if (has.length && more.length) {
      out.push({ slot: key, label,
        recorded: has.map(({ id, name }) => ({ id, name })), adding: more.map(({ id, name }) => ({ id, name })) });
    }
  }
  return out;
}

module.exports = { PATTERNS, ROLES, patternOf, slotOf, requiredSlots, fitOf, oneAnswerSlots, buildOverlaps };
