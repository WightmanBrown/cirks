// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { assetServicesNodes } from './AssetServicesDiagram';
import { departmentColour } from '../utils/departmentColour';

const asset = {
  name: 'Pupil records', department_id: 'edu', department_name: 'Education', confidentiality: 4, integrity: 3, availability: 2,
  linked_systems: [
    { id: 'mail', name: 'Email', department_id: 'it', department_name: 'IT' },
    { id: 'mis', name: 'School MIS', department_id: 'edu', department_name: 'Education' },
    { id: 'bak', name: 'Backup', department_id: 'it', department_name: 'IT' },
  ],
  linked_services: [
    { id: 'pri', name: 'Primary', department_id: 'edu', owner_department_id: null, system_ids: ['mis', 'mail'], confidentiality: 4 },
    { id: 'adult', name: 'Adult learning', department_id: 'edu', owner_department_id: 'cult', system_ids: ['mail'], confidentiality: 2 },
  ],
};

describe('assetServicesNodes', () => {
  const { nodes, links } = assetServicesNodes(asset);
  const node = (id) => nodes.find((n) => n.id === id);

  it('draws asset → system → service, each service in its owning department\'s colour', () => {
    expect(node('v-pri').stripe).toBe(departmentColour('edu'));
    expect(node('v-adult').stripe).toBe(departmentColour('cult'));
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'asset', to: 'y-mail' }),
      expect.objectContaining({ from: 'y-mail', to: 'v-adult' }),
      expect.objectContaining({ from: 'y-mis', to: 'v-pri' }),
    ]));
  });

  it('orders systems by the services they deliver and draws one delivering none quiet', () => {
    expect(nodes.filter((n) => n.col === 1).map((n) => n.id)).toEqual(['y-mail', 'y-mis', 'y-bak']);
    expect(node('y-bak')).toMatchObject({ tone: 'quiet', tag: 'System · no service' });
  });

  it('lights a chosen service\'s systems and fades the rest', () => {
    const r = assetServicesNodes(asset, { active: 'svc:adult' });
    const n = (id) => r.nodes.find((x) => x.id === id);
    expect(n('y-mail').lit).toBe(departmentColour('cult'));
    expect(n('y-mis').faded).toBe(true);
    expect(n('v-pri').faded).toBe(true);
    expect(n('v-adult').selected).toBe(true);
  });

  it('says when no service touches it', () => {
    const r = assetServicesNodes({ ...asset, linked_services: [] });
    expect(r.nodes.find((x) => x.id === 'v-none')).toBeTruthy();
  });
});
