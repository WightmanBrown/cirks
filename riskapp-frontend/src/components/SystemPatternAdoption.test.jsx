// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../api', () => ({ previewSystemBuild: vi.fn(), applySystemBuild: vi.fn() }));
import { previewSystemBuild, applySystemBuild } from '../api';
import { PatternAdoptionPanel } from './SystemPatternAdoption';

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

describe('PatternAdoptionPanel', () => {
  test('says the component belongs to a standard build and marks each component', async () => {
    renderPanel();
    expect(screen.getByText(/is part of a standard build/)).toBeInTheDocument();
    // each state appears on its component (and again in the legend)
    await waitFor(() => expect(screen.getAllByText('adding now').length).toBeGreaterThan(0));
    expect(screen.getAllByText('on this system').length).toBeGreaterThan(0);
    expect(screen.getByText('would be added')).toBeInTheDocument();
  });

  test('the list view shows the same components', async () => {
    renderPanel();
    await screen.findByRole('button', { name: /Adopt the standard build/ });
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('cell', { name: 'Crowdstrike Falcon Agent' })).toBeInTheDocument();
  });

  test('adopting needs a stated state — there is no default', async () => {
    const onAdopted = vi.fn();
    renderPanel({ onAdopted });
    const adopt = await screen.findByRole('button', { name: 'Adopt the standard build (adds 2 components)' });
    expect(adopt).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'operational' } });
    fireEvent.click(adopt);
    await waitFor(() => expect(applySystemBuild).toHaveBeenCalledWith('s1', 'b1', 'operational', { confirmOverlap: false, setPattern: false }));
    await waitFor(() => expect(onAdopted).toHaveBeenCalledWith({ added: 2, already: 1 }, BUILD));
  });

  test('warns what a non-operational state costs', async () => {
    renderPanel();
    await screen.findByRole('button', { name: /Adopt the standard build/ });
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
    expect(screen.queryByRole('button', { name: /Adopt the standard build/ })).toBeNull();
  });

  test('a build following another pattern cannot be adopted, and both patterns are named', async () => {
    previewSystemBuild.mockResolvedValue({ ...PREVIEW, pattern: { state: 'mismatch',
      build: { code: 'S7', name: 'Application on cloud infrastructure (IaaS)' }, system: { code: 'S1', name: 'Application on premises' } } });
    renderPanel();
    expect(await screen.findByText(/follows S7 Application on cloud infrastructure \(IaaS\); this system follows/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adopt the standard build/ })).toBeNull();
  });

  test('a system with no pattern is offered the build\'s, unticked, and the choice is sent', async () => {
    previewSystemBuild.mockResolvedValue({ ...PREVIEW, pattern: { state: 'offer',
      build: { code: 'S1', name: 'Application on premises' }, system: null } });
    renderPanel();
    const offer = await screen.findByRole('checkbox', { name: /Set it to S1 Application on premises/ });
    expect(offer).not.toBeChecked();
    fireEvent.click(offer);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'operational' } });
    fireEvent.click(screen.getByRole('button', { name: /Adopt the standard build/ }));
    await waitFor(() => expect(applySystemBuild).toHaveBeenCalledWith('s1', 'b1', 'operational', { confirmOverlap: false, setPattern: true }));
  });

  test('a build with no pattern warns, and can still be adopted', async () => {
    previewSystemBuild.mockResolvedValue({ ...PREVIEW, pattern: { state: 'build_none', build: null, system: { code: 'S1', name: 'Application on premises' } } });
    renderPanel();
    expect(await screen.findByText(/states no pattern. It can still be adopted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adopt the standard build/ })).toBeInTheDocument();
  });
});
