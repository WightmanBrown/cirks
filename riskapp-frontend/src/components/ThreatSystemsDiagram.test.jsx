// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { departmentsOf, threatSystemsNodes } from './ThreatSystemsDiagram';
import { departmentColour } from '../utils/departmentColour';

const threat = {
  name: 'Ransomware', source: 'internal', threat_category: 'deliberate', probability_c: 3,
  systems: [
    { id: 'a', name: 'Billing', department_id: 'fin', department_name: 'Finance', assessed: true, risk_score: 9, validation_status: 'validated' },
    { id: 'b', name: 'Payroll', department_id: 'fin', department_name: 'Finance', assessed: true, risk_score: 20, validation_status: 'pending' },
    { id: 'c', name: 'Ledger', department_id: 'fin', department_name: 'Finance', assessed: false, stale: true },
    { id: 'd', name: 'Cases', department_id: 'law', department_name: 'Legal', assessed: false },
  ],
};

describe('departmentsOf', () => {
  it('groups the systems by department, most systems first, worst risk first', () => {
    const d = departmentsOf(threat.systems);
    expect(d.map((x) => x.name)).toEqual(['Finance', 'Legal']);
    expect(d[0].systems.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(d[0].stripe).toBe(departmentColour('fin'));
  });
});

describe('threatSystemsNodes', () => {
  const { nodes, links, label } = threatSystemsNodes(threat, { active: 'dept:fin' });
  const node = (id) => nodes.find((n) => n.id === id);

  it('draws threat, systems with their risk chips, and departments', () => {
    expect(node('threat')).toMatchObject({ kind: 'threat', stripe: 'var(--amber)', tag: 'Threat · Internal' });
    expect(node('s-b').badge).toBeTruthy();
    expect(node('s-b').tag).toBe('Not validated');
    expect(node('s-a').tag).toBe('System');
    expect(node('s-c')).toMatchObject({ tone: 'bad', tag: 'Not assessed · overdue', badge: null });
    expect(node('s-d')).toMatchObject({ tone: 'warn', tag: 'Not assessed' });
    expect(node('d-fin')).toMatchObject({ selected: true, row: 1, detail: '3 systems' });
    expect(node('s-a').stripe).toBe(node('d-fin').stripe);
  });

  it('joins each system to the threat and to its department', () => {
    expect(links.filter((l) => l.to === 'd-fin').map((l) => l.from)).toEqual(['s-b', 's-a', 's-c']);
    expect(links.find((l) => l.to === 's-d').dashed).toBe(true);
    expect(label).toMatch(/identified on 4 systems, 2 assessed, in 2 departments/);
  });

  it('says when the threat is identified on no system', () => {
    const r = threatSystemsNodes({ ...threat, systems: [] });
    expect(r.nodes.find((n) => n.id === 's-none').title).toBe('Identified on none');
  });
});
