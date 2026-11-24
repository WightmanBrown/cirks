// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { objectiveState, assuranceCounts, supplierAssuranceNodes, EVIDENCE_STRIPE, NO_EVIDENCE_STRIPE } from './SupplierAssuranceDiagram';

const o = (id, met, extra = {}) => ({ control_id: id, title: `Objective ${id}`, ref: `R.${id}`, met, expired_only: false, ours: false, ...extra });
const supplier = {
  name: 'Acme',
  relationships: [
    { id: 'good', relationship_type: 'service_provider', status: 'active', system_name: 'Email', department_id: 'it',
      objectives: [o('a', true)], evidence: [{ id: 'e0', kind: 'report', title: 'SOC 2', is_current: true, control_ids: ['a'] }],
      assurance_finding: null },
    { id: 'gap', relationship_type: 'product', status: 'active', component_name: 'Agent', department_id: 'sec',
      objectives: [o('x', true), o('y', false, { expired_only: true }), o('z', false), o('w', true, { ours: true })],
      evidence: [
        { id: 'e1', kind: 'report', title: 'ISO cert', is_current: true, control_ids: ['x'] },
        { id: 'e2', kind: 'contract_terms', title: 'Old contract', is_current: false, effective_expiry: '2025-01-01', control_ids: ['y'] },
      ],
      assurance_finding: { reason: 'partial', unmet_count: 2 } },
    { id: 'old', relationship_type: 'onshore', status: 'ended', component_name: 'Staff', objectives: [o('q', false)], evidence: [] },
  ],
};

describe('objectiveState / assuranceCounts', () => {
  it('reads met, expired and missing, and counts only live relationships and supplier-side objectives', () => {
    expect(objectiveState(o('a', true)).key).toBe('met');
    expect(objectiveState(o('a', false, { expired_only: true })).key).toBe('expired');
    expect(objectiveState(o('a', false)).key).toBe('missing');
    expect(assuranceCounts(supplier.relationships)).toMatchObject({ live: 2, met: 2, expired: 1, missing: 1, evidence: 3, current: 2, findings: 1 });
  });
});

describe('supplierAssuranceNodes', () => {
  it('starts on the least assured relationship and draws its objectives, evidence and No evidence', () => {
    const { nodes, links, chosen } = supplierAssuranceNodes(supplier, null);
    const node = (id) => nodes.find((n) => n.id === id);
    expect(chosen.id).toBe('gap');
    expect(nodes.filter((n) => n.col === 1 && n.id.startsWith('o-') && n.id !== 'o-ours').map((n) => n.id)).toEqual(['o-z', 'o-y', 'o-x']);
    expect(node('o-z')).toMatchObject({ tone: 'bad', tag: 'R.z · not met' });
    expect(node('o-ours')).toMatchObject({ tag: 'Ours · 1/1 in place' });
    expect(node('e-e2')).toMatchObject({ tone: 'bad', tag: 'Contract terms' });
    expect(node('e-none').title).toBe('1 objective');
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'o-x', to: 'e-e1' }),
      expect.objectContaining({ from: 'o-y', to: 'e-e2' }),
      expect.objectContaining({ from: 'o-z', to: 'e-none' }),
    ]));
  });

  it('lights the evidence covering a chosen objective, or No evidence for a gap', () => {
    const r = supplierAssuranceNodes(supplier, 'gap', { active: 'obj:x' });
    const n = (id) => r.nodes.find((x) => x.id === id);
    expect(n('e-e1').lit).toBe(EVIDENCE_STRIPE);
    expect(n('e-e2').faded).toBe(true);
    const g = supplierAssuranceNodes(supplier, 'gap', { active: 'obj:z' });
    expect(g.nodes.find((x) => x.id === 'e-none').lit).toBe(NO_EVIDENCE_STRIPE);
  });
});
