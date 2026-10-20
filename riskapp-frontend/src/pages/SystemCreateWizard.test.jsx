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

const NET = { id: 'net', name: 'MIGNet (internal)', component_type: 'technology' };
const OS = { id: 'os', name: 'Ubuntu Server 24.04 LTS', component_type: 'technology' };
const ROOM = { id: 'room', name: 'Bank Street server room', component_type: 'facility' };
const LIB = {
  groups: [
    { id: 'g-net', name: 'Connectivity', members: [NET], triggers: [] },
    { id: 'g-os', name: 'Operating system', members: [OS], triggers: [] },
    { id: 'g-host', name: 'Hosting', members: [ROOM], triggers: [] },
  ],
  rules: [{ pattern_name: 'CrowdStrike EDR', triggers: [OS] }, { pattern_name: 'Secure datacentre — Bank Street', triggers: [ROOM] }],
  builds: [{ id: 'b1', name: 'MIG Linux server (on premises)', components: [NET, OS] }],
};
vi.mock('../api', () => ({
  getArchitecture: vi.fn(async () => LIB), getDepartments: vi.fn(async () => []), getUsers: vi.fn(async () => []),
  searchComponents: vi.fn(async () => ({ components: [] })),
  createSystem: vi.fn(async () => ({ id: 'sys1' })), applySystemBuild: vi.fn(async () => ({ added: 2, already: 0 })),
  linkSystemComponent: vi.fn(async () => ({})), setSystemComponentStatus: vi.fn(async () => ({})),
  createArchitectureItem: vi.fn(async () => ({ build: { id: 'b9' } })), addArchitectureComponent: vi.fn(async () => ({})),
}));
import { createSystem, applySystemBuild, linkSystemComponent, setSystemComponentStatus, createArchitectureItem, addArchitectureComponent } from '../api';
import { SystemCreateWizard, chosenComponents, groupsThatApply, impliedSolutions } from './SystemCreateWizard';

const open = () => render(<MemoryRouter><SystemCreateWizard /></MemoryRouter>);
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const stepOne = async (security = 'No, it does a job') => {
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Harbour Booking Server' } });
  fireEvent.click(screen.getByRole('button', { name: new RegExp(security) }));
  next();
};

beforeEach(() => { vi.clearAllMocks(); caps = new Set(['systems.write', 'architecture.write']); });

describe('what the new system will record, and imply', () => {
  test('pattern components, template answers and additions — each once', () => {
    const chosen = chosenComponents({ build: LIB.builds[0], picks: { 'g-host': 'room', 'g-net': 'net' }, groups: LIB.groups, custom: [OS, { id: 'x', name: 'Tidewatch' }] });
    expect(chosen.map(c => [c.name, c.from])).toEqual([
      ['MIGNet (internal)', 'pattern'], ['Ubuntu Server 24.04 LTS', 'pattern'], ['Bank Street server room', 'answer'], ['Tidewatch', 'added']]);
  });

  test('a group with triggers applies only when one of them is recorded', () => {
    const groups = [...LIB.groups, { id: 'g-x', name: 'Cloud region', members: [], triggers: [{ id: 'azure' }] }];
    expect(groupsThatApply(groups, [NET]).map(g => g.name)).not.toContain('Cloud region');
    expect(groupsThatApply(groups, [{ id: 'azure' }]).map(g => g.name)).toContain('Cloud region');
  });

  test('a security solution is implied by a component that triggers it', () => {
    expect(impliedSolutions(LIB.rules, [OS])).toEqual([{ name: 'CrowdStrike EDR', by: ['Ubuntu Server 24.04 LTS'] }]);
    expect(impliedSolutions(LIB.rules, [NET])).toEqual([]);
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

  test('from a pattern: its answers fill the template, the blank is offered, and the review says what is implied', async () => {
    open();
    await stepOne();
    fireEvent.click(await screen.findByRole('button', { name: /MIG Linux server \(on premises\)/ }));
    next();
    expect(screen.getByText('MIGNet (internal)')).toBeInTheDocument();
    expect(screen.getByText(/1 group not answered: Hosting/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Answer for Hosting'), { target: { value: 'room' } });
    expect(screen.getByText('Every group is answered.')).toBeInTheDocument();
    next();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();          // the state is required
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'operational' } });
    next();
    expect(screen.getByText(/implied by Ubuntu Server 24.04 LTS/)).toBeInTheDocument();
    expect(screen.getByText(/implied by Bank Street server room/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create system' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/systems/sys1'));
    expect(createSystem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Harbour Booking Server', is_security_system: false }));
    expect(applySystemBuild).toHaveBeenCalledWith('sys1', 'b1', 'operational');
    expect(linkSystemComponent).toHaveBeenCalledTimes(1);                         // only the answer picked by hand
    expect(setSystemComponentStatus).toHaveBeenCalledWith('sys1', 'room', 'operational');
  });

  test('an organisation-wide answer keeps its own state: the refusal to set one per system is not an error', async () => {
    setSystemComponentStatus.mockRejectedValueOnce({ response: { status: 409, data: { error: 'exists once for the organisation' } } });
    open();
    await stepOne();
    fireEvent.click(await screen.findByRole('button', { name: /MIG Linux server \(on premises\)/ }));
    next();
    fireEvent.change(screen.getByLabelText('Answer for Hosting'), { target: { value: 'room' } });
    next();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'operational' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Create system' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/systems/sys1'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('by hand: a one-off can be saved as a pattern at the end', async () => {
    open();
    await stepOne('Yes, it is a security system');
    fireEvent.click(await screen.findByRole('button', { name: /It is a one-off/ }));
    next();
    fireEvent.change(screen.getByLabelText('Answer for Connectivity'), { target: { value: 'net' } });
    next();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'degraded' } });
    next();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this build as a system architecture pattern/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create system' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/systems/sys1'));
    expect(createSystem).toHaveBeenCalledWith(expect.objectContaining({ is_security_system: true }));
    expect(applySystemBuild).not.toHaveBeenCalled();
    expect(createArchitectureItem).toHaveBeenCalledWith('builds', { name: 'Harbour Booking Server pattern' });
    expect(addArchitectureComponent).toHaveBeenCalledWith('builds', 'b9', 'components', 'net');
  });

  test('without the architecture permission, "make a pattern first" says who to ask and saving as a pattern is not offered', async () => {
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
