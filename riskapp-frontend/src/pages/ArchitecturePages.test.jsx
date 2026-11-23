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
  roles: [],
  rules: [{ id: 'r1', pattern_name: 'CrowdStrike EDR', standard_name: 'MIG Security Architecture Standard', systems: 12,
            triggers: [{ id: 'w1', name: 'Windows Server 2025', component_type: 'technology', systems: 6 }], pattern_triggers: [] },
          { id: 'r2', pattern_name: 'Provided by the supplier', standard_name: 'MIG Security Architecture Standard', systems: 11,
            triggers: [], pattern_triggers: ['S2'] }],
  builds: [{ id: 'b1', name: 'MIG Windows server', components: [] },
           { id: 'b2', name: 'Supplier SaaS', system_pattern: 'S2', components: [] }],
};
vi.mock('../api', () => ({
  getArchitecture: vi.fn(async () => LIB),
  listSecuritySolutions: vi.fn(async () => []),
  listComponents: vi.fn(async () => []),
  createArchitectureItem: vi.fn(), deleteArchitectureItem: vi.fn(), updateArchitectureItem: vi.fn(async () => ({})),
  addArchitectureComponent: vi.fn(), removeArchitectureComponent: vi.fn(),
  addRulePatternTrigger: vi.fn(async () => ({})), removeRulePatternTrigger: vi.fn(async () => ({})),
}));

import { updateArchitectureItem, addRulePatternTrigger } from '../api';
import { SecurityPatternTriggersPage, ArchitecturePatternsPage } from './ArchitecturePages';

const renderPage = (Page) => render(<MemoryRouter><Page /></MemoryRouter>);

describe('the security architecture pages', () => {
  test('Security pattern triggers: each solution, where it comes from and what triggers it', async () => {
    caps = new Set(['controls.read']);
    renderPage(SecurityPatternTriggersPage);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'CrowdStrike EDR' })).toBeInTheDocument());
    expect(screen.getByText(/Required by MIG Security Architecture Standard · applies to 12 systems today/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Windows Server 2025' })).toHaveAttribute('href', '/components/w1');
    // v178: a system pattern can be the trigger.
    expect(screen.getByRole('link', { name: 'S2 · Software as a service (SaaS)' })).toHaveAttribute('href', '/system-patterns#S2');
    expect(screen.getByRole('link', { name: 'System patterns' })).toHaveAttribute('href', '/system-patterns');
  });

  test('Standard builds: the builds, now called standard builds', async () => {
    // v155: patterns and the template are edited with architecture.write
    caps = new Set(['controls.read', 'architecture.write']);
    renderPage(ArchitecturePatternsPage);
    await waitFor(() => expect(screen.getByText('MIG Windows server')).toBeInTheDocument());
    expect(screen.getByText('Create standard build')).toBeInTheDocument();
  });

  test('Standard builds: an editor can rename one', async () => {
    caps = new Set(['controls.read', 'architecture.write']);
    renderPage(ArchitecturePatternsPage);
    await waitFor(() => expect(screen.getByText('MIG Windows server')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Rename MIG Windows server' }));
    fireEvent.change(screen.getByLabelText('New name for MIG Windows server'), { target: { value: 'MIG Windows server 2025' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(updateArchitectureItem).toHaveBeenCalledWith('builds', 'b1', { name: 'MIG Windows server 2025' }));
  });

  test('Standard builds: the key message first, the rest folded; each build says the pattern it follows (v182)', async () => {
    caps = new Set(['controls.read']);
    renderPage(ArchitecturePatternsPage);
    await waitFor(() => expect(screen.getByText('MIG Windows server')).toBeInTheDocument());
    expect(screen.getByText(/A standard build is a short-hand way of creating a system using repeatable components/)).toBeInTheDocument();
    expect(screen.getByText('More about standard builds').closest('details').open).toBe(false);
    // The page title is the only "Standard builds" heading.
    expect(screen.queryByRole('heading', { level: 2, name: /Standard builds/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'S2 · Software as a service (SaaS)' })).toHaveAttribute('href', '/system-patterns#S2');
    // No pattern is allowed, with a warning.
    expect(screen.getByText(/follows no pattern yet/)).toBeInTheDocument();
  });

  test('Standard builds: an architect chooses the pattern a build follows', async () => {
    caps = new Set(['controls.read', 'architecture.write']);
    renderPage(ArchitecturePatternsPage);
    fireEvent.change(await screen.findByLabelText('The system pattern MIG Windows server follows'), { target: { value: 'S1' } });
    await waitFor(() => expect(updateArchitectureItem).toHaveBeenCalledWith('builds', 'b1', { system_pattern: 'S1' }));
  });

  test('a reader cannot rename a standard build', async () => {
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
    expect(screen.queryByText('Create standard build')).toBeNull();
    expect(screen.getByText('view only')).toBeInTheDocument();
  });

  test('the security team can edit', async () => {
    caps = new Set(['controls.read', 'controls.write']);
    renderPage(SecurityPatternTriggersPage);
    await waitFor(() => expect(screen.getByText('Create rule')).toBeInTheDocument());
    expect(screen.getByLabelText('Remove trigger Windows Server 2025')).toBeInTheDocument();
  });

  test('the security team can add a system pattern as a trigger', async () => {
    caps = new Set(['controls.read', 'controls.write']);
    renderPage(SecurityPatternTriggersPage);
    const add = await screen.findByLabelText('System pattern to add as a trigger of the CrowdStrike EDR rule');
    fireEvent.change(add, { target: { value: 'S1' } });
    await waitFor(() => expect(addRulePatternTrigger).toHaveBeenCalledWith('r1', 'S1'));
    expect(screen.getByLabelText('Remove trigger S2')).toBeInTheDocument();
  });
});
