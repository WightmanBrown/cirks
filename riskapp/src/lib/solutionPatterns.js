'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Security solution patterns (owner, 2026-11-10; docs/meta-architecture.md §11).
// Renamed 2026-11-16 (owner): P6 Configured setting → Security configuration
// setting, P8 Physical protection → Physical security. Only the names shown
// change; the codes are what solutions store.
//
// The eight generic shapes a security solution takes. Each is a few SLOTS, every
// slot a person, process, document, technology or place in a defined role, and a
// solution is complete against its pattern only when each required slot holds a
// part. The organisation's own solutions (CrowdStrike EDR) say which pattern they
// implement; this file says what each pattern needs, and works out how a solution
// measures up. Shipped with the code, like lib/cirksDelivers.js: the patterns are
// CIRKS's, not the organisation's.
//
// Report only: nothing here changes an objective's state or a risk score.
//
// A slot `accepts` a part by its component type and place:
//   types       component types it takes
//   locations   where the part must be (on_system, service, organisation); any if absent
//   document    true: an information part must be a policy, standard or procedure
//   explicit    true: only a part a person has put in this slot (a record looks
//               like any other information component, so it is never guessed)
// Matching walks the slots in order and puts each part in the first that takes
// it, unless a person has said which slot it fills (delivery_pattern_parts.slot_key).
//
// `why` says what the pattern achieves and why it matters (owner, 2026-11-16: the
// reason comes before what it is). `example` is an explanatory example, written
// here and never read from the database: a name and, for each slot, what fills it.
//
// `position` places the slot on the pattern's diagram (centre, left, right, top),
// and `arrow` joins a slot to the centre: `out` points from the centre to the slot.

const DOCUMENT_KINDS = ['policy', 'standard', 'procedure'];

