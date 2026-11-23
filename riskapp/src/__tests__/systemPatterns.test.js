'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// lib/systemPatterns.js: the eight system patterns (v177, S7 and S8 v181) and how a system
// measures up to one. Pure functions, no database.

const { PATTERNS, ROLES, patternOf, slotOf, requiredSlots, fitOf } = require('../lib/systemPatterns');

const comp = (name, over = {}) => ({ id: name, name, component_type: 'technology', slot_key: null, roles: [], ...over });

describe('the patterns', () => {
  test('eight of them, applications in order of who answers for each layer, each with one centre slot and arrows on the rest', () => {
    expect(PATTERNS.map((p) => p.code)).toEqual(['S1', 'S7', 'S8', 'S2', 'S3', 'S4', 'S5', 'S6']);
    for (const p of PATTERNS) {
      expect(p.slots.filter((s) => s.position === 'centre')).toHaveLength(1);
      const positions = p.slots.map((s) => s.position);
      expect(new Set(positions).size).toBe(positions.length);
      const keys = p.slots.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const s of p.slots.filter((x) => x.position !== 'centre')) expect(s.arrow?.label).toBeTruthy();
      for (const s of p.slots) expect(['role', 'explicit', 'supplier']).toContain(s.fill);
      expect(p.summary && p.complete_when).toBeTruthy();
    }
  });

  test('a supplier-run service is not asked for an operating system or a server room', () => {
    const keys = patternOf('S2').slots.map((s) => s.key);
    expect(keys).not.toContain('operating_system');
    expect(keys).not.toContain('hosting');
    expect(slotOf('S2', 'administrators').required).toBe(false);   // owner, 2026-11-10: optional
  });

  test('required only where something reads the answer (owner, 2026-11-10)', () => {
    expect(requiredSlots('S1')).toEqual(['operating_system', 'sign_in', 'hosting', 'network']);
    expect(requiredSlots('S2')).toEqual(['supplier', 'sign_in', 'network']);
    expect(requiredSlots('S3')).toEqual(['sign_in', 'network', 'hosting']);
    expect(requiredSlots('S6')).toEqual(['hosting']);
    // Naming the system's subject changes no security answer.
    for (const [code, key] of [['S1', 'application'], ['S2', 'service'], ['S3', 'control_system'], ['S1', 'users'], ['S1', 'support_team']]) {
      expect(slotOf(code, key).required).toBe(false);
    }
  });

  test('the cloud service models (owner, 2026-11-18): on IaaS and PaaS the provider is a required supplier; on PaaS there is no operating system of ours', () => {
    expect(requiredSlots('S7')).toEqual(['operating_system', 'sign_in', 'supplier', 'hosting', 'network']);
    expect(requiredSlots('S8')).toEqual(['sign_in', 'supplier', 'hosting', 'network']);
    expect(patternOf('S8').slots.map((s) => s.key)).not.toContain('operating_system');
    expect(slotOf('S8', 'platform')).toMatchObject({ required: false, fill: 'explicit' });
    // A system on Azure virtual servers with its provider recorded is complete as S7.
    const fit = fitOf({ system_pattern: 'S7', suppliers: [{ id: 'ms', name: 'Microsoft' }], components: [
      { id: 'os', name: 'Ubuntu', roles: ['operating_system'] }, { id: 'id', name: 'Entra ID', roles: ['sign_in'] },
      { id: 'r', name: 'Azure UK South', roles: ['hosting'] }, { id: 'n', name: 'Azure network', roles: ['network'] }] });
    expect(fit.state).toBe('complete');
    expect(fitOf({ system_pattern: 'S7', components: [] }).missing).toContain('Cloud provider');
  });

  test('on dedicated equipment the operating system is optional', () => {
    expect(slotOf('S3', 'operating_system').required).toBe(false);
    expect(requiredSlots('S3')).not.toContain('operating_system');
  });

  test('one slot key, one meaning: users is "Operators" on equipment, answered by the same role', () => {
    expect(slotOf('S1', 'users').label).toBe('Who uses it');
    expect(slotOf('S3', 'users').label).toBe('Operators');
    const users = ROLES.find((g) => g.key === 'users');
    expect(users.labels).toEqual(expect.arrayContaining(['Who uses it', 'Operators']));
    expect(ROLES.map((g) => g.key).sort()).toEqual(['hosting', 'network', 'operating_system', 'sign_in', 'support_team', 'users']);
  });

  test('look-ups', () => {
    expect(patternOf('S9')).toBeNull();
    expect(slotOf('S1', 'nothing')).toBeNull();
    expect(requiredSlots(null)).toEqual([]);
  });
});

