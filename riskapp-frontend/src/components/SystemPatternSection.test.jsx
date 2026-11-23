// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { S2, HR_FIT, BILLING_FIT } from './systemPatternFixtures';

const api = vi.hoisted(() => ({
  getSystemPatterns: vi.fn(),
  setSystemPattern: vi.fn(async () => ({})),
  setSystemComponentSlot: vi.fn(async () => ({})),
}));
vi.mock('../api', () => api);
// The real dialog is tested on its own; here only what it is opened with, and what follows its save.
vi.mock('./ComponentModal', () => ({
  ComponentModal: ({ componentType, defaultRoles, onSaved }) => (
    <div role="dialog" aria-label="New component">
      <span>{componentType} answering {defaultRoles.join(',')}</span>
      <button type="button" onClick={() => onSaved({ id: 'new1' })}>Create component</button>
    </div>
  ),
}));

import { SystemPatternSection, slotComponentType } from './SystemPatternSection';

beforeEach(() => {
  vi.clearAllMocks();
  api.getSystemPatterns.mockResolvedValue({ patterns: [S2], systems: [], roles: [
    { key: 'sign_in', labels: ['Sign-in'], required_in: ['S2'], optional_in: [], members: [] },
    { key: 'users', labels: ['Who uses it'], required_in: [], optional_in: ['S2'],
      members: [{ id: 'c-team', name: 'MIG Utilities billing team', component_type: 'people', instantiation: 'organisational' }] },
  ] });
});

const components = [
  { id: 'c-app', name: 'Super Bill portal', component_type: 'technology', recorded: true, slot_key: null },
  { id: 'c-team', name: 'MIG Utilities billing team', component_type: 'people', recorded: true, slot_key: null, roles: ['users'] },
];
const draw = (system, canEdit = true, onChanged = vi.fn()) =>
  render(<MemoryRouter><SystemPatternSection system={system} canEdit={canEdit} onChanged={onChanged} /></MemoryRouter>);

test('no pattern stated: nothing is asked, its components are listed by role, and the choice is offered', async () => {
  const onChanged = vi.fn();
  draw({ id: 'bill', name: 'Billing', system_pattern: null, pattern_fit: { state: 'no_pattern', slots: [], missing: [], also: [] }, components }, true, onChanged);
  expect(await screen.findByText(/CIRKS cannot say what this system.s record should hold, and asks nothing/)).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Who uses it' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'MIG Utilities billing team' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Super Bill portal' })).toBeInTheDocument();   // no role
  fireEvent.change(screen.getByLabelText('The pattern this system follows'), { target: { value: 'S2' } });
  await waitFor(() => expect(api.setSystemPattern).toHaveBeenCalledWith('bill', 'S2'));
  expect(onChanged).toHaveBeenCalled();
});

test('a gap is named, and the hand-filled slot offers only components of the right kind', async () => {
  draw({ id: 'bill', name: 'Billing', system_pattern: 'S2', pattern_fit: BILLING_FIT, components });
  expect(await screen.findByText('Incomplete against its pattern. Missing: The service.')).toBeInTheDocument();
  const pick = screen.getByLabelText('Choose a recorded component as the service');
  expect([...pick.options].map(o => o.textContent)).toEqual(['Choose a recorded component…', 'Super Bill portal']);   // not the team
  fireEvent.change(pick, { target: { value: 'c-app' } });
  await waitFor(() => expect(api.setSystemComponentSlot).toHaveBeenCalledWith('bill', 'c-app', 'service'));
});

test('a chosen component can be taken out of its slot; read-only shows no controls', async () => {
  const filled = components.map(c => (c.id === 'c-app' ? { ...c, slot_key: 'service' } : c));
  const { unmount } = draw({ id: 'hr', name: 'HR System', system_pattern: 'S2', pattern_fit: HR_FIT, components: filled });
  expect(await screen.findByText('Complete against its pattern: every question it requires is answered.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Super Bill portal is not the service' }));
  await waitFor(() => expect(api.setSystemComponentSlot).toHaveBeenCalledWith('hr', 'c-app', null));
  unmount();
  draw({ id: 'hr', name: 'HR System', system_pattern: 'S2', pattern_fit: HR_FIT, components: filled }, false);
  expect(await screen.findByText('Super Bill portal', { selector: 'span' })).toBeInTheDocument();
  expect(screen.queryByLabelText('The pattern this system follows')).toBeNull();
  expect(screen.queryByRole('button', { name: /is not the service/ })).toBeNull();
});

