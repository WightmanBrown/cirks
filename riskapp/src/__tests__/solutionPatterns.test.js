'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// lib/solutionPatterns.js: the eight security solution patterns (v176) and how a
// solution measures up to one. Pure functions, no database.

const { PATTERNS, patternOf, slotOf, fitOf } = require('../lib/solutionPatterns');

const part = (over) => ({ id: over.component_name, location: 'organisation', status: 'operational', degraded_on: 0, slot_key: null, ...over });

describe('the patterns', () => {
  test('eight of them, P1 to P8, each with one centre slot and arrows on the rest', () => {
    expect(PATTERNS.map((p) => p.code)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);
    for (const p of PATTERNS) {
      expect(p.slots.filter((s) => s.position === 'centre')).toHaveLength(1);
      const positions = p.slots.map((s) => s.position);
      expect(new Set(positions).size).toBe(positions.length);          // one slot per place on the diagram
      for (const s of p.slots.filter((x) => x.position !== 'centre')) expect(s.arrow?.label).toBeTruthy();
      expect(p.summary && p.complete_when).toBeTruthy();
    }
  });

  test('look-ups', () => {
    expect(patternOf('P5').name).toBe('Central security service');
    expect(slotOf('P5', 'policy').label).toBe('Policy');
    expect(slotOf('P5', 'nothing')).toBeNull();
    expect(patternOf('P9')).toBeNull();
  });
});

describe('a solution against its pattern', () => {
  // CrowdStrike EDR in Misty Isles: no policy, the agent degraded on one system.
  const edr = {
    kind: 'parts', solution_pattern: 'P5', slots_not_needed: [],
    parts: [
      part({ component_name: 'Crowdstrike Falcon Agent', component_type: 'technology', location: 'on_system', degraded_on: 1 }),
      part({ component_name: 'Crowdstrike SaaS', component_type: 'technology', location: 'service' }),
      part({ component_name: 'InfoSec Team', component_type: 'people', location: 'service' }),
      part({ component_name: 'Detective Monitoring', component_type: 'process', location: 'service' }),
    ],
  };

  test('parts fill their slots by type and place; a missing required slot makes it incomplete', () => {
    const fit = fitOf(edr);
    const by = Object.fromEntries(fit.slots.map((s) => [s.key, s]));
    expect(by.security_system.parts.map((p) => p.name)).toEqual(['Crowdstrike SaaS']);
    expect(by.team.parts.map((p) => p.name)).toEqual(['InfoSec Team']);
    expect(by.on_system.state).toBe('degraded');                       // degraded on one system
    expect(by.policy.state).toBe('missing');
    expect(fit.also.map((p) => p.name)).toEqual(['Detective Monitoring']);   // no slot for a process here
    expect(fit.missing).toEqual(['Policy']);
    expect(fit.state).toBe('incomplete');
  });

  test('with the policy it reads degraded, because the agent is', () => {
    const fit = fitOf({ ...edr, parts: [...edr.parts,
      part({ component_name: 'Endpoint Standard', component_type: 'information', document_kind: 'standard' })] });
    expect(fit.state).toBe('degraded');
  });

  test('a slot the solution does not need is not missing', () => {
    const scanner = { kind: 'parts', solution_pattern: 'P5', slots_not_needed: ['on_system', 'policy'],
      parts: [part({ component_name: 'Engine', component_type: 'technology', location: 'service' }),
        part({ component_name: 'Team', component_type: 'people' })] };
    const fit = fitOf(scanner);
    expect(fit.slots.find((s) => s.key === 'on_system').state).toBe('not_needed');
    expect(fit.state).toBe('complete');
  });

  test('a record is never guessed: only a part a person puts in the slot fills it', () => {
    const aup = { kind: 'parts', solution_pattern: 'P1', slots_not_needed: [],
      parts: [part({ component_name: 'Acceptable Use Policy', component_type: 'information', document_kind: 'policy' }),
        part({ component_name: 'Acceptance records', component_type: 'information' }),
        part({ component_name: 'All staff', component_type: 'people' })] };
    let fit = fitOf(aup);
    expect(fit.slots.find((s) => s.key === 'training_record').state).toBe('missing');
    expect(fit.also.map((p) => p.name)).toEqual(['Acceptance records']);
    expect(fit.slots.find((s) => s.key === 'kept_in').state).toBe('not_recorded');   // optional
    aup.parts[1].slot_key = 'training_record';
    fit = fitOf(aup);
    expect(fit.slots.find((s) => s.key === 'training_record').parts[0]).toMatchObject({ name: 'Acceptance records', stated: true });
    expect(fit.state).toBe('complete');
  });

  test('a part not yet in place leaves the solution incomplete', () => {
    const fit = fitOf({ kind: 'parts', solution_pattern: 'P6', slots_not_needed: [],
      parts: [part({ component_name: 'TLS', component_type: 'technology', location: 'on_system' }),
        part({ component_name: 'Draft standard', component_type: 'information', document_kind: 'standard', status: 'planned' })] });
    expect(fit.slots.find((s) => s.key === 'standard').state).toBe('not_in_place');
    expect(fit.state).toBe('incomplete');
  });

  test('a slot stated for another pattern falls back to matching', () => {
    const fit = fitOf({ kind: 'parts', solution_pattern: 'P6', slots_not_needed: [],
      parts: [part({ component_name: 'BitLocker', component_type: 'technology', location: 'on_system', slot_key: 'on_system' })] });
    expect(fit.slots.find((s) => s.key === 'setting').parts.map((p) => p.name)).toEqual(['BitLocker']);
  });

  test('no pattern stated, or provided by the supplier', () => {
    expect(fitOf({ kind: 'parts', solution_pattern: null, parts: [] }).state).toBe('no_pattern');
    expect(fitOf({ kind: 'supplier', solution_pattern: 'P7', parts: [] }).state).toBe('per_supplier');
  });
});

describe('each pattern explains itself (owner, 2026-11-16)', () => {
  test.each(PATTERNS.map((p) => [p.code, p]))('%s says why it matters and gives an example filling every slot', (_code, p) => {
    expect(typeof p.why).toBe('string');
    expect(p.why.length).toBeGreaterThan(40);
    expect(p.example.name).toBeTruthy();
    expect(Object.keys(p.example.parts).sort()).toEqual(p.slots.map((s) => s.key).sort());
    for (const text of Object.values(p.example.parts)) expect(text.length).toBeGreaterThan(5);
  });
});