const PATTERNS = [
  {
    code: 'P1', name: 'Governing document',
    why: 'The foundation of the information security management system (ISMS): it sets the rules and direction every other security solution rests on. Without it nothing else has authority, and nobody can be held to a rule they were never given.',
    example: {
      name: 'An acceptable use policy',
      parts: {
        document: 'The Acceptable Use Policy, version 3, approved by the SIRO and due for review next year',
        audience: 'Every member of staff and every contractor',
        training_record: 'The annual awareness course completions, showing each person has read and accepted the policy',
        kept_in: 'The policy library on the intranet',
      },
    },
    summary: 'A controlled document, communicated to the people it applies to, with a record that they have been trained.',
    complete_when: 'the document is approved, published and in date, its audience is named, and there is a current record that the audience has read and accepted it',
    slots: [
      { key: 'document', label: 'Controlled document', kind: 'Information · document', hint: 'owner, approval, review date',
        position: 'centre', required: true, accepts: { types: ['information'], document: true } },
      { key: 'audience', label: 'Who it applies to', kind: 'People · audience', hint: 'everyone, or a role on each system',
        position: 'left', required: true, accepts: { types: ['people'] }, arrow: { dir: 'out', label: 'communicated to' } },
      { key: 'training_record', label: 'Training record', kind: 'Information · record', hint: 'who has read and accepted it, when',
        position: 'right', required: true, accepts: { types: ['information'], explicit: true }, arrow: { dir: 'out', label: 'evidenced by' } },
      { key: 'kept_in', label: 'Where copies are kept', kind: 'Facility or system', hint: 'printed, electronic, or both',
        position: 'top', required: false, accepts: { types: ['facility', 'technology'] }, arrow: { dir: 'out', label: 'kept in' } },
    ],
  },
  {
    code: 'P2', name: 'Managed process',
    why: 'Makes security happen the same way every time, not only when someone remembers. It turns a rule into routine work with a named owner, and its evidence proves the work is actually done.',
    example: {
      name: 'Removing access when someone leaves',
      parts: {
        process: 'Leavers: every account is disabled on the person’s last day',
        responsible: 'The IT service desk manager',
        defined_by: 'The Access Management Procedure',
        evidence: 'Leaver tickets, closed within one working day and checked each month',
      },
    },
    summary: 'A defined process, carried out by a responsible role, with evidence that it runs.',
    complete_when: 'the process is defined in a published document, someone is responsible for it, and there is recent evidence that it ran',
    slots: [
      { key: 'process', label: 'The process', kind: 'Process', hint: 'what is done, how often',
        position: 'centre', required: true, accepts: { types: ['process'] } },
      { key: 'responsible', label: 'Who is responsible', kind: 'People · role', hint: 'a role, often the system owner',
        position: 'left', required: true, accepts: { types: ['people'] }, arrow: { dir: 'in', label: 'carries it out' } },
      { key: 'defined_by', label: 'Where it is defined', kind: 'Information · document', hint: 'the policy or procedure',
        position: 'top', required: true, accepts: { types: ['information'], document: true }, arrow: { dir: 'in', label: 'defines it' } },
      { key: 'evidence', label: 'Evidence it runs', kind: 'Information · record', hint: 'a completed task, an entry, a review',
        position: 'right', required: true, accepts: { types: ['information'], explicit: true }, arrow: { dir: 'out', label: 'evidenced by' } },
    ],
  },
  {
    code: 'P3', name: 'Register',
    why: 'You cannot protect what you do not know you have. A register is the organisation’s authoritative list, of assets, software, suppliers or keys, and other security work relies on it being complete and current.',
    example: {
      name: 'A hardware asset register',
      parts: {
        record: 'The hardware asset register',
        maintained_by: 'Recording each device when it arrives and when it is disposed of, with a check every quarter',
        standard: 'The Asset Management Standard: every device has an owner, a location and the date its support ends',
        kept_in: 'The IT service management tool',
      },
    },
    summary: 'A record of things, kept current by a process, holding what a standard says it must.',
    complete_when: 'the register exists, a standard says what it holds, and a process keeps it current',
    slots: [
      { key: 'record', label: 'The register', kind: 'Technology or information · record', hint: 'the list itself',
        position: 'centre', required: true, accepts: { types: ['technology', 'information'] } },
      { key: 'maintained_by', label: 'What keeps it current', kind: 'Process or people', hint: 'linked to purchase, joining, disposal',
        position: 'left', required: true, accepts: { types: ['process', 'people'] }, arrow: { dir: 'in', label: 'keeps it current' } },
      { key: 'standard', label: 'What it must hold', kind: 'Information · document', hint: 'the fields every entry carries',
        position: 'top', required: true, accepts: { types: ['information'], document: true }, arrow: { dir: 'in', label: 'says what it holds' } },
      { key: 'kept_in', label: 'Where it is kept', kind: 'Facility or system', hint: 'the system or place that holds it',
        position: 'right', required: false, accepts: { types: ['technology', 'facility'] }, arrow: { dir: 'out', label: 'kept in' } },
    ],
  },
  {
    code: 'P4', name: 'Plan and exercise',
    why: 'Prepares the organisation for the day something goes wrong. The plan decides in advance who does what; exercising it is the only proof it will work under pressure, and shows what to fix before a real incident does.',
    example: {
      name: 'Recovering from ransomware',
      parts: {
        plan: 'The ransomware section of the Incident Response Plan',
        team: 'The incident response team: IT operations, the CISO and communications',
        exercise: 'A tabletop exercise in March, with the lessons learnt recorded and actions raised',
      },
    },
    summary: 'A plan, a team to carry it out, and exercises that prove it works.',
    complete_when: 'the plan is published and in date, its team is named, and it has been exercised recently',
    slots: [
      { key: 'plan', label: 'The plan', kind: 'Information or process', hint: 'printed and electronic',
        position: 'centre', required: true, accepts: { types: ['information', 'process'] } },
      { key: 'team', label: 'Who carries it out', kind: 'People · team', hint: 'trained, with deputies',
        position: 'left', required: true, accepts: { types: ['people'] }, arrow: { dir: 'in', label: 'carries it out' } },
      { key: 'exercise', label: 'Exercise record', kind: 'Information · record', hint: 'when it was tested, what was learned',
        position: 'right', required: true, accepts: { types: ['information'], explicit: true }, arrow: { dir: 'out', label: 'proven by' } },
    ],
  },
  {
    code: 'P5', name: 'Central security service',
    why: 'Protects many systems consistently with one capability run by specialists. The central service sees across the whole estate so one team can detect and respond everywhere; the part on each system brings that system under its watch.',
    example: {
      name: 'Endpoint detection and response',
      parts: {
        security_system: 'The endpoint detection and response service',
        team: 'The security operations team, watching its alerts',
        on_system: 'The detection agent installed on each laptop and server',
        policy: 'The Endpoint Protection Standard, which sets what is detected and what is blocked',
      },
    },
    summary: 'A security system does the work centrally, a part on each protected system reports to it, a team runs it, and a policy says how it is configured.',
    complete_when: 'the security system and its team are in place, the policy is published and in date, and the part is working on the system. A network-only form (a scanner, a firewall) has no part on the system',
    slots: [
      { key: 'security_system', label: 'Security system', kind: 'Technology · security system', hint: 'the central service that does the work',
        position: 'centre', required: true, accepts: { types: ['technology'], locations: ['service', 'organisation'] } },
      { key: 'team', label: 'Team that runs it', kind: 'People · team', hint: 'operates it and acts on what it finds',
        position: 'left', required: true, accepts: { types: ['people'] }, arrow: { dir: 'in', label: 'runs' } },
      { key: 'on_system', label: 'Part on the system', kind: 'Technology · on each system', hint: 'an agent or credentials, per system',
        position: 'right', required: true, accepts: { types: ['technology'], locations: ['on_system'] }, arrow: { dir: 'in', label: 'reports to' } },
      { key: 'policy', label: 'Policy', kind: 'Information · document', hint: 'says how the service is configured',
        position: 'top', required: true, accepts: { types: ['information'], document: true }, arrow: { dir: 'in', label: 'defines its configuration' } },
    ],
  },
  {
    code: 'P6', name: 'Security configuration setting',
    why: 'Hardens the system itself, closing a weakness at its source. It is how the organisation\u2019s hardening policies and standards (CIS benchmarks, an encryption standard) reach each system: the standard says what the setting must be, so every system is set the same way and any drift can be spotted. The simplest protection to build and to check.',
    example: {
      name: 'Locking an unattended screen',
      parts: {
        setting: 'The screen locks after 10 minutes without use',
        standard: 'The Device Configuration Standard, based on the CIS benchmark for the operating system',
      },
    },
    summary: 'A security setting on the system, defined by a hardening standard.',
    complete_when: 'the setting is on the system and a published standard says what it must be',
    slots: [
      { key: 'setting', label: 'Setting on the system', kind: 'Technology · on each system', hint: 'a configuration or product on it',
        position: 'centre', required: true, accepts: { types: ['technology'], locations: ['on_system'] } },
      { key: 'standard', label: 'Standard', kind: 'Information · document', hint: 'says what the setting must be',
        position: 'top', required: true, accepts: { types: ['information'], document: true }, arrow: { dir: 'in', label: 'defines it' } },
    ],
  },
  {
    code: 'P7', name: 'Agreement',
    why: 'Extends the organisation’s security rules to people and suppliers it does not directly control. The agreement makes them formally responsible for their part, and their recorded acceptance is what makes it enforceable.',
    example: {
      name: 'A supplier handling personal data',
      parts: {
        terms: 'The security schedule of the data processing agreement',
        bound: 'The payroll service supplier',
        acceptance: 'The signed and dated contract',
      },
    },
    summary: 'Terms, the people or supplier bound by them, and their acceptance.',
    complete_when: 'the terms are published, who they bind is named, and their acceptance is recorded',
    slots: [
      { key: 'terms', label: 'The terms', kind: 'Information · document', hint: 'contract, policy or terms of use',
        position: 'centre', required: true, accepts: { types: ['information'], document: true } },
      { key: 'bound', label: 'Who is bound', kind: 'People or supplier', hint: 'staff, contractors, a supplier',
        position: 'left', required: true, accepts: { types: ['people'] }, arrow: { dir: 'out', label: 'binds' } },
      { key: 'acceptance', label: 'Acceptance', kind: 'Information · record', hint: 'a signature, a click, a contract',
        position: 'right', required: true, accepts: { types: ['information'], explicit: true }, arrow: { dir: 'out', label: 'accepted in' } },
    ],
  },
  {
    code: 'P8', name: 'Physical security',
    why: 'Stops someone simply walking in and taking or damaging what the technical controls protect. Physical measures keep people away from equipment and information; assessment and maintenance keep the measures working.',
    example: {
      name: 'A server room',
      parts: {
        place: 'The server room',
        measures: 'A card-controlled door, CCTV and fire suppression',
        assessment: 'The annual physical security review',
        maintenance: 'Service records for the door controller and the fire suppression system',
      },
    },
    summary: 'A place, the measures that protect it, and their assessment and upkeep.',
    complete_when: 'the place and its measures are in place, the protection has been assessed, and maintenance is recorded',
    slots: [
      { key: 'place', label: 'The place', kind: 'Facility', hint: 'a room, a building, a site',
        position: 'centre', required: true, accepts: { types: ['facility'] } },
      { key: 'measures', label: 'Protective measures', kind: 'Technology', hint: 'CCTV, access control, cooling, power',
        position: 'left', required: true, accepts: { types: ['technology'] }, arrow: { dir: 'in', label: 'protect it' } },
      { key: 'assessment', label: 'Assessment', kind: 'Information · record', hint: 'a risk assessment report',
        position: 'right', required: true, accepts: { types: ['information'], explicit: true }, arrow: { dir: 'out', label: 'assessed in' } },
      { key: 'maintenance', label: 'Maintenance records', kind: 'Information · record', hint: 'servicing and repairs',
        position: 'top', required: true, accepts: { types: ['information'], explicit: true }, arrow: { dir: 'out', label: 'maintained, recorded in' } },
    ],
  },
];