describe('a system against its pattern', () => {
  test('no pattern stated: nothing is guessed', () => {
    expect(fitOf({ system_pattern: null, components: [comp('Windows 11', { roles: ['operating_system'] })] }))
      .toEqual({ pattern: null, state: 'no_pattern', slots: [], also: [], missing: [] });
  });

  test('roles fill their slots; an optional application left empty is not a gap', () => {
    const fit = fitOf({ system_pattern: 'S1', components: [
      comp('Windows Server 2025', { roles: ['operating_system'] }),
      comp('IT Administrators', { component_type: 'people', roles: ['support_team', 'users'] }),
      comp('Joined to MIG Active Directory', { roles: ['sign_in'] }),
      comp('Bank Street server room', { component_type: 'facility', roles: ['hosting'] }),
      comp('MIGNet (internal)', { roles: ['network'] }),
      comp('Treasury Team', { component_type: 'people', roles: ['users'] }),
      comp('Veeam Backup'),
    ] });
    expect(fit.state).toBe('complete');
    expect(fit.slots.find((s) => s.key === 'application').state).toBe('not_recorded');
    expect(fit.also.map((c) => c.name)).toEqual(['Veeam Backup']);
    // A component with two roles answers both.
    expect(fit.slots.find((s) => s.key === 'support_team').parts.map((p) => p.name)).toEqual(['IT Administrators']);
    expect(fit.slots.find((s) => s.key === 'users').parts.map((p) => p.name)).toEqual(['IT Administrators', 'Treasury Team']);
  });

  test('a supplier-run service: the supplier comes from its relationships; the service is named by hand', () => {
    const base = { system_pattern: 'S2', components: [
      comp('Supplier-managed sign-in', { roles: ['sign_in'] }),
      comp('External internet', { roles: ['network'] }),
      comp('HR Team', { component_type: 'people', roles: ['users'] }),
      comp('PeopleFirst HR'),
    ] };
    const without = fitOf({ ...base, suppliers: [] });
    expect(without.missing).toEqual(['Supplier']);                     // the service is optional: it names, it does not decide
    expect(without.also.map((c) => c.name)).toEqual(['PeopleFirst HR']);

    const withBoth = fitOf({ ...base,
      components: base.components.map((c) => (c.name === 'PeopleFirst HR' ? { ...c, slot_key: 'service' } : c)),
      suppliers: [{ id: 's1', name: 'PeopleFirst HR' }] });
    expect(withBoth.state).toBe('complete');
    expect(withBoth.slots.find((s) => s.key === 'service').parts[0].stated).toBe(true);
    expect(withBoth.slots.find((s) => s.key === 'administrators').state).toBe('not_recorded');
  });

  test('a component placed by hand goes where it is put, whatever its roles', () => {
    const fit = fitOf({ system_pattern: 'S6', components: [
      comp('Playbooks (printed)', { component_type: 'information', slot_key: 'document' }),
      comp('InfoSec Team', { component_type: 'people', roles: ['support_team', 'users'] }),
      comp('Castle Vaults DR room', { component_type: 'facility', roles: ['hosting'] }),
    ] });
    expect(fit.missing).toEqual([]);                                   // only where copies are kept is required
    expect(fit.slots.find((x) => x.key === 'copy_register').state).toBe('not_recorded');
    expect(fit.slots.find((s) => s.key === 'users').parts.map((p) => p.name)).toEqual(['InfoSec Team']);
  });

  test('a stated slot that is not in the pattern leaves the component outside every slot', () => {
    const fit = fitOf({ system_pattern: 'S4', components: [comp('Old thing', { slot_key: 'control_system' })] });
    expect(fit.also.map((c) => c.name)).toEqual(['Old thing']);
  });
});
