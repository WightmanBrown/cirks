// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

let caps = new Set(['components.write', 'architecture.write']);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.has(c) }) }));
vi.mock('./DateField', () => ({ DateField: (p) => <input {...p} /> }));
vi.mock('../api', () => ({
  createComponent: vi.fn(async (b) => ({ id: 'new1', ...b })),
  updateComponent: vi.fn(async () => ({})),
  addComponentIp: vi.fn(), removeComponentIp: vi.fn(),
  getArchitecture: vi.fn(async () => ({ groups: [
    { id: 'g-net', name: 'Connectivity', members: [{ id: 'm1', component_type: 'technology' }, { id: 'm2', component_type: 'technology' }] },
    { id: 'g-host', name: 'Hosting', members: [{ id: 'm3', component_type: 'facility' }] },
  ] })),
  addArchitectureComponent: vi.fn(async () => ({})),
}));
import { createComponent, updateComponent, addArchitectureComponent, getArchitecture } from '../api';
import { ComponentModal } from './ComponentModal';

const open = (props = {}) => render(<ComponentModal componentType="technology" defaultName="MIG CCTV Network" onClose={vi.fn()} onSaved={vi.fn()} {...props} />);
const create = () => screen.getByRole('button', { name: /^Create/ });

beforeEach(() => { vi.clearAllMocks(); caps = new Set(['components.write', 'architecture.write']); });

describe('the one panel a component is created from', () => {
  test('it cannot be created until both questions are answered', async () => {
    open();
    await screen.findByRole('button', { name: /Connectivity/ });
    expect(create()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Once for the organisation/ }));
    expect(create()).toBeDisabled();                       // the template question is still open
    fireEvent.click(screen.getByRole('button', { name: /Connectivity/ }));
    expect(create()).toBeEnabled();
  });

  test('the group most of whose members share its type is marked as the likely one', async () => {
    open();
    expect(await screen.findByRole('button', { name: 'Connectivity · likely' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hosting' })).toBeInTheDocument();
  });

  test('creating it states its scope and adds it to the template group', async () => {
    const onSaved = vi.fn();
    open({ onSaved });
    fireEvent.click(await screen.findByRole('button', { name: /Connectivity/ }));
    fireEvent.click(screen.getByRole('button', { name: /Once for the organisation/ }));
    expect(screen.getByText(/becomes an allowed answer for/)).toBeInTheDocument();
    fireEvent.click(create());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(createComponent).toHaveBeenCalledWith(expect.objectContaining({ name: 'MIG CCTV Network', component_type: 'technology' }));
    expect(updateComponent).toHaveBeenCalledWith('new1', { instantiation: 'organisational' });
    expect(addArchitectureComponent).toHaveBeenCalledWith('groups', 'g-net', 'members', 'new1');
  });

  test('once per system says what that means for a security solution', async () => {
    open();
    await screen.findByRole('button', { name: /Connectivity/ });
    fireEvent.click(screen.getByRole('button', { name: /Once per system/ }));
    expect(screen.getByText(/every system relying on the solution must record its own/)).toBeInTheDocument();
  });

  test('"not sure yet" and "none of these" are answers: nothing is guessed', async () => {
    open();
    await screen.findByRole('button', { name: /Connectivity/ });
    fireEvent.click(screen.getByRole('button', { name: 'Not sure yet' }));
    fireEvent.click(screen.getByRole('button', { name: 'None of these' }));
    fireEvent.click(create());
    await waitFor(() => expect(createComponent).toHaveBeenCalled());
    expect(updateComponent).not.toHaveBeenCalled();
    expect(addArchitectureComponent).not.toHaveBeenCalled();
  });

  test('without the architecture permission the groups are shown but cannot be chosen', async () => {
    caps = new Set(['components.write']);
    open();
    expect(await screen.findByRole('button', { name: /Connectivity/ })).toBeDisabled();
    expect(screen.getByText(/needs the architecture permission/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'None of these' })).toBeEnabled();
  });

  test('a policy or document is not asked about template groups', async () => {
    open({ componentType: 'information', defaultName: 'Acceptable use policy' });
    await waitFor(() => expect(getArchitecture).toHaveBeenCalled());
    expect(screen.queryByText(/template groups/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Once for the organisation/ }));
    expect(create()).toBeEnabled();
  });

  test('editing asks neither question', () => {
    render(<ComponentModal existing={{ id: 'c1', name: 'Veeam Backup', component_type: 'technology', status: 'operational' }} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByText(/exist once, or on each system/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
});
