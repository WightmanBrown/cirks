// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { componentSystemsOf, componentRisksNodes, componentCriticality, NAMED } from './ComponentRisksDiagram';
import { departmentColour } from '../utils/departmentColour';

const sys = (id, name, dept, risks) => ({ id, name, department_id: dept, department_name: dept, risks });
const component = {
  name: 'Falcon agent', component_type: 'technology',
  systems: [
    { ...sys('mail', 'Email', 'comms', [{ id: 'r3', risk_score: 25, threat_name: 'Phishing' }]), impact_c: 5, impact_i: 3, impact_a: 2 },
    { ...sys('pas', 'Patient admin', 'health', [
      { id: 'r1', risk_score: 6, threat_name: 'Ransomware' },
      { id: 'r2', risk_score: 12, threat_name: 'Misconfiguration' }]), impact_c: 3, impact_i: 3, impact_a: 3 },
    { ...sys('arch', 'Archive', 'health', []), impact_c: 4 },
  ],
  vulnerable_on: [{ risk_id: 'r1', marked_by: 'An analyst' }],
};

describe('componentSystemsOf', () => {
  it('puts the systems it is named on first, and the named risks first in each', () => {
    const s = componentSystemsOf(component);
    expect(s.map((x) => x.id)).toEqual(['pas', 'mail', 'arch']);  // named, then impact 5, 4
    expect(s[0].risks.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(s[0]).toMatchObject({ namedCount: 1, worst: 12, worstNamed: 6, impact: 3 });
    expect(s[2].worst).toBeNull();
  });
});

describe('componentRisksNodes', () => {
  it('shows a risk score only where the component is named, the system impact elsewhere', () => {
    const { nodes } = componentRisksNodes(component, null);
    const node = (id) => nodes.find((n) => n.id === id);
    expect(node('component')).toMatchObject({ kind: 'technology', tag: 'Technology', detail: 'on 3 systems' });
    expect(node('component').badge.props).toMatchObject({ value: 5, scale: 'impact' });
    expect(node('s-pas')).toMatchObject({ selected: true, tag: 'Named · risk', stripe: departmentColour('health') });
    expect(node('s-pas').badge.props).toMatchObject({ value: 6, scale: 'risk' });
    expect(node('s-mail').tag).toBe('System · impact');
    expect(node('s-mail').badge.props).toMatchObject({ value: 5, scale: 'impact' });
    expect(node('r-r1')).toMatchObject({ tag: 'Named here', lit: NAMED });
    expect(node('r-r2')).toMatchObject({ tag: 'Not named', faded: true });
    expect(node('r-r3')).toBeUndefined();
  });

  it('gives the component the highest impact of its systems and the worst named risk', () => {
    expect(componentCriticality(component)).toMatchObject({ impact: 5, namedRisk: 6 });
    expect(componentCriticality(component).from.map((s) => s.id)).toEqual(['mail']);
    expect(componentCriticality({ ...component, vulnerable_on: [] }).namedRisk).toBeNull();
  });

  it('keeps the chosen system drawn when the others are counted in a "more" box', () => {
    const many = { ...component, systems: Array.from({ length: 14 }, (_, k) => sys(`s${k}`, `Sys ${String(k).padStart(2, '0')}`, 'it', [])) };
    const { nodes } = componentRisksNodes(many, 's13');
    expect(nodes.filter((n) => n.col === 1 && n.id.startsWith('s-s'))).toHaveLength(10);
    expect(nodes.find((n) => n.id === 's-s13').selected).toBe(true);
    expect(nodes.find((n) => n.id === 's-more').title).toBe('4 more');
  });

  it('says so when no system records it', () => {
    const { nodes } = componentRisksNodes({ ...component, systems: [] }, null);
    expect(nodes.find((n) => n.id === 's-none').title).toBe('On none');
  });
});
