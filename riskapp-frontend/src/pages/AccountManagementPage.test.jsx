// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const createUser = vi.fn();
const resetUserPassword = vi.fn(() => Promise.resolve({ ok: true }));
const users = [
  { id: 'u-set', email: 'set@org.local', full_name: 'Has Password', role: 'ciso', is_active: true,
    password_set: true, additional_roles: [] },
  { id: 'u-locked', email: 'locked@org.local', full_name: 'Imported Person', role: 'information_asset_owner',
    is_active: true, password_set: false, additional_roles: [] },
];

vi.mock('../api', () => ({
  getAdminUsers: () => Promise.resolve(users),
  getDepartments: () => Promise.resolve([]),
  createUser: (...a) => createUser(...a),
  patchAdminUser: () => Promise.resolve({}),
  resetUserPassword: (...a) => resetUserPassword(...a),
  resetUserTotp: () => Promise.resolve({}),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { AccountManagementPage, ASSIGNABLE_ROLES } = await import('./AccountManagementPage');
const show = () => render(<MemoryRouter><AccountManagementPage /></MemoryRouter>);

describe('AccountManagementPage', () => {
  test('assignable roles cover the human roles and exclude the ai_agent system role', () => {
    expect(ASSIGNABLE_ROLES).toContain('ciso');
    expect(ASSIGNABLE_ROLES).toContain('admin');
    expect(ASSIGNABLE_ROLES).toContain('meeting_secretary');
    expect(ASSIGNABLE_ROLES).not.toContain('ai_agent');
    expect(new Set(ASSIGNABLE_ROLES).size).toBe(ASSIGNABLE_ROLES.length); // no dupes
  });

  // v164 (owner, 2026-11-02): accounts are created with sign-in locked.
  test('an account with no password set says so and offers Set password, not Reset', async () => {
    show();
    await screen.findByDisplayValue('Imported Person');
    expect(screen.getAllByText('sign-in locked')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Set password' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reset password' })).toHaveLength(1);
  });

  test('setting the password clears the lock', async () => {
    show();
    await screen.findByDisplayValue('Imported Person');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await userEvent.type(screen.getByPlaceholderText(/new password/), 'a-good-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Set' }));
    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('u-locked', 'a-good-password-1'));
    expect(await screen.findByText('Password set: they can sign in.')).toBeInTheDocument();
    expect(screen.queryByText('sign-in locked')).toBeNull();
  });

  test('the new-account form asks for no password', async () => {
    show();
    await screen.findByDisplayValue('Imported Person');
    expect(screen.queryByPlaceholderText(/temporary password/)).toBeNull();
  });
});
