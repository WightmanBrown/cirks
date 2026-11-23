// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));
vi.mock('../components/PersonSelect', () => ({ PersonSelect: () => <span>owner</span> }));
vi.mock('../components/ComponentModal', () => ({ ComponentModal: () => <div>component panel</div> }));
let caps = new Set(['systems.write', 'architecture.write']);
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'information_asset_manager', department_id: 'd1' }, hasCapability: (c) => caps.has(c) }),
}));

const NET = { id: 'net', name: 'MIGNet (internal)', component_type: 'technology', roles: ['network'] };
const OS = { id: 'os', name: 'Ubuntu Server 24.04 LTS', component_type: 'technology', roles: ['operating_system'] };
const ROOM = { id: 'room', name: 'Bank Street server room', component_type: 'facility', roles: ['hosting'] };
const AD = { id: 'ad', name: 'Joined to MIG Active Directory', component_type: 'technology', roles: ['sign_in'] };
// The roles list as GET /architecture returns it (v178).
const role = (key, label, members, required_in = ['S1']) => ({ key, labels: [label], required_in, optional_in: [], members });
const LIB = {
  roles: [role('network', 'Network', [NET]), role('operating_system', 'Operating system', [OS]),
          role('hosting', 'Where it runs', [ROOM]), role('sign_in', 'Sign-in', [AD])],
  rules: [{ pattern_name: 'CrowdStrike EDR', triggers: [OS] }, { pattern_name: 'Secure datacentre — Bank Street', triggers: [ROOM] },
          { pattern_name: 'Provided by the supplier', triggers: [], pattern_triggers: ['S2'] }],
  builds: [{ id: 'b1', name: 'MIG Linux server (on premises)', components: [NET, OS] },
           { id: 'b2', name: 'MIG SaaS onboarding', components: [AD], system_pattern: 'S2' }],
};
const slot = (key, label, required, fill = 'role') => ({ key, label, required, fill });
const S1 = { code: 'S1', name: 'Application on servers we run', summary: 'Our application on servers we patch.',
  slots: [slot('application', 'The application', false, 'explicit'), slot('operating_system', 'Operating system', true),
          slot('sign_in', 'Sign-in', true), slot('hosting', 'Where it runs', true), slot('network', 'Network', true)] };
const S2 = { code: 'S2', name: 'Supplier-run service', summary: 'The supplier runs it.',
  slots: [slot('supplier', 'Supplier', true, 'supplier'), slot('sign_in', 'Sign-in', true), slot('network', 'Reached over', true)] };
vi.mock('../api', () => ({
  getArchitecture: vi.fn(async () => LIB), getDepartments: vi.fn(async () => []), getUsers: vi.fn(async () => []),
  getSystemPatterns: vi.fn(async () => ({ patterns: [S1, S2], systems: [], roles: LIB.roles })),
  searchComponents: vi.fn(async () => ({ components: [] })),
  createSystem: vi.fn(async () => ({ id: 'sys1' })), applySystemBuild: vi.fn(async () => ({ added: 2, already: 0 })),
  linkSystemComponent: vi.fn(async () => ({})), setSystemComponentStatus: vi.fn(async () => ({})),
  createArchitectureItem: vi.fn(async () => ({ build: { id: 'b9' } })), addArchitectureComponent: vi.fn(async () => ({})),
}));
import { createSystem, applySystemBuild, linkSystemComponent, setSystemComponentStatus, createArchitectureItem, addArchitectureComponent } from '../api';
import { SystemCreateWizard, chosenComponents, slotsToAnswer, impliedSolutions } from './SystemCreateWizard';

const open = () => render(<MemoryRouter><SystemCreateWizard /></MemoryRouter>);
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const stepOne = async (security = 'No, it does a job') => {
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Harbour Booking Server' } });
  fireEvent.click(screen.getByRole('button', { name: new RegExp(security) }));
  next();
};

beforeEach(() => { vi.clearAllMocks(); caps = new Set(['systems.write', 'architecture.write']); });

describe('what the new system will record, and imply', () => {
  test('standard build components, answers and additions — each once', () => {
    const chosen = chosenComponents({ build: LIB.builds[0], picks: { hosting: 'room', network: 'net' }, roles: LIB.roles, custom: [OS, { id: 'x', name: 'Tidewatch' }] });
    expect(chosen.map(c => [c.name, c.from])).toEqual([
      ['MIGNet (internal)', 'pattern'], ['Ubuntu Server 24.04 LTS', 'pattern'], ['Bank Street server room', 'answer'], ['Tidewatch', 'added']]);
  });

  test('the pattern asks its role questions; a chosen component answers the ones its roles cover', () => {
    const slots = slotsToAnswer(S1, LIB.roles, [NET, OS]);
    expect(slots.map(s => [s.label, s.answers.map(c => c.name)])).toEqual([
      ['Operating system', ['Ubuntu Server 24.04 LTS']], ['Sign-in', []], ['Where it runs', []], ['Network', ['MIGNet (internal)']]]);
    expect(slotsToAnswer(null, LIB.roles, [NET])).toEqual([]);   // no pattern: nothing asked
  });

  test('a security solution is implied by a component that triggers it, or by the system pattern', () => {
    expect(impliedSolutions(LIB.rules, [OS])).toEqual([{ name: 'CrowdStrike EDR', by: ['Ubuntu Server 24.04 LTS'] }]);
    expect(impliedSolutions(LIB.rules, [NET])).toEqual([]);
    expect(impliedSolutions(LIB.rules, [], 'S2')).toEqual([{ name: 'Provided by the supplier', by: ['its pattern, S2'] }]);
  });
});

