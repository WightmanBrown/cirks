// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { serviceSystemsNodes, serviceAssetsNodes } from './ServiceSystemsDiagram';
import { departmentColour } from '../utils/departmentColour';

const service = {
  name: 'Health records', department_id: 'health', department_name: 'Health',
  linked_systems: [
    { id: 'pas', name: 'Patient admin', department_id: 'health', department_name: 'Health', asset_ids: ['rec', 'apt'] },
    { id: 'mail', name: 'Email', department_id: 'comms', department_name: 'Communications', asset_ids: [] },
    { id: 'bak', name: 'Backup', department_id: 'comms', department_name: 'Communications', asset_ids: ['rec'] },
  ],
  linked_information_assets: [
    { id: 'rec', name: 'Patient records', confidentiality: 5, integrity: 4, availability: 3, department_id: 'health' },
    { id: 'apt', name: 'Appointments', confidentiality: 2, integrity: 2, availability: 4, department_id: 'health' },
  ],
  risk_paths: [
    { risk_id: 'r1', risk_score: 12, system_id: 'pas', threat_name: 'Ransomware', asset_id: 'rec' },
    { risk_id: 'r2', risk_score: 25, system_id: 'mail', threat_name: 'Phishing', asset_id: null },
  ],
};

describe('serviceSystemsNodes', () => {
  const { nodes, links } = serviceSystemsNodes(service);
  const node = (id) => nodes.find((n) => n.id === id);

  it('puts the owning department first, each in its colour, with its systems', () => {
    expect(node('d-health')).toMatchObject({ tag: 'Department · owner', row: 0.5, stripe: departmentColour('health') });
    expect(node('d-comms').stripe).toBe(departmentColour('comms'));
    expect(links.filter((l) => l.from === 'd-comms').map((l) => l.to)).toEqual(['s-mail', 's-bak']);
  });

  it('runs each system through the service\'s assets in it to its worst risk', () => {
    expect(node('s-pas').tag).toBe('System · 2 assets');
    expect(links.filter((l) => l.from === 's-pas').map((l) => l.to)).toEqual(['a-pas-rec', 'a-pas-apt']);
    expect(links.find((l) => l.from === 'a-pas-rec').to).toBe('w-pas');
    expect(node('w-pas')).toMatchObject({ tag: 'Worst risk', title: 'Ransomware' });
  });

  it('marks a system holding none of the service\'s information as a dependency', () => {
    expect(node('s-mail')).toMatchObject({ tag: 'Dependency only', tone: 'quiet' });
    expect(links.find((l) => l.from === 's-mail' && l.to === 'w-mail').dashed).toBe(true);
    expect(node('w-bak')).toMatchObject({ title: 'None active', tone: 'good' });
  });
});

describe('serviceAssetsNodes', () => {
  it('joins each asset to the systems holding it, and lights them when it is chosen', () => {
    const { nodes, links } = serviceAssetsNodes(service, { active: 'asset:apt' });
    expect(links.filter((l) => l.from === 'a-rec').map((l) => l.to).sort()).toEqual(['s-bak', 's-pas']);
    expect(nodes.find((n) => n.id === 's-mail')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'a-apt').selected).toBe(true);
    expect(nodes.find((n) => n.id === 's-pas').lit).toBeTruthy();
    expect(nodes.find((n) => n.id === 's-bak').faded).toBe(true);
    expect(links.find((l) => l.from === 'a-rec' && l.to === 's-pas').faded).toBe(true);
  });
});
