// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { SystemSecuritySolutions, triggeredSolutions, solutionState, partState } from './SystemSecuritySolutions';

const part = (name, location, status, extra = {}) => ({ component_id: name, component_name: name, location, status, service_system_name: null, ...extra });
const EDR = {
  pattern_id: 'p-edr', pattern_name: 'CrowdStrike EDR', kind: 'parts',
  reasons: [{ reason: 'architecture', trigger_component_name: 'Windows Server 2025' }],
  objectives: [{ id: 'c1', reference_code: 'DE.CM-09', title: 'Monitoring' }],
  parts: [part('Crowdstrike Falcon Agent', 'on_system', null),
          part('Crowdstrike SaaS', 'service', 'operational', { service_system_name: 'Host Intrusion Detection System' })],
};
const VEEAM = {
  pattern_id: 'p-veeam', pattern_name: 'Veeam backup', kind: 'parts',
  reasons: [{ reason: 'architecture', trigger_component_name: 'Windows Server 2025' }],
  objectives: [], parts: [part('Veeam Backup', 'on_system', 'operational')],
};
const CHOSEN = {
  pattern_id: 'p-x', pattern_name: 'Chosen for a threat', kind: 'parts',
  reasons: [{ reason: 'chosen', trigger_component_name: null }], objectives: [], parts: [],
};

const renderIt = (props = {}) => render(
  <MemoryRouter><SystemSecuritySolutions solutions={[VEEAM, EDR, CHOSEN]} canEdit onRecord={vi.fn()} {...props} /></MemoryRouter>);

describe('a system\'s triggered security solutions', () => {
  test('only solutions a recorded component triggers belong here — not ones chosen for a threat', () => {
    expect(triggeredSolutions([VEEAM, EDR, CHOSEN]).map(s => s.pattern_name)).toEqual(['Veeam backup', 'CrowdStrike EDR']);
  });

  test('a part nobody recorded, one marked missing and one unchecked are all gaps', () => {
    expect(['operational', 'degraded', 'missing', 'unknown', null].map(status => partState({ status })))
      .toEqual(['ok', 'degraded', 'gap', 'gap', 'gap']);
    expect(solutionState(EDR)).toEqual({ tone: 'warn', word: '1 gap' });
    expect(solutionState(VEEAM)).toEqual({ tone: 'ok', word: 'complete' });
  });

  test('opens on the solution that needs attention, naming its trigger and what it delivers', () => {
    renderIt();
    expect(screen.getByRole('region', { name: 'Security solution CrowdStrike EDR' })).toBeInTheDocument();
    expect(screen.getByText(/which delivers DE.CM-09/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CrowdStrike EDR' })).toHaveAttribute('href', '/security-solutions/p-edr');
  });

  test('the list view states each part, where it is and its state', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('cell', { name: 'On a security system: Host Intrusion Detection System' })).toBeInTheDocument();
    expect(screen.getByText('not recorded')).toBeInTheDocument();
    expect(screen.getByText('in place')).toBeInTheDocument();
  });

  test('a gap on this system can be recorded with its state', () => {
    const onRecord = vi.fn();
    renderIt({ onRecord });
    fireEvent.click(screen.getByRole('button', { name: 'Here, degraded' }));
    expect(onRecord).toHaveBeenCalledWith('Crowdstrike Falcon Agent', 'degraded');
  });

  test('a reader is not offered the record buttons', () => {
    renderIt({ canEdit: false });
    expect(screen.queryByRole('button', { name: 'It is here, working' })).toBeNull();
  });

  test('another solution can be selected', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /Veeam backup/ }));
    expect(screen.getByRole('region', { name: 'Security solution Veeam backup' })).toBeInTheDocument();
  });

  test('says so when nothing is triggered', () => {
    renderIt({ solutions: [CHOSEN] });
    expect(screen.getByText(/No component recorded on this system triggers a security solution/)).toBeInTheDocument();
  });
});