describe('the guided flow', () => {
  test('step 1 will not move on until "does it protect other systems?" is answered', async () => {
    open();
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Harbour Booking Server' } });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Yes, it is a security system/ }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  test('from a standard build: its components answer the pattern, the blanks are offered, and the review says what is implied', async () => {
    open();
    await stepOne();
    fireEvent.click(await screen.findByRole('button', { name: /MIG Linux server \(on premises\)/ }));
    next();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();          // the pattern must be chosen (or "not sure")
    fireEvent.click(await screen.findByRole('button', { name: /S1 · Application on servers we run/ }));
    expect(screen.getByText('MIGNet (internal)')).toBeInTheDocument();
    expect(screen.getByText(/2 required questions not answered: Sign-in, Where it runs/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Answer for Where it runs'), { target: { value: 'room' } });
    fireEvent.change(screen.getByLabelText('Answer for Sign-in'), { target: { value: 'ad' } });
    expect(screen.getByText('Every required question is answered.')).toBeInTheDocument();
    next();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();          // the state is required
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'operational' } });
    next();
    expect(screen.getByText(/implied by Ubuntu Server 24.04 LTS/)).toBeInTheDocument();
    expect(screen.getByText(/implied by Bank Street server room/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create system' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/systems/sys1'));
    expect(createSystem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Harbour Booking Server', is_security_system: false, system_pattern: 'S1' }));
    expect(applySystemBuild).toHaveBeenCalledWith('sys1', 'b1', 'operational');
    expect(linkSystemComponent).toHaveBeenCalledTimes(2);                         // only the answers picked by hand
    expect(setSystemComponentStatus).toHaveBeenCalledWith('sys1', 'room', 'operational');
  });

  test('a standard build that follows a pattern brings it: the system follows it, and no other can be chosen', async () => {
    open();
    await stepOne();
    fireEvent.click(await screen.findByRole('button', { name: /MIG SaaS onboarding/ }));
    next();
    expect(screen.getByText(/so this system does\s+too/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /S2 · Supplier-run service/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /S1 · Application on servers we run/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Not sure yet/ })).toBeDisabled();
  });

  test('an organisation-wide answer keeps its own state: the refusal to set one per system is not an error', async () => {
    setSystemComponentStatus.mockRejectedValueOnce({ response: { status: 409, data: { error: 'exists once for the organisation' } } });
    open();
    await stepOne();
    fireEvent.click(await screen.findByRole('button', { name: /MIG Linux server \(on premises\)/ }));
    next();
    fireEvent.click(await screen.findByRole('button', { name: /S1 · Application on servers we run/ }));
    fireEvent.change(screen.getByLabelText('Answer for Where it runs'), { target: { value: 'room' } });
    next();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'operational' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create system' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/systems/sys1'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('by hand: a one-off can be saved as a standard build at the end', async () => {
    open();
    await stepOne('Yes, it is a security system');
    fireEvent.click(await screen.findByRole('button', { name: /It is a one-off/ }));
    next();
    fireEvent.click(await screen.findByRole('button', { name: /S2 · Supplier-run service/ }));
    fireEvent.change(screen.getByLabelText('Answer for Reached over'), { target: { value: 'net' } });
    next();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'degraded' } });
    next();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this as a standard build/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create system' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/systems/sys1'));
    expect(createSystem).toHaveBeenCalledWith(expect.objectContaining({ is_security_system: true, system_pattern: 'S2' }));
    expect(applySystemBuild).not.toHaveBeenCalled();
    expect(createArchitectureItem).toHaveBeenCalledWith('builds', { name: 'Harbour Booking Server standard build' });
    expect(addArchitectureComponent).toHaveBeenCalledWith('builds', 'b9', 'components', 'net');
  });

  test('without the architecture permission, "make a standard build first" says who to ask and saving as a standard build is not offered', async () => {
    caps = new Set(['systems.write']);
    open();
    await stepOne();
    expect(await screen.findByText(/needs the architecture permission/)).toBeInTheDocument();
  });

  test('someone who cannot create systems is told so on entry, not at the end', () => {
    caps = new Set([]);
    open();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});
