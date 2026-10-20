// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));
vi.mock('../components/ComponentModal', () => ({ ComponentModal: () => <div>component panel</div> }));
let caps = new Set(['controls.write', 'components.write']);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.has(c) }) }));

const HIDS = { id: 'hids', name: 'Host Intrusion Detection System', is_security_system: true };
const SYSTEM = { id: 'hids', name: HIDS.name, components: [
  { id: 'console', name: 'Crowdstrike SaaS', component_type: 'technology', instantiation: 'organisational', recorded: true },
  { id: 'team', name: 'InfoSec Team', component_type: 'people', instantiation: 'organisational', recorded: true },
  { id: 'os', name: 'Ubuntu Server 24.04 LTS', component_type: 'technology', instantiation: 'per_system', recorded: true },
  { id: 'dvr', name: 'Recorder', component_type: 'technology', instantiation: null, recorded: true },
  { id: 'implied', name: 'Physical security', component_type: 'process', instantiation: 'organisational', recorded: false },
] };
vi.mock('../api', () => ({
  getSystems: vi.fn(async () => [HIDS, { id: 'plain', name: 'Harbour Booking Server', is_security_system: false }]),
  getSystem: vi.fn(async () => SYSTEM),
  getArchitecture: vi.fn(async () => ({ documents: [{ id: 'doc', name: 'MIG Security Architecture Standard' }] })),
  getControls: vi.fn(async () => ({ controls: [] })),
  searchComponents: vi.fn(async () => ({ components: [
    { id: 'agent', name: 'Crowdstrike Falcon Agent', component_type: 'technology', instantiation: 'per_system' },
    { id: 'shared', name: 'Crowdstrike SaaS', component_type: 'technology', instantiation: 'organisational' }] })),
  updateComponent: vi.fn(async () => ({})),
  createSecuritySolution: vi.fn(async () => ({ id: 'sol1' })),
  addSecuritySolutionObjective: vi.fn(async () => ({})), addSecuritySolutionPart: vi.fn(async () => ({})),
  createArchitectureItem: vi.fn(async () => ({ rule: { id: 'rule1' } })), addArchitectureComponent: vi.fn(async () => ({})),
}));
import { createSecuritySolution, addSecuritySolutionPart, updateComponent, createArchitectureItem } from '../api';
import { SecuritySolutionWizard, liftable } from './SecuritySolutionWizard';

const open = (url = '/security-solutions/new') => render(<MemoryRouter initialEntries={[url]}><SecuritySolutionWizard /></MemoryRouter>);
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

beforeEach(() => { vi.clearAllMocks(); caps = new Set(['controls.write', 'components.write']); });

describe('what can be lifted from a security system', () => {
  test('a component that exists once can be a part; one per system is what the system is built on; unstated has to be said', () => {
    expect(liftable({ instantiation: 'organisational' })).toEqual({ ok: true });
    expect(liftable({ instantiation: 'per_system' }).ok).toBe(false);
    expect(liftable({ instantiation: null })).toMatchObject({ ok: false, ask: true });
  });
});

describe('the guided flow', () => {
  test('documents, processes and people: named here, then built by hand on its own page', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /It is documents, processes and people/ }));
    const go = screen.getByRole('button', { name: 'Create and add its parts' });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acceptable use' } });
    fireEvent.click(go);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/security-solutions/sol1'));
    expect(createSecuritySolution).toHaveBeenCalledWith({ name: 'Acceptable use', kind: 'parts' });
    expect(addSecuritySolutionPart).not.toHaveBeenCalled();
  });

  test('something is run: only security systems are offered, and the solution is lifted from one', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Something is run to deliver it/ }));
    expect(screen.getByText(/Then it is a/)).toBeInTheDocument();
    next();
    await screen.findByRole('option', { name: HIDS.name });
    expect(screen.queryByRole('option', { name: 'Harbour Booking Server' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hids' } });
    next();

    // its own components; the one only implied on it is not offered
    await screen.findByLabelText('Crowdstrike SaaS');
    expect(screen.queryByLabelText('Physical security')).toBeNull();
    expect(screen.getByLabelText('Ubuntu Server 24.04 LTS')).toBeDisabled();       // what it is built on
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Crowdstrike SaaS'));
    fireEvent.click(screen.getByLabelText('InfoSec Team'));
    next();

    // what each protected system needs: only once-per-system components are offered
    fireEvent.change(screen.getByLabelText(/installed on each protected system/), { target: { value: 'crowd' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Crowdstrike Falcon Agent' }));
    expect(screen.queryByRole('button', { name: 'Add Crowdstrike SaaS' })).toBeNull();
    next();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CrowdStrike EDR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create security solution' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/security-solutions/sol1'));
    expect(addSecuritySolutionPart).toHaveBeenCalledWith('sol1', { component_id: 'agent', location: 'on_system' });
    expect(addSecuritySolutionPart).toHaveBeenCalledWith('sol1', { component_id: 'console', location: 'service', service_system_id: 'hids' });
    expect(addSecuritySolutionPart).toHaveBeenCalledWith('sol1', { component_id: 'team', location: 'service', service_system_id: 'hids' });
    expect(createArchitectureItem).not.toHaveBeenCalled();                          // nothing was said to imply it
  });

  test('from a security system\'s page: it starts at that system\'s components', async () => {
    open('/security-solutions/new?system=hids');
    expect(await screen.findByLabelText('Crowdstrike SaaS')).toBeInTheDocument();
    expect(screen.getByText(/Which of Host Intrusion Detection System/)).toBeInTheDocument();
  });

  test('a component with no scope is asked about there and then', async () => {
    open('/security-solutions/new?system=hids');
    expect(await screen.findByLabelText('Recorder')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'It exists once, as part of this system' }));
    await waitFor(() => expect(updateComponent).toHaveBeenCalledWith('dvr', { instantiation: 'organisational' }));
  });

  test('"nothing on the protected system" is an answer', async () => {
    open('/security-solutions/new?system=hids');
    fireEvent.click(await screen.findByLabelText('Crowdstrike SaaS'));
    next();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Nothing/ }));
    expect(screen.getByText(/applies only where something implies it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  test('the security team\'s permission is checked on entry', () => {
    caps = new Set([]);
    open();
    expect(screen.queryByRole('button', { name: /Something is run/ })).toBeNull();
  });
});
