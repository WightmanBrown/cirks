// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// Scopes (v126): where a control objective applies. Drawing a scope is a
// governance statement (scopes.manage); everyone who can read the SoA can see them.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let caps;
const createScope = vi.fn();
const addScopeSystems = vi.fn();
const removeScopeSystem = vi.fn();

vi.mock('../api', () => ({
  getScopes: () => Promise.resolve({ organisation_system_count: 51,
    scopes: [{ id: 's1', name: 'Cardholder data environment', description: 'PCI', system_count: 3, objective_count: 12 }] }),
  getScope: () => Promise.resolve({
    scope: { id: 's1', name: 'Cardholder data environment', description: 'PCI' },
    systems: [{ id: 'y1', name: 'Payments gateway', is_active: true, department_name: 'Finance' }],
    objectives: [{ control_id: 'c1', title: 'Stored card numbers are tokenised', ref: '2.1' }],
  }),
  getSystems: () => Promise.resolve([{ id: 'y1', name: 'Payments gateway' }, { id: 'y2', name: 'Card vault', is_active: true }]),
  createScope: (...a) => createScope(...a),
  updateScope: vi.fn(), deleteScope: vi.fn(),
  addScopeSystems: (...a) => addScopeSystems(...a),
  removeScopeSystem: (...a) => removeScopeSystem(...a),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'ciso' }, hasCapability: (c) => caps.has(c), capabilitiesReady: true }),
}));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));

const { ScopesPage } = await import('./ScopesPage');
const { ScopeDetailPage } = await import('./ScopeDetailPage');

const list = () => render(<MemoryRouter><ScopesPage /></MemoryRouter>);
const detail = () => render(
  <MemoryRouter initialEntries={['/scopes/s1']}>
    <Routes><Route path="/scopes/:id" element={<ScopeDetailPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  caps = new Set(['controls.read', 'scopes.manage']);
  createScope.mockReset(); addScopeSystems.mockReset(); removeScopeSystem.mockReset();
  createScope.mockResolvedValue({}); addScopeSystems.mockResolvedValue({}); removeScopeSystem.mockResolvedValue({});
});

describe('the scopes list', () => {
  test('shows the whole organisation as the default, beside the drawn scopes', async () => {
    list();
    expect(await screen.findByText('Whole organisation')).toBeInTheDocument();
    expect(screen.getByText('51')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cardholder data environment' })).toHaveAttribute('href', '/scopes/s1');
  });

  test('a manager creates a scope', async () => {
    const user = userEvent.setup();
    list();
    await user.type(await screen.findByRole('textbox', { name: 'Scope name' }), 'Cloud estate');
    await user.click(screen.getByRole('button', { name: 'Create scope' }));
    expect(createScope).toHaveBeenCalledWith({ name: 'Cloud estate', description: '' });
  });

  test('without scopes.manage it is read-only', async () => {
    caps = new Set(['controls.read']);
    list();
    await screen.findByText('Whole organisation');
    expect(screen.queryByRole('button', { name: 'Create scope' })).not.toBeInTheDocument();
    expect(screen.getByText('view only')).toBeInTheDocument();
  });
});

describe('a scope', () => {
  test('lists its systems and the objectives narrowed to it', async () => {
    detail();
    expect(await screen.findByRole('link', { name: 'Payments gateway' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stored card numbers are tokenised' })).toHaveAttribute('href', '/controls/c1');
  });

  test('a manager adds a system not already in it, and removes one', async () => {
    const user = userEvent.setup();
    detail();
    const picker = await screen.findByRole('combobox', { name: 'System to add' });
    // Only systems not already in the scope are offered.
    expect([...picker.querySelectorAll('option')].map(o => o.textContent)).toEqual(['Add a system…', 'Card vault']);
    await user.selectOptions(picker, 'y2');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(addScopeSystems).toHaveBeenCalledWith('s1', ['y2']);
    await user.click(screen.getByRole('button', { name: 'Remove Payments gateway from the scope' }));
    expect(removeScopeSystem).toHaveBeenCalledWith('s1', 'y1');
  });

  test('without scopes.manage nothing can be changed', async () => {
    caps = new Set(['controls.read']);
    detail();
    await screen.findByRole('link', { name: 'Payments gateway' });
    expect(screen.queryByRole('combobox', { name: 'System to add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove|Delete scope|Rename/ })).not.toBeInTheDocument();
  });
});