const BY_CODE = Object.fromEntries(PATTERNS.map((p) => [p.code, p]));
const patternOf = (code) => BY_CODE[code] || null;
const slotOf = (code, key) => patternOf(code)?.slots.find((s) => s.key === key) || null;

function takes(slot, part) {
  const a = slot.accepts;
  if (!a.types.includes(part.component_type)) return false;
  if (a.locations && !a.locations.includes(part.location)) return false;
  if (a.document && part.component_type === 'information' && !DOCUMENT_KINDS.includes(part.document_kind)) return false;
  return true;
}

// A part's state, as its pattern sees it. A part on each system is judged by the
// systems it is in play on (degraded on any of them: degraded); every other part
// by its own recorded state (v137, v139: a document past review reads degraded).
function partState(part) {
  if (part.location === 'on_system') return part.degraded_on > 0 ? 'degraded' : 'complete';
  if (part.status === 'operational') return 'complete';
  if (part.status === 'degraded') return 'degraded';
  return 'not_in_place';
}

const RANK = { complete: 0, degraded: 1, not_in_place: 2 };

/**
 * How a solution measures up to its pattern.
 *
 * @param {object} s  { kind, solution_pattern, slots_not_needed, parts: [{ id,
 *   component_name, component_type, document_kind, location, slot_key, status,
 *   degraded_on }] }
 * @returns {{ pattern, state, slots, also, missing }} state is one of
 *   no_pattern | per_supplier | complete | degraded | incomplete; each slot's
 *   state is complete | degraded | not_in_place | missing | not_recorded | not_needed.
 */
