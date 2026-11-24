// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { vi } from 'vitest';
import { systemObjectivesNodes, solutionState, SET_STRIPE } from './SystemObjectivesDiagram';

const SECURITY = {
  solutions: [
    { pattern_id: 'p1', pattern_name: 'EDR', reasons: [{ reason: 'architecture', trigger_component_name: 'Windows Server' }],
      parts: [{ status: 'operational' }] },
    { pattern_id: 'p2', pattern_name: 'Backup', reasons: [{ reason: 'chosen' }], parts: [{ status: 'degraded' }] },
  ],
  objectives: [
    { control_id: 'o1', state: 'delivered', for_threat: true, recorded: true, threats: ['Malware'], choice_source: 'in_place' },
    { control_id: 'o2', state: 'delivered', for_threat: false, recorded: false, threats: [] },
    { control_id: 'o3', state: 'needs_solution', for_threat: true, recorded: true, threats: ['Malware', 'Phishing'] },
  ],
};
const CONTROLS = [
  { id: 'o1', status: 'operational', delivery: 'system' },
  { id: 'o3', status: 'missing', delivery: 'system' },
  { id: 'o4', status: 'not_applicable', delivery: null },
  { id: 'o9', status: 'missing', delivery: 'organisation' },   // not this system's own: left to the SoA band
];

describe('a system\'s control objectives as a picture', () => {
  test('a solution\'s state follows its parts', () => {
    expect(solutionState([{ status: 'operational' }])).toBe('complete');
    expect(solutionState([{ status: 'operational' }, { status: 'degraded' }])).toBe('degraded');
    expect(solutionState([{ status: 'missing' }, { status: null }])).toBe('incomplete');
  });

  test('why asked, how delivered, how it stands: each box counts its set', () => {
    const { nodes, sets } = systemObjectivesNodes(SECURITY, CONTROLS);
    const box = (id) => nodes.find((n) => n.id === id);
    expect(box('threats')).toMatchObject({ tag: 'Threats · 2', title: '2 objectives' });
    expect(box('triggers')).toMatchObject({ tag: 'Triggers · 1', title: '1 objective more' });
    // Counted automatically (complete in place), not by a person: said so.
    expect(box('choices')).toMatchObject({ tag: 'Chosen automatically', title: '1 objective', detail: 'its solution is complete here' });
    expect(box('solutions').title).toBe('1 complete · 1 degraded');
    expect(box('no_solution')).toMatchObject({ tone: 'bad', title: '1 objective' });
    expect([...sets.missing]).toEqual(['o3']);              // the organisation's own is not counted here
    expect(box('unrecorded').title).toBe('1 objective');
    expect(box('not_applicable').title).toBe('1 objective');
    expect(box('soa')).toBeUndefined();                     // only on request
  });

  test('on request, the organisation\'s band from the SoA', () => {
    const org = { reach: [{ id: 'x', via: 'organisation', status: 'operational' }, { id: 'y', via: 'group', status: 'missing' }],
      not_applicable: [{ id: 'z' }] };
    const { nodes } = systemObjectivesNodes(SECURITY, CONTROLS, org);
    expect(nodes.find((n) => n.id === 'org')).toMatchObject({ title: '1 objective', detail: 'and 1 for a group it is in' });
    expect(nodes.find((n) => n.id === 'org_state').title).toBe('1 implemented · 0 partial');
    expect(nodes.find((n) => n.id === 'soa_na').title).toBe('1 objective');
  });

  test('a box filters the list; the organisation\'s boxes open the SoA', () => {
    const onFilter = vi.fn(); const onSoa = vi.fn();
    const { nodes } = systemObjectivesNodes(SECURITY, CONTROLS, { reach: [], not_applicable: [] }, { onFilter, onSoa });
    nodes.find((n) => n.id === 'no_solution').onClick();
    nodes.find((n) => n.id === 'org').onClick();
    expect(onFilter).toHaveBeenCalledWith('no_solution');
    expect(onSoa).toHaveBeenCalled();
  });

  test('each set\'s box has its colour, and the selected one is pressed: the list wears the same colour', () => {
    const { nodes } = systemObjectivesNodes(SECURITY, CONTROLS, null, { active: 'threats' });
    const box = (id) => nodes.find((n) => n.id === id);
    expect(box('threats')).toMatchObject({ stripe: SET_STRIPE.threats, selected: true });
    expect(box('missing')).toMatchObject({ stripe: SET_STRIPE.missing, selected: false });
    expect(SET_STRIPE.operational).toBe('var(--green)');
  });

  test('choices list the objectives with a solution chosen, by a person or automatically, and say which', () => {
    const onFilter = vi.fn();
    const sec = { ...SECURITY, objectives: [...SECURITY.objectives, { control_id: 'o5', state: 'delivered', for_threat: false, recorded: true, threats: [], choice_source: 'person' }] };
    const { nodes, sets } = systemObjectivesNodes(sec, CONTROLS, null, { onFilter });
    nodes.find((n) => n.id === 'choices').onClick();
    expect(onFilter).toHaveBeenCalledWith('choices');
    expect([...sets.choices]).toEqual(['o1', 'o5']);
    expect(nodes.find((n) => n.id === 'choices')).toMatchObject({ tag: 'Choices', detail: '1 by a person, 1 automatically' });
  });
});
