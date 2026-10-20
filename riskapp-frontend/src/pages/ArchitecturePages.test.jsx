// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));
let caps = new Set(['controls.read']);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.has(c) }) }));

const LIB = {
  active_systems: 53,
  documents: [{ id: 'd1', name: 'MIG Security Architecture Standard', document_kind: 'standard', status: 'operational' }],
  groups: [{ id: 'g1', name: 'Network zone', standard_name: 'MIG Security Architecture Standard', systems_unanswered: 22,
             members: [{ id: 'z1', name: 'MIGNet (internal)', component_type: 'technology', systems: 30 }], triggers: [] }],
  rules: [{ id: 'r1', pattern_name: 'CrowdStrike EDR', standard_name: 'MIG Security Architecture Standard', systems: 12,
            triggers: [{ id: 'w1', name: 'Windows Server 2025', component_type: 'technology', systems: 6 }] }],
  builds: [{ id: 'b1', name: 'MIG Windows server', components: [] }],
};
vi.mock('../api', () => ({
  getArchitecture: vi.fn(async () => LIB),
  listSecuritySolutions: vi.fn(async () => []),
  listComponents: vi.fn(async () => []),
  createArchitectureItem: vi.fn(), deleteArchitectureItem: vi.fn(), updateArchitectureItem: vi.fn(async () => ({})),
  addArchitectureComponent: vi.fn(), removeArchitectureComponent: vi.fn(),
}));

import { updateArchitectureItem } from '../api';
import { ArchitectureTemplatePage, SecurityPatternTriggersPage, ArchitecturePatternsPage } from './ArchitecturePages';

const renderPage = (Page) => render(<MemoryRouter><Page /></MemoryRouter>);

describe('the security architecture, as three pages', () => {
  test('Systems architecture template: the groups, with the old heading as its comment', async () => {
    caps = new Set(['controls.read']);
    renderPage(ArchitectureTemplatePage);
    await waitFor(() => expect(screen.getByText('Network zone')).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1, name: 'Systems architecture template' })).toBeInTheDocument();
    expect(screen.getByText('What every system must record.')).toBeInTheDocument();
    expect(screen.getByText(/22 systems have not recorded one/)).toBeInTheDocument();
    expect(screen.getByText(/Each system should include one component from each group/)).toBeInTheDocument();
    expect(screen.getByText(/applies to all 53 systems/)).toBeInTheDocument();
    expect(screen.queryByText('CrowdStrike EDR')).toBeNull();
    expect(screen.getByRole('link', { name: 'Security pattern triggers' })).toHaveAttribute('href', '/security-pattern-triggers');
    expect(screen.getByRole('link', { name: 'System architecture patterns' })).toHaveAttribute('href', '/architecture-patterns');
  });

  test('Security pattern triggers: each solution, where it comes from and what triggers it', async () => {
    caps = new Set(['controls.read']);
    renderPage(SecurityPatternTriggersPage);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'CrowdStrike EDR' })).toBeInTheDocument());
    expect(screen.getByText(/Required by MIG Security Architecture Standard · applies to 12 systems today/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Windows Server 2025' })).toHaveAttribute('href', '/components/w1');
    expect(screen.queryByText('Network zone')).toBeNull();
  });

  test('System architecture patterns: the builds, now called patterns', async () => {
    // v155: patterns and the template are edited with architecture.write
    caps = new Set(['controls.read', 'architecture.write']);
    renderPage(ArchitecturePatternsPage);
    await waitFor(() => expect(screen.getByText('MIG Windows server')).toBeInTheDocument());
    expect(screen.getByText('Create pattern')).toBeInTheDocument();
  });

  test('System architecture patterns: an editor can rename a pattern', async () => {
    caps = new Set(['controls.read', 'architecture.write']);
    renderPage(ArchitecturePatternsPage);
    await waitFor(() => expect(screen.getByText('MIG Windows server')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Rename MIG Windows server' }));
    fireEvent.change(screen.getByLabelText('New name for MIG Windows server'), { target: { value: 'MIG Windows server 2025' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(updateArchitectureItem).toHaveBeenCalledWith('builds', 'b1', { name: 'MIG Windows server 2025' }));
  });

  test('a reader cannot rename a pattern', async () => {
    caps = new Set(['controls.read']);
    renderPage(ArchitecturePatternsPage);
    await waitFor(() => expect(screen.getByText('MIG Windows server')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Rename MIG Windows server' })).toBeNull();
  });

  test('a reader sees no editing controls', async () => {
    caps = new Set(['controls.read']);
    renderPage(SecurityPatternTriggersPage);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'CrowdStrike EDR' })).toBeInTheDocument());
    expect(screen.queryByText('Create rule')).toBeNull();
    expect(screen.queryByLabelText(/Remove trigger Windows Server 2025/)).toBeNull();
    expect(screen.getByText('view only')).toBeInTheDocument();
  });

  test('the security team\'s permission alone does not edit patterns — that is the architect\'s', async () => {
    caps = new Set(['controls.read', 'controls.write']);
    renderPage(ArchitecturePatternsPage);
    await waitFor(() => expect(screen.getByText('MIG Windows server')).toBeInTheDocument());
    expect(screen.queryByText('Create pattern')).toBeNull();
    expect(screen.getByText('view only')).toBeInTheDocument();
  });

  test('the security team can edit', async () => {
    caps = new Set(['controls.read', 'controls.write']);
    renderPage(SecurityPatternTriggersPage);
    await waitFor(() => expect(screen.getByText('Create rule')).toBeInTheDocument());
    expect(screen.getByLabelText('Remove trigger Windows Server 2025')).toBeInTheDocument();
  });
});
