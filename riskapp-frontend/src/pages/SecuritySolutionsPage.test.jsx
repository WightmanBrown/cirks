// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));
let caps = new Set(['controls.read']);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.has(c) }) }));

const EDR = {
  id: 's1', name: 'CrowdStrike EDR', kind: 'parts', notes: null, systems_in_place: 22,
  objectives: [{ id: 'o1', title: 'Networks are monitored', reference_code: 'DE.CM-01' }, { id: 'o2', title: 'Logs', reference_code: 'PR.PS-04' }],
  parts: [{ id: 'p1', component_id: 'c1', component_name: 'Crowdstrike Falcon Agent', component_type: 'technology', location: 'on_system' }],
};
const SUP = { id: 's2', name: 'Provided by the supplier', kind: 'supplier', systems_in_place: 7, objectives: [], parts: [] };
vi.mock('../api', () => ({
  listSecuritySolutions: vi.fn(async () => [EDR, SUP]),
  createSecuritySolution: vi.fn(),
  getSecuritySolution: vi.fn(async () => ({ ...EDR, systems: [{ system_id: 'x1', system_name: 'Medical Records System', department_name: 'Health', state: 'degraded', degraded_parts: ['Crowdstrike Falcon Agent'] }] })),
  updateSecuritySolution: vi.fn(), deleteSecuritySolution: vi.fn(), addSecuritySolutionObjective: vi.fn(),
  removeSecuritySolutionObjective: vi.fn(), addSecuritySolutionPart: vi.fn(), removeSecuritySolutionPart: vi.fn(),
  getControls: vi.fn(async () => ({ controls: [] })), listComponents: vi.fn(async () => []),
  getComponentRecordedOn: vi.fn(), updateComponent: vi.fn(),
}));

import { SecuritySolutionsPage } from './SecuritySolutionsPage';
import { SecuritySolutionDetailPage } from './SecuritySolutionDetailPage';

describe('SecuritySolutionsPage', () => {
  test('lists each solution once with what it delivers, and unfolds to its card', async () => {
    caps = new Set(['controls.read']);
    render(<MemoryRouter initialEntries={['/security-solutions']}><SecuritySolutionsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('CrowdStrike EDR')).toBeInTheDocument());
    expect(screen.getByText('2 objectives')).toBeInTheDocument();
    expect(screen.getByText('22 systems')).toBeInTheDocument();
    expect(screen.queryByText('Open details →')).toBeNull();
    fireEvent.click(screen.getByText('CrowdStrike EDR'));
    expect(screen.getByRole('link', { name: 'Open details →' })).toHaveAttribute('href', '/security-solutions/s1');
    expect(screen.getByRole('link', { name: 'DE.CM-01 Networks are monitored' })).toHaveAttribute('href', '/controls/o1');
    expect(screen.queryByText('Create')).toBeNull();
  });

  test('?selected= opens the row; search finds by objective', async () => {
    render(<MemoryRouter initialEntries={['/security-solutions?selected=s2']}><SecuritySolutionsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open details →' })).toHaveAttribute('href', '/security-solutions/s2'));
    fireEvent.change(screen.getByLabelText('Search security solutions'), { target: { value: 'PR.PS-04' } });
    expect(screen.queryByText('Provided by the supplier', { selector: 'span' })).toBeNull();
  });
});

describe('SecuritySolutionDetailPage', () => {
  test('shows objectives, parts and where it is in place', async () => {
    caps = new Set(['controls.read', 'controls.write']);
    render(<MemoryRouter initialEntries={['/security-solutions/s1']}>
      <Routes><Route path="/security-solutions/:id" element={<SecuritySolutionDetailPage />} /></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Medical Records System')).toBeInTheDocument());
    expect(screen.getByText('Degraded: Crowdstrike Falcon Agent')).toBeInTheDocument();
    expect(screen.getByText(/It delivers 2 objectives, so a change here changes it for all of them/)).toBeInTheDocument();
    expect(screen.getByText('Remove from the library')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Component parts/ })).toBeInTheDocument();
  });
});
