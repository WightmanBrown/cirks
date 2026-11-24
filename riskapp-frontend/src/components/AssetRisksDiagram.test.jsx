// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { assetSystemsOf, assetRisksNodes } from './AssetRisksDiagram';
import { departmentColour } from '../utils/departmentColour';

const asset = {
  name: 'Patient records', department_id: 'health', department_name: 'Health', confidentiality: 5, integrity: 4, availability: 3,
  linked_systems: [
    { id: 'pas', name: 'Patient admin', department_id: 'health', department_name: 'Health' },
    { id: 'mail', name: 'Email', department_id: 'comms', department_name: 'Communications' },
    { id: 'arch', name: 'Archive', department_id: 'health', department_name: 'Health' },
  ],
  risk_paths: [
    { risk_id: 'r1', risk_score: 12, system_id: 'pas', system_name: 'Patient admin', threat_id: 't1', threat_name: 'Ransomware' },
    { risk_id: 'r2', risk_score: 6, system_id: 'pas', system_name: 'Patient admin', threat_id: 't2', threat_name: 'Misconfiguration' },
    { risk_id: 'r3', risk_score: 25, system_id: 'mail', system_name: 'Email', threat_id: 't3', threat_name: 'Phishing' },
  ],
};

describe('assetSystemsOf', () => {
  it('orders the systems worst risk first and keeps one with no risk', () => {
    const s = assetSystemsOf(asset);
    expect(s.map((x) => x.id)).toEqual(['mail', 'pas', 'arch']);
    expect(s[1].risks.map((r) => r.risk_id)).toEqual(['r1', 'r2']);
    expect(s[2].worst).toBeNull();
  });
});

describe('assetRisksNodes', () => {
  it('draws asset → system → risk for the chosen system', () => {
    const { nodes, links } = assetRisksNodes(asset, 'pas');
    const node = (id) => nodes.find((n) => n.id === id);
    expect(node('asset').stripe).toBe(departmentColour('health'));
    expect(node('s-mail').stripe).toBe(departmentColour('comms'));
    expect(node('s-mail').detail).toBe('Communications');
    expect(node('s-pas').selected).toBe(true);
    expect(node('r-r1').col).toBe(2);
    expect(node('r-r1')).toMatchObject({ title: 'Ransomware', detail: 'High risk' });
    expect(nodes.some((n) => n.col === 3)).toBe(false);
    expect(node('r-r3')).toBeUndefined();
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 's-pas', to: 'r-r1' }),
    ]));
  });

  it('defaults to the worst system and says when a system has no risk', () => {
    expect(assetRisksNodes(asset, null).chosen.id).toBe('mail');
    const { nodes } = assetRisksNodes(asset, 'arch');
    expect(nodes.find((n) => n.id === 'r-none')).toMatchObject({ tone: 'good', title: 'None active' });
  });

  it('says when the asset is held in no system', () => {
    const { nodes } = assetRisksNodes({ ...asset, linked_systems: [], risk_paths: [] }, null);
    expect(nodes.find((n) => n.id === 's-none')).toMatchObject({ tone: 'bad' });
  });
});