test('a security system with no pattern is described by its security solutions, not flagged', async () => {
  draw({ id: 'hids', name: 'HIDS', is_security_system: true, system_pattern: null, pattern_fit: { state: 'no_pattern', slots: [], missing: [], also: [] }, components });
  expect(await screen.findByText(/described by the security solutions it provides/)).toBeInTheDocument();
});

test('an unanswered question offers what can answer it, and records it', async () => {
  const onAnswer = vi.fn(async () => true);
  const fit = { ...BILLING_FIT, slots: BILLING_FIT.slots.map(sl => (sl.key === 'sign_in' ? { ...sl, fill: 'role', state: 'missing', parts: [] } : sl)) };
  render(<MemoryRouter><SystemPatternSection system={{ id: 'bill', name: 'Billing', system_pattern: 'S2', pattern_fit: fit, components: [] }}
    canEdit onChanged={vi.fn()} onAnswer={onAnswer} /></MemoryRouter>);
  expect(await screen.findByLabelText('Answer sign-in')).toBeInTheDocument();
  expect(screen.getByText('Nothing can answer it yet')).toBeInTheDocument();
});

const unansweredSignIn = { ...BILLING_FIT, state: 'incomplete', slots: BILLING_FIT.slots.map(sl => (sl.key === 'sign_in' ? { ...sl, fill: 'role', state: 'missing', parts: [] } : sl)) };
const drawUnanswered = (props) => render(<MemoryRouter><SystemPatternSection
  system={{ id: 'bill', name: 'Billing', system_pattern: 'S2', pattern_fit: unansweredSignIn, components: [] }}
  canEdit onChanged={vi.fn()} {...props} /></MemoryRouter>);

test('an unanswered question can be answered with a new component, created already playing its role', async () => {
  const onAnswer = vi.fn(async () => true);
  drawUnanswered({ onAnswer, canCreateAnswer: true });
  fireEvent.click(await screen.findByRole('button', { name: 'New sign-in' }));
  expect(screen.getByText('technology answering sign_in')).toBeInTheDocument();   // from the pattern's slot: Technology · identity
  fireEvent.click(screen.getByRole('button', { name: 'Create component' }));
  await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('new1', null));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('without the architecture permission no new component is offered, and why is said', async () => {
  drawUnanswered({ onAnswer: vi.fn(), canCreateAnswer: false });
  expect(await screen.findByLabelText('Answer sign-in')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New sign-in' })).toBeNull();
  expect(screen.getByText(/needs the architecture permission/)).toBeInTheDocument();
});

test('the diagram names an unanswered question, not the kind of component', async () => {
  drawUnanswered({ onAnswer: vi.fn(), canCreateAnswer: true });
  await screen.findByLabelText('Answer sign-in');
  const card = document.querySelector('[data-slot="sign_in"]');
  expect(card).toHaveTextContent('Not answered');
  expect(card).toHaveTextContent('Sign-in');
  expect(card).toHaveTextContent('Required. Answer it under Unanswered below.');
  expect(screen.queryByText('Technology · missing')).toBeNull();
});

test('a slot takes the kind of component its description names', () => {
  expect(slotComponentType({ kind: 'Technology · network' })).toBe('technology');
  expect(slotComponentType({ kind: 'People · team' })).toBe('people');
  expect(slotComponentType({ kind: 'Facility' })).toBe('facility');
  expect(slotComponentType({ kind: 'People or supplier' })).toBe('people');
  expect(slotComponentType({})).toBe('technology');
});

test('the new component takes its kind from the pattern\'s slot (the fit does not carry it)', async () => {
  const facility = { ...S2, slots: S2.slots.map(d => (d.key === 'sign_in' ? { ...d, kind: 'Facility' } : d)) };
  api.getSystemPatterns.mockResolvedValueOnce({ patterns: [facility], systems: [], roles: [] });
  drawUnanswered({ onAnswer: vi.fn(async () => true), canCreateAnswer: true });
  fireEvent.click(await screen.findByRole('button', { name: 'New sign-in' }));
  expect(screen.getByText('facility answering sign_in')).toBeInTheDocument();
});
