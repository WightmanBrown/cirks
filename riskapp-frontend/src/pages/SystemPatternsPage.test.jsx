// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { S2, HR_FIT, BILLING_FIT } from '../components/systemPatternFixtures';

vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));
vi.mock('../hooks/useScrollRestore', () => ({ useScrollRestore: () => {} }));
let caps = new Set(['controls.read']);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.has(c) }) }));
const PI = { id: 'pi', name: 'Raspberry Pi 5', component_type: 'technology', roles: ['operating_system'] };
vi.mock('../api', () => ({
  getSystemPatterns: vi.fn(async () => ({
    patterns: [S2, { ...S2, code: 'S5', name: 'Network infrastructure', systems: 0, variants: undefined }],
    systems: [
      { id: 'hr', name: 'HR System', system_pattern: 'S2', department_name: 'HR', pattern_fit: HR_FIT },
      { id: 'bill', name: 'Billing and meter reading', system_pattern: 'S2', department_name: 'Utilities', pattern_fit: BILLING_FIT },
      { id: 'hids', name: 'Host Intrusion Detection System', system_pattern: null, is_security_system: true, pattern_fit: { state: 'no_pattern', slots: [] } },
    ],
    roles: [
      { key: 'operating_system', labels: ['Operating system', 'Computer it runs on'], required_in: ['S1', 'S4', 'S5'], optional_in: ['S3'], members: [PI] },
      { key: 'hosting', labels: ['Where it runs'], required_in: ['S1'], optional_in: [], members: [] },
    ],
  })),
  listComponents: vi.fn(async () => [PI]),
  previewComponentRoles: vi.fn(async () => ({ systems: [{ id: 'rms', name: 'Risk Management System', new_gaps: [], closed_gaps: [] }], gaps_created: 0 })),
  setComponentRoles: vi.fn(async () => ({})),
}));
import { previewComponentRoles } from '../api';

import { SystemPatternsPage, closestPattern } from './SystemPatternsPage';

test('each pattern: a tile with its gaps, its diagram, and the systems that follow it', async () => {
  render(<MemoryRouter><SystemPatternsPage /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: /S2 · Supplier-run service/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /S2 · 2 systems.*1 with a gap/ })).toHaveAttribute('href', '#S2');
  expect(screen.getByRole('link', { name: /S5 · 0 systems.*no system follows it yet/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'HR System' })).toHaveAttribute('href', '/systems/hr');
  expect(screen.getAllByText('✗ the service').length).toBe(1);   // Billing's gap, in words
  expect(screen.getByText(/Also in our own tenancy/)).toBeInTheDocument();
});

test('a pattern\'s systems are folded to a count until the reader opens them', async () => {
  render(<MemoryRouter><SystemPatternsPage /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: 'HR System' });
  const fold = link.closest('details');
  expect(fold).not.toBeNull();
  expect(fold.open).toBe(false);
  expect(fold.querySelector('summary').textContent).toMatch(/\d+ systems? follows? it/);
});

test('the page leads with what a pattern is for and how a standard build relates; the rest is folded', async () => {
  render(<MemoryRouter><SystemPatternsPage /></MemoryRouter>);
  expect(await screen.findByText(/A system pattern decides which security questions a system must answer/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'standard build' })).toHaveAttribute('href', '/architecture-patterns');
  expect(screen.getByText(/only to answer security questions/)).toBeInTheDocument();
  const more = screen.getByText('More about system patterns').closest('details');
  expect(more.open).toBe(false);
  expect(more.textContent).toMatch(/Where does the system run\? Who runs it\?/);
});

test('systems with no pattern are listed, and said to be asked nothing', async () => {
  render(<MemoryRouter><SystemPatternsPage /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: /Pattern not stated/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Host Intrusion Detection System' })).toBeInTheDocument();
  expect(screen.getByText(/security system/, { selector: 'span' })).toBeInTheDocument();
});

test('which components fulfil which roles is listed once; an architect changes it through the preview', async () => {
  render(<MemoryRouter><SystemPatternsPage /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: /Which components fulfil which roles\?/ })).toBeInTheDocument();
  expect(screen.getByText('required for S1, S4, S5; optional for S3')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Raspberry Pi 5' })).toBeInTheDocument();
  expect(screen.queryByLabelText(/Not operating system: Raspberry Pi 5/)).toBeNull();     // a reader cannot change it
});