function fitOf(s) {
  if (s.kind === 'supplier') return { pattern: s.solution_pattern || null, state: 'per_supplier', slots: [], also: [], missing: [] };
  const pattern = patternOf(s.solution_pattern);
  if (!pattern) return { pattern: null, state: 'no_pattern', slots: [], also: [], missing: [] };
  const notNeeded = new Set(s.slots_not_needed || []);
  const filled = Object.fromEntries(pattern.slots.map((slot) => [slot.key, []]));
  const also = [];
  for (const part of s.parts || []) {
    const stated = part.slot_key && filled[part.slot_key] ? part.slot_key : null;
    const key = stated || pattern.slots.find((slot) => !slot.accepts.explicit && takes(slot, part))?.key;
    const entry = { id: part.id, name: part.component_name, component_type: part.component_type, location: part.location,
      state: partState(part), degraded_on: part.degraded_on || 0, stated: Boolean(stated) };
    if (key) filled[key].push(entry); else also.push(entry);
  }
  const slots = pattern.slots.map((slot) => {
    const parts = filled[slot.key];
    let state;
    if (notNeeded.has(slot.key)) state = 'not_needed';
    else if (!parts.length) state = slot.required ? 'missing' : 'not_recorded';
    else state = parts.reduce((w, p) => (RANK[p.state] > RANK[w] ? p.state : w), 'complete');
    return { key: slot.key, label: slot.label, required: slot.required, state, parts };
  });
  const missing = slots.filter((x) => x.state === 'missing').map((x) => x.label);
  const state = slots.some((x) => x.state === 'missing' || x.state === 'not_in_place') ? 'incomplete'
    : slots.some((x) => x.state === 'degraded') ? 'degraded' : 'complete';
  return { pattern: pattern.code, state, slots, also, missing };
}

module.exports = { PATTERNS, DOCUMENT_KINDS, patternOf, slotOf, fitOf };
