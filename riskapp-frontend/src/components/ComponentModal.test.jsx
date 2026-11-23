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
  // The roles list as GET /architecture returns it (v178).
  getArchitecture: vi.fn(async () => ({ roles: [
    { key: 'network', labels: ['Network', 'Reached over', 'Isolated network'], required_in: ['S1'], optional_in: [], members: [] },
    { key: 'hosting', labels: ['Where it runs'], required_in: ['S1'], optional_in: [], members: [] },
  ] })),
  previewComponentRoles: vi.fn(async () => ({ systems: [{ id: 's1', name: 'Risk Management System', new_gaps: [], closed_gaps: ['Where it runs'] }], gaps_created: 0 })),
  setComponentRoles: vi.fn(async () => ({})),
}));
import { createComponent, updateComponent, getArchitecture, previewComponentRoles, setComponentRoles } from '../api';
import { ComponentModal } from './ComponentModal';

const open = (props = {}) => render(<ComponentModal componentType="technology" defaultName="MIG CCTV Network" onClose={vi.fn()} onSaved={vi.fn()} {...props} />);
const create = () => screen.getByRole('button', { name: /^Create/ });

beforeEach(() => { vi.clearAllMocks(); caps = new Set(['components.write', 'architecture.write']); });

describe('the one panel a component is created from', () => {
  test('it cannot be created until both questions are answered', async () => {
    open();
    await screen.findByRole('button', { name: /Network \/ Reached over/ });
    expect(create()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Once for the organisation/ }));
    expect(create()).toBeDisabled();                       // what it can answer is still open
    fireEvent.click(screen.getByRole('button', { name: /Network \/ Reached over/ }));
    expect(create()).toBeEnabled();
  });

  test('creating it states its scope and the roles it can answer, in one go', async () => {
    const onSaved = vi.fn();
    open({ onSaved });
    fireEvent.click(await screen.findByRole('button', { name: /Network \/ Reached over/ }));
    fireEvent.click(screen.getByRole('button', { name: /Once for the organisation/ }));
    expect(screen.getByText(/on every system that records it/)).toBeInTheDocument();
    fireEvent.click(create());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(createComponent).toHaveBeenCalledWith(expect.objectContaining({ name: 'MIG CCTV Network', component_type: 'technology', roles: ['network'] }));
    expect(updateComponent).toHaveBeenCalledWith('new1', { instantiation: 'organisational' });
  });

  test('once per system says what that means for a security solution', async () => {
    open();
    await screen.findByRole('button', { name: /Network \/ Reached over/ });
    fireEvent.click(screen.getByRole('button', { name: /Once per system/ }));
    expect(screen.getByText(/every system relying on the solution must record its own/)).toBeInTheDocument();
  });

  test('"not sure yet" and "none of these" are answers: nothing is guessed', async () => {
    open();
    await screen.findByRole('button', { name: /Network \/ Reached over/ });
    fireEvent.click(screen.getByRole('button', { name: 'Not sure yet' }));
    fireEvent.click(screen.getByRole('button', { name: 'None of these' }));
    fireEvent.click(create());
    await waitFor(() => expect(createComponent).toHaveBeenCalled());
    expect(createComponent.mock.calls[0][0].roles).toBeUndefined();
    expect(updateComponent).not.toHaveBeenCalled();
  });

  test('without the architecture permission the roles are shown, cannot be chosen, and are left for an architect', async () => {
    caps = new Set(['components.write']);
    open();
    expect(await screen.findByRole('button', { name: /Network \/ Reached over/ })).toBeDisabled();
    expect(screen.getByText(/left for an architect/)).toBeInTheDocument();
    // Not forced to say "none of these": that answer is not theirs to give.
    expect(screen.queryByRole('button', { name: 'None of these' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Once for the organisation/ }));
    expect(create()).toBeEnabled();
    fireEvent.click(create());
    await waitFor(() => expect(createComponent).toHaveBeenCalled());
    expect(createComponent.mock.calls[0][0].roles).toBeUndefined();
  });

  test('opened from an unanswered question, it starts with that role chosen', async () => {
    open({ defaultName: '', defaultRoles: ['network'] });
    expect(await screen.findByRole('button', { name: /Network \/ Reached over/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Kiosk network' } });
    fireEvent.click(screen.getByRole('button', { name: /Once for the organisation/ }));
    fireEvent.click(create());
    await waitFor(() => expect(createComponent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kiosk network', roles: ['network'] })));
  });

  test('without the permission, a role it was opened with is not chosen for them', async () => {
    caps = new Set(['components.write']);
    open({ defaultRoles: ['network'] });
    expect(await screen.findByRole('button', { name: /Network \/ Reached over/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('a policy or document is not asked what it answers', async () => {
    open({ componentType: 'information', defaultName: 'Acceptable use policy' });
    await waitFor(() => expect(getArchitecture).toHaveBeenCalled());
    expect(screen.queryByText(/What can it answer/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Once for the organisation/ }));
    expect(create()).toBeEnabled();
  });

  test('editing: the scope is not asked; changing its roles shows what it does first', async () => {
    render(<ComponentModal existing={{ id: 'c1', name: 'Raspberry Pi 5', component_type: 'technology', status: 'operational', roles: [] }}
      onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByText(/exist once, or on each system/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Where it runs' }));
    expect(await screen.findByText(/now answers Where it runs/)).toBeInTheDocument();
    expect(previewComponentRoles).toHaveBeenCalledWith('c1', ['hosting']);
    fireEvent.click(screen.getByRole('button', { name: 'Change what it can answer' }));
    await waitFor(() => expect(setComponentRoles).toHaveBeenCalledWith('c1', ['hosting'], false));
  });
});
