// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../api', () => ({ previewSystemBuild: vi.fn(), applySystemBuild: vi.fn() }));
import { previewSystemBuild, applySystemBuild } from '../api';
import { TemplateStrip, PatternAdoptionPanel } from './SystemPatternAdoption';

const BUILD = { id: 'b1', name: 'MIG Windows server (on premises)', components: [] };
const PREVIEW = {
  build: { id: 'b1', name: BUILD.name }, adding: 2,
  components: [
    { id: 'os', name: 'Windows Server 2025', component_type: 'technology', already: false },
    { id: 'net', name: 'MIGNet (internal)', component_type: 'technology', already: true },
    { id: 'edr', name: 'Crowdstrike Falcon Agent', component_type: 'technology', already: false },
  ],
  candidates_if_not_operational: { pairs: 3, risks: 2, components: 1 },
};
const OS = { id: 'os', name: 'Windows Server 2025' };

const renderPanel = (props = {}) => render(
  <MemoryRouter>
    <PatternAdoptionPanel systemId="s1" builds={[BUILD]} component={OS}
      onAddOnly={vi.fn()} onAdopted={vi.fn()} onClose={vi.fn()} {...props} />
  </MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  previewSystemBuild.mockResolvedValue(PREVIEW);
  applySystemBuild.mockResolvedValue({ added: 2, already: 1 });
});

describe('TemplateStrip', () => {
  test('shows what each group records, and a visible blank where nothing is', () => {
    render(<TemplateStrip memberships={[
      { id: 'g1', name: 'Connectivity', answered: true, recorded: [{ id: 'net', name: 'MIGNet (internal)' }], members: [] },
      { id: 'g2', name: 'Operating system', answered: false, recorded: [], members: [{ id: 'os' }] },
    ]} />);
    expect(screen.getByText('MIGNet (internal)')).toBeInTheDocument();
    expect(screen.getByText('Nothing recorded')).toBeInTheDocument();
  });
});

describe('PatternAdoptionPanel', () => {
  test('says the component belongs to a pattern and marks each component', async () => {
    renderPanel();
    expect(screen.getByText(/is part of a system architecture pattern/)).toBeInTheDocument();
    // each state appears on its component (and again in the legend)
    await waitFor(() => expect(screen.getAllByText('adding now').length).toBeGreaterThan(0));
    expect(screen.getAllByText('on this system').length).toBeGreaterThan(0);
    expect(screen.getByText('would be added')).toBeInTheDocument();
  });

  test('the list view shows the same components', async () => {
    renderPanel();
    await screen.findByRole('button', { name: /Adopt the pattern/ });
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('cell', { name: 'Crowdstrike Falcon Agent' })).toBeInTheDocument();
  });

  test('adopting needs a stated state — there is no default', async () => {
    const onAdopted = vi.fn();
    renderPanel({ onAdopted });
    const adopt = await screen.findByRole('button', { name: 'Adopt the pattern (adds 2 components)' });
    expect(adopt).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'operational' } });
    fireEvent.click(adopt);
    await waitFor(() => expect(applySystemBuild).toHaveBeenCalledWith('s1', 'b1', 'operational'));
    await waitFor(() => expect(onAdopted).toHaveBeenCalledWith({ added: 2, already: 1 }, BUILD));
  });

  test('warns what a non-operational state costs', async () => {
    renderPanel();
    await screen.findByRole('button', { name: /Adopt the pattern/ });
    expect(screen.getByText(/1 of them becomes remediation\s+work on 2 risks/)).toBeInTheDocument();
  });

  test('the component can still be added on its own', async () => {
    const onAddOnly = vi.fn();
    renderPanel({ onAddOnly });
    fireEvent.click(screen.getByRole('button', { name: 'Add Windows Server 2025 only' }));
    expect(onAddOnly).toHaveBeenCalledWith(OS);
    expect(applySystemBuild).not.toHaveBeenCalled();
  });

  test('nothing to adopt when every component is already recorded', async () => {
    previewSystemBuild.mockResolvedValue({ ...PREVIEW, adding: 0, components: PREVIEW.components.map(c => ({ ...c, already: true })) });
    renderPanel({ component: null });
    await waitFor(() => expect(screen.getByText(/already recorded on this system/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Adopt the pattern/ })).toBeNull();
  });
});

describe('TemplateStrip — a blank group is answered where it is seen', () => {
  const groups = [
    { id: 'g1', name: 'Operating system', answered: true, recorded: [{ id: 'c1', name: 'Ubuntu Server' }], members: [{ id: 'c1', name: 'Ubuntu Server', instantiation: 'per_system' }] },
    { id: 'g2', name: 'Hosting', answered: false, recorded: [], members: [
      { id: 'c2', name: 'Bank Street server room', instantiation: 'organisational' },
      { id: 'c3', name: 'Rack server', instantiation: 'per_system' },
    ] },
  ];

  test('someone who cannot edit sees the blank and no picker', () => {
    render(<TemplateStrip memberships={groups} />);
    expect(screen.getByText('Nothing recorded')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  test('an answered group offers nothing', () => {
    render(<TemplateStrip memberships={[groups[0]]} canEdit onAnswer={() => {}} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  test('a per-system component is recorded with the state it is in here', async () => {
    const onAnswer = vi.fn().mockResolvedValue();
    render(<TemplateStrip memberships={groups} canEdit onAnswer={onAnswer} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Hosting/ }), { target: { value: 'c3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Degraded' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('c3', 'degraded'));
  });

  test('a once-for-the-organisation component is recorded without a state', async () => {
    const onAnswer = vi.fn().mockResolvedValue();
    render(<TemplateStrip memberships={groups} canEdit onAnswer={onAnswer} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Hosting/ }), { target: { value: 'c2' } });
    expect(screen.queryByRole('button', { name: 'Working' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Record it on this system' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('c2', null));
  });

  test('once saved, the answer shows and the picker is gone until the page catches up — no second click', async () => {
    const onAnswer = vi.fn().mockResolvedValue(true);
    render(<TemplateStrip memberships={groups} canEdit onAnswer={onAnswer} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Hosting/ }), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record it on this system' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Recording it on this system');
    expect(screen.getByText('Bank Street server room')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record it on this system' })).toBeNull();
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  test('if the save fails the choice is offered again', async () => {
    const onAnswer = vi.fn().mockResolvedValue(false);
    render(<TemplateStrip memberships={groups} canEdit onAnswer={onAnswer} />);
    fireEvent.change(screen.getByRole('combobox', { name: /Hosting/ }), { target: { value: 'c3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Working' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalled());
    expect(await screen.findByRole('combobox', { name: /Hosting/ })).toBeInTheDocument();
  });
});
