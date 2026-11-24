// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { serviceSystemsOf, serviceRisksNodes } from './ServiceRisksDiagram';
import { departmentColour } from '../utils/departmentColour';

const service = {
  name: 'Health records', department_id: 'health', department_name: 'Health', effective_c: 4, effective_i: 5, effective_a: 3,
  linked_systems: [
    { id: 'pas', name: 'Patient admin', department_id: 'health', department_name: 'Health' },
    { id: 'mail', name: 'Email', department_id: 'comms', department_name: 'Communications' },
    { id: 'img', name: 'Imaging', department_id: 'health', department_name: 'Health' },
  ],
  linked_information_assets: [
    { id: 'rec', name: 'Patient records', confidentiality: 5, integrity: 4, availability: 3, department_id: 'health', department_name: 'Health' },
    { id: 'apt', name: 'Appointments', confidentiality: 2, integrity: 2, availability: 4, department_id: 'health', department_name: 'Health' },
  ],
  risk_paths: [
    { risk_id: 'r1', risk_score: 12, system_id: 'pas', threat_id: 't1', threat_name: 'Ransomware', asset_id: 'rec' },
    { risk_id: 'r1', risk_score: 12, system_id: 'pas', threat_id: 't1', threat_name: 'Ransomware', asset_id: 'apt' },
    { risk_id: 'r2', risk_score: 6, system_id: 'pas', threat_id: 't2', threat_name: 'Misconfiguration', asset_id: 'rec' },
    { risk_id: 'r3', risk_score: 25, system_id: 'mail', threat_id: 't3', threat_name: 'Phishing', asset_id: null },
  ],
};

describe('serviceSystemsOf', () => {
  it('orders the systems worst risk first, each with its risks and the service\'s assets in it', () => {
    const s = serviceSystemsOf(service);
    expect(s.map((x) => x.id)).toEqual(['mail', 'pas', 'img']);
    expect(s[1].risks.map((r) => r.risk_id)).toEqual(['r1', 'r2']);
    expect(s[1].assets.map((a) => a.id)).toEqual(['rec', 'apt']);
    expect(s[0].assets).toEqual([]);
  });
});

describe('serviceRisksNodes', () => {
  const { nodes, links } = serviceRisksNodes(service, 'pas');
  const node = (id) => nodes.find((n) => n.id === id);

  it('colours the service and each system by its department', () => {
    expect(node('service').stripe).toBe(departmentColour('health'));
    expect(node('s-mail').stripe).toBe(departmentColour('comms'));
    expect(node('s-mail').detail).toBe('Communications');
    expect(node('s-pas').detail).toBeNull();
    expect(node('s-pas')).toMatchObject({ selected: true, tag: 'System · 2 risks' });
    expect(node('s-img').tone).toBe('quiet');
  });

  it('draws the chosen system\'s risks and the assets they would harm', () => {
    expect(node('r-r1')).toMatchObject({ title: 'Ransomware', tag: 'Risk' });
    expect(node('r-r3')).toBeUndefined();
    expect(links.filter((l) => l.from === 'r-r1').map((l) => l.to)).toEqual(['a-rec', 'a-apt']);
    expect(node('a-rec').stripe).toBe(departmentColour('health'));
  });

  it('says when the chosen system holds none of the service\'s assets, or has no risks', () => {
    expect(serviceRisksNodes(service, 'mail').nodes.find((n) => n.id === 'a-none')).toBeTruthy();
    expect(serviceRisksNodes(service, 'img').nodes.find((n) => n.id === 'r-none').title).toBe('None active');
  });
});
