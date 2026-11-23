// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The simple menu (v183, owner 2026-11-18): an information asset owner's menu
// leaves out the design and library pages, with a switch to the full menu.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

let who = { id: 'u1', role: 'information_asset_owner', email: 'g@x' };
let saved = null;
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: who, logout: vi.fn(), hasCapability: () => true }),
}));
vi.mock('../context/HelpContext', () => ({ useHelp: () => ({ canEditHelp: false, editMode: false, setEditMode: vi.fn() }) }));
vi.mock('../api', () => ({
  getMenuMode: vi.fn(async () => {
    const d = ['information_asset_owner'].includes(who.role) ? 'simple' : 'full';
    return { menu_mode: saved || d, chosen: saved, role_default: d };
  }),
  putMenuMode: vi.fn(async (m) => { saved = m; return { menu_mode: m, chosen: m, role_default: 'simple' }; }),
}));

import { Shell, tidyMenu } from './Shell';
import { resetMenuModeCache } from '../hooks/useMenuMode';
import { putMenuMode } from '../api';

const show = () => render(<MemoryRouter><Shell><p>page</p></Shell></MemoryRouter>);
const open = (name) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));

beforeEach(() => { resetMenuModeCache(); saved = null; });

test('an owner gets the simple menu: no control library or security architecture, and a switch to the full menu', async () => {
  who = { id: 'u1', role: 'information_asset_owner', email: 'g@x' };
  show();
  // Security Controls is left with one entry, so it becomes a plain link.
  expect(await screen.findByRole('button', { name: 'Policies & documents' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Security Controls/ })).toBeNull();
  open('Risk Management');
  expect(screen.queryByRole('button', { name: 'Threats' })).toBeNull();
  open('Business Architecture');
  expect(screen.queryByText('System patterns')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: /Show the full menu \(\d+ more\)/ })[0]);
  await waitFor(() => expect(putMenuMode).toHaveBeenCalledWith('full'));
  open('Security Controls');
  expect(await screen.findByRole('button', { name: 'Control Library' })).toBeInTheDocument();
});

test('the CISO gets the full menu, with a switch to the simple one', async () => {
  who = { id: 'u2', role: 'ciso', email: 'c@x' };
  show();
  open('Security Controls');
  expect(await screen.findByRole('button', { name: 'Control Library' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show the simple menu' })).toBeInTheDocument();
});

test('tidyMenu drops a header with nothing under it, and a divider with nothing after it', () => {
  const items = [{ path: '/a' }, { type: 'header', label: 'Empty' }, { type: 'header', label: 'Kept' }, { path: '/b' }, { type: 'divider' }];
  expect(tidyMenu(items).map(i => i.label || i.path || i.type)).toEqual(['/a', 'Kept', '/b']);
});
