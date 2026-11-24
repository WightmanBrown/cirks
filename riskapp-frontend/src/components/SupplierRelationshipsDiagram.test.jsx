// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { assuranceOf, supplierRelationshipsNodes } from './SupplierRelationshipsDiagram';
import { departmentColour } from '../utils/departmentColour';

const obj = (met) => ({ control_id: Math.random().toString(36), met });
const supplier = {
  name: 'Acme',
  relationships: [
    { id: 'saas', relationship_type: 'service_provider', status: 'active', department_id: 'comms', department_name: 'Comms',
      system_id: 'mail', system_name: 'Email', contract_ref: 'MS-1', max_impact: 5, systems_touched: 1,
      criticality_systems: [{ id: 'mail', name: 'Email', impact: 5 }], objectives: [obj(true), obj(false)],
      assurance_finding: { reason: 'partial' } },
    { id: 'prod', relationship_type: 'product', status: 'active', department_id: 'sec', department_name: 'Security',
      component_id: 'agent', component_name: 'Agent', max_impact: 5, systems_touched: 7,
      criticality_systems: [{ id: 'mail', name: 'Email', impact: 5 }, { id: 'hr', name: 'HR', impact: 5 }],
      objectives: [obj(true)], assurance_finding: null },
  ],
  information_assets: [
    { id: 'pr', name: 'Patient records', department_id: 'health', confidentiality: 5, system_ids: ['mail'], relationship_ids: ['saas', 'prod'] },
    { id: 'pay', name: 'Payroll', department_id: 'hr', confidentiality: 3, system_ids: ['hr'], relationship_ids: ['prod'] },
    { id: 'far', name: 'Far away', department_id: 'x', confidentiality: 2, system_ids: ['elsewhere'], relationship_ids: ['prod'] },
  ],
};

describe('assuranceOf', () => {
  it('tones a relationship by its objectives met', () => {
    expect(assuranceOf(supplier.relationships[0])).toMatchObject({ tone: 'warn', short: 'met 1/2' });
    expect(assuranceOf(supplier.relationships[1])).toMatchObject({ tone: 'good' });
    expect(assuranceOf({ status: 'ended' }).tone).toBe('quiet');
  });
});

describe('supplierRelationshipsNodes', () => {
  const { nodes, links } = supplierRelationshipsNodes(supplier, { level: 5 });
  const node = (id) => nodes.find((n) => n.id === id);

  it('names a system relationship by its contract and a component one by the component', () => {
    expect(node('r-saas')).toMatchObject({ title: 'MS-1', tag: 'SaaS · met 1/2', stripe: departmentColour('comms') });
    expect(node('r-prod').title).toBe('Through Agent');
  });

  it('draws each system once, and counts the systems a component reaches beyond those named', () => {
    expect(nodes.filter((n) => n.id === 'y-mail')).toHaveLength(1);
    expect(node('y-mail').tag).toBe('Sets criticality');
    expect(node('y-more').title).toBe('5 more');
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'r-saas', to: 'y-mail' }),
      expect.objectContaining({ from: 'r-prod', to: 'y-hr' }),
      expect.objectContaining({ from: 'r-prod', to: 'y-more' }),
    ]));
  });

  it('lights a chosen relationship\'s systems and fades the rest', () => {
    const r = supplierRelationshipsNodes(supplier, { level: 5, active: 'rel:saas' });
    const n = (id) => r.nodes.find((x) => x.id === id);
    expect(n('y-mail').lit).toBe(departmentColour('comms'));
    expect(n('y-hr').faded).toBe(true);
    expect(n('r-prod').faded).toBe(true);
  });

  it('draws the information it may reach on the right, from the systems holding it', () => {
    expect(node('a-pr')).toMatchObject({ col: 3, title: 'Patient records', stripe: departmentColour('health') });
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'y-mail', to: 'a-pr' }),
      expect.objectContaining({ from: 'y-hr', to: 'a-pay' }),
      // held only in a system it reaches but does not draw: from the N more box
      expect.objectContaining({ from: 'y-more', to: 'a-far', dashed: true }),
    ]));
    const r = supplierRelationshipsNodes(supplier, { level: 5, active: 'rel:saas' });
    expect(r.nodes.find((x) => x.id === 'a-pr').lit).toBe(departmentColour('comms'));
    // With a relationship chosen, the column is what that one reaches.
    expect(r.nodes.find((x) => x.id === 'a-pay')).toBeUndefined();
  });

  it('a chosen system lights the relationships reaching it and shows only what it holds', () => {
    const r = supplierRelationshipsNodes(supplier, { level: 5, active: 'sys:hr' });
    const n = (id) => r.nodes.find((x) => x.id === id);
    expect(n('y-hr').selected).toBe(true);
    expect(n('y-mail').faded).toBe(true);
    expect(n('r-prod').faded).toBeFalsy();
    expect(n('r-saas').faded).toBe(true);
    expect(n('a-pay').lit).toBe('var(--accent)');
    expect(n('a-pr')).toBeUndefined();
    expect(r.inScope.map((a) => a.id)).toEqual(['pay']);
  });

  it('counts the rest, and leaves out what only an ended relationship reached', () => {
    const many = { ...supplier, information_assets: Array.from({ length: 12 }, (_, k) => (
      { id: `x${k}`, name: `Asset ${k}`, confidentiality: 1, system_ids: ['mail'], relationship_ids: ['saas'] })) };
    expect(supplierRelationshipsNodes(many).nodes.find((x) => x.id === 'a-more')).toMatchObject({ title: '4 more', detail: 'list all 12' });
    const ended = { ...supplier, relationships: supplier.relationships.map((r) => ({ ...r, status: 'ended' })) };
    expect(supplierRelationshipsNodes(ended).nodes.some((x) => x.col === 3 && x.id.startsWith('a-') && x.id !== 'a-none')).toBe(false);
  });
});
