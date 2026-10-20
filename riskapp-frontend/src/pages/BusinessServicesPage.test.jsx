// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// Deleting a service was only possible from its detail page, so pruning a
// register of 96 meant opening each one. Selection is multi so that thirty
// deletions get ONE review point — nobody reads the fifth confirmation.
//
// The checkbox must never offer what the server will refuse: the API allows a
// delete only for the owning department, or for admin / security_consultant.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const HEALTH = 'dept-health';
const ROADS  = 'dept-roads';

const svc = (id, name, deptId) => ({
  id, name, department_id: deptId, owner_department_id: deptId,
  department_name: deptId === HEALTH ? 'Health' : 'Roads',
  effective_c: 3, effective_i: 3, effective_a: 3, is_active: true,
});

const rows = [svc('s1', 'Alpha service', HEALTH), svc('s2', 'Beta service', ROADS)];
const deleteBusinessService = vi.fn();
let authUser = { role: 'ciso', department_id: HEALTH };
let caps = ['services.delete'];

vi.mock('../api', () => ({
  getBusinessServices: () => Promise.resolve(rows),
  getBusinessService: (id) => Promise.resolve(rows.find(r => r.id === id)),
  createBusinessService: () => Promise.resolve({}),
  deleteBusinessService: (...a) => deleteBusinessService(...a),
  // The page uses the shared view-mode toggle, which reads and writes the
  // user's stored preference through the same api module.
  getViewMode: () => Promise.resolve({ view_mode: 'business' }),
  putViewMode: () => Promise.resolve({}),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: authUser, hasCapability: (k) => caps.includes(k), capabilitiesReady: true }),
}));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));

const { BusinessServicesPage } = await import('./BusinessServicesPage');
const show = () => render(<MemoryRouter><BusinessServicesPage /></MemoryRouter>);

beforeEach(() => {
  deleteBusinessService.mockReset().mockResolvedValue(undefined);
  authUser = { role: 'ciso', department_id: HEALTH };
  caps = ['services.delete'];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('deleting from the services list', () => {
  test('offers a checkbox only for services this user may delete', async () => {
    show();
    expect(await screen.findByLabelText('Select Alpha service for deletion')).toBeInTheDocument();
    // Beta belongs to another department and this CISO is not admin.
    expect(screen.queryByLabelText('Select Beta service for deletion')).not.toBeInTheDocument();
  });

  test('admin may delete any department\'s service', async () => {
    authUser = { role: 'admin', department_id: null };
    show();
    expect(await screen.findByLabelText('Select Beta service for deletion')).toBeInTheDocument();
  });

  test('without the capability there are no checkboxes at all', async () => {
    caps = [];
    show();
    await screen.findByText('Alpha service');
    expect(screen.queryByLabelText(/for deletion/)).not.toBeInTheDocument();
  });

  test('selecting shows a count and deletes on confirm', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByLabelText('Select Alpha service for deletion'));
    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Delete 1 service/ }));
    await waitFor(() => expect(deleteBusinessService).toHaveBeenCalledWith('s1'));
  });

  test('declining the confirm deletes nothing', async () => {
    window.confirm.mockReturnValue(false);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByLabelText('Select Alpha service for deletion'));
    await user.click(screen.getByRole('button', { name: /Delete 1 service/ }));
    expect(deleteBusinessService).not.toHaveBeenCalled();
  });

  test('select-all covers only the deletable rows, never the refused ones', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByLabelText('Select all deletable services'));
    // Only Alpha is deletable by this user, so the count must be 1 and not 2.
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('a partial failure names what did NOT go, rather than reporting success', async () => {
    const user = userEvent.setup();
    const err = new Error('nope');
    err.response = { data: { error: 'Only the owning department can delete this service' } };
    deleteBusinessService.mockRejectedValueOnce(err);
    show();

    await user.click(await screen.findByLabelText('Select Alpha service for deletion'));
    await user.click(screen.getByRole('button', { name: /Delete 1 service/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toMatch(/1 of 1 could not be deleted.*Alpha service/));
  });
});