test('removing a role opens the preview of what it does', async () => {
  caps = new Set(['controls.read', 'architecture.write']);
  render(<MemoryRouter><SystemPatternsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Not operating system: Raspberry Pi 5'));
  expect(await screen.findByText(/No slot is answered or left empty/)).toBeInTheDocument();
  expect(previewComponentRoles).toHaveBeenCalledWith('pi', []);
  caps = new Set(['controls.read']);
});

describe('systems with no pattern: an architect\'s worklist', () => {
  const S1 = { code: 'S1', name: 'Application on servers we run', slots: [
    { key: 'operating_system', label: 'Operating system', fill: 'role', required: true , position: 'top', arrow: { dir: 'out', label: 'x' } },
    { key: 'hosting', label: 'Where it runs', fill: 'role', required: true, position: 'bottom', arrow: { dir: 'out', label: 'x' } },
    { key: 'network', label: 'Network', fill: 'role', required: true , position: 'right', arrow: { dir: 'out', label: 'x' } },
    { key: 'users', label: 'Who uses it', fill: 'role', required: false , position: 'left', arrow: { dir: 'out', label: 'x' } },
    { key: 'application', label: 'The application', fill: 'explicit', required: false , position: 'centre' },
  ] };
  const S4 = { code: 'S4', name: 'End-user device', slots: [
    { key: 'operating_system', label: 'Device and operating system', fill: 'role', required: true , position: 'centre' },
    { key: 'sign_in', label: 'Sign-in', fill: 'role', required: true , position: 'right', arrow: { dir: 'out', label: 'x' } },
  ] };

  test('the closest pattern is the one whose required questions it answers best, with what is still open', () => {
    const rec = [{ name: 'Windows Server 2025', roles: ['operating_system'] }, { name: 'MIGNet', roles: ['network'] }, { name: 'ArcGIS', roles: [] }];
    expect(closestPattern([S4, S1], rec)).toMatchObject({ code: 'S1', answered: 2, of: 3, missing: ['where it runs'] });
  });

  test('nothing with a role recorded: no suggestion', () => {
    expect(closestPattern([S1], [{ name: 'ArcGIS', roles: [] }])).toBeNull();
    expect(closestPattern([S1], [])).toBeNull();
  });

  test('each is listed straight after the patterns, with what it records by role and its closest pattern', async () => {
    const { getSystemPatterns } = await import('../api');
    getSystemPatterns.mockResolvedValueOnce({
      patterns: [S1, S4],
      systems: [
        { id: 'gis', name: 'Island GIS', system_pattern: null, department_name: 'Planning', pattern_fit: { state: 'no_pattern', slots: [] },
          recorded: [{ id: 'w', name: 'Windows Server 2025', roles: ['operating_system'] }, { id: 'a', name: 'ArcGIS', roles: [] }] },
        { id: 'hids', name: 'Host Intrusion Detection System', system_pattern: null, is_security_system: true, pattern_fit: { state: 'no_pattern', slots: [] }, recorded: [] },
      ],
      roles: [{ key: 'operating_system', labels: ['Operating system'], required_in: ['S1'], optional_in: [], members: [] }],
    });
    render(<MemoryRouter><SystemPatternsPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /1 business system.*Pattern not stated.*1 business system to place · 1 security system \(optional\)/ })).toHaveAttribute('href', '#unstated');
    const section = document.getElementById('unstated');
    // Before "Which components fulfil which roles?", so the tile's jump lands on it.
    expect(section.compareDocumentPosition(document.getElementById('roles')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Business systems · 1' })).toBeInTheDocument();
    // Security systems are folded away: a pattern is optional for them, not a gap.
    const folded = screen.getByText(/^Security systems · 1/).closest('details');
    expect(folded).not.toHaveAttribute('open');
    expect(folded).toHaveTextContent('optional: a pattern makes their own record checkable');
    const row = screen.getByRole('link', { name: 'Island GIS' }).closest('tr');
    expect(row).toHaveTextContent('Operating system: Windows Server 2025');
    expect(row).toHaveTextContent('No role: ArcGIS');
    // Only an operating system has a role: half of S4's required questions beat a third of S1's.
    expect(row).toHaveTextContent('S4 · End-user device');
    expect(row).toHaveTextContent('1 of its 2 required questions answered; not: sign-in');
    expect(screen.getByRole('link', { name: 'Host Intrusion Detection System' }).closest('tr')).toHaveTextContent('nothing recorded');
  });
});
