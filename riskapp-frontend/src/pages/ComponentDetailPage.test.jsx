// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';

const api = vi.hoisted(() => ({
  getComponent: vi.fn(),
  updateComponent: vi.fn(),
  deleteComponent: vi.fn(),
  getUsers: vi.fn(async () => []),
  getSupplierRelationships: vi.fn(async () => []),
  getViewMode: vi.fn(async () => ({ view_mode: 'business' })), setViewMode: vi.fn(async () => ({})),
  raiseFindingAction: vi.fn(), revokeFindingAcceptance: vi.fn(),
}));
vi.mock('../api', () => api);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => c === 'components.write' || c === 'components.read' }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));

import { ComponentDetailPage } from './ComponentDetailPage';

const DUP = { id: 'c-dup', name: 'Kiosk network (duplicate)', component_type: 'technology', status: 'unknown', systems: [], vulnerable_on: [] };
const draw = () => render(
  <MemoryRouter initialEntries={['/components/c-dup']}>
    <Routes>
      <Route path="/components/:id" element={<ComponentDetailPage />} />
      <Route path="/technology" element={<p>Technology library</p>} />
    </Routes>
  </MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getComponent.mockResolvedValue(DUP);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

test('a component nothing uses is deleted, and the page returns to its library', async () => {
  api.deleteComponent.mockResolvedValue();
  draw();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(api.deleteComponent).toHaveBeenCalledWith('c-dup'));
  expect(await screen.findByText('Technology library')).toBeInTheDocument();
});

test('one still in use is refused, and the page says where it is used', async () => {
  api.deleteComponent.mockRejectedValue({ response: { status: 409, data: { error: 'Kiosk network (duplicate) is still in use: 1 system (Tourist Information Points – kiosks).' } } });
  draw();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('1 system (Tourist Information Points – kiosks)');
});

test('nothing happens unless confirmed', async () => {
  window.confirm.mockReturnValue(false);
  draw();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(api.deleteComponent).not.toHaveBeenCalled();
});
