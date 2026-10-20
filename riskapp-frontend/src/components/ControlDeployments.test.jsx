// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ControlDeployments from './ControlDeployments';

const risky = {
  system_id: 's1', system_name: 'Flight operations system', department_name: 'Transport',
  status: 'operational', via: 'deployed', reason: 'risk',
  threats: [{ id: 't1', name: 'Supply chain compromise' }],
  risks: [{ risk_id: 'r1', threat: 'Supply chain compromise', score: 10, probability: '2/2/1', judged: '2/2/1' }],
};
const baseline = {
  system_id: 's2', system_name: 'MIG Backup', department_name: 'IT',
  status: 'degraded', via: 'deployed', reason: 'baseline', threats: [], risks: [],
};

const show = (deployments, deliveryBySystem) => render(
  <MemoryRouter><ControlDeployments deployments={deployments} deliveryBySystem={deliveryBySystem} /></MemoryRouter>);

describe('ControlDeployments', () => {
  it('names the threat that puts it there, and what it is judged to achieve', () => {
    show([risky]);
    expect(screen.getByText(/carries Supply chain compromise/)).toBeInTheDocument();
    expect(screen.getByText(/this control judged at 2\/2\/1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Flight operations system' })).toHaveAttribute('href', '/systems/s1');
  });

  // Present, but nobody has said what it achieves — the gap that makes a control
  // look effective while contributing nothing to the score.
  it('says when nobody has judged what it achieves there', () => {
    show([{ ...risky, risks: [{ ...risky.risks[0], judged: null }] }]);
    expect(screen.getByText(/nobody has judged what this control achieves here/)).toBeInTheDocument();
  });

  it('calls a deployment with no identified threat a baseline, and says what that means', () => {
    show([baseline]);
    expect(screen.getByText(/counters no threat identified on this system/)).toBeInTheDocument();
    expect(screen.getByText(/every one is a baseline deployment/)).toBeInTheDocument();
  });

  it('leads with the systems doing the most work', () => {
    show([baseline, risky]);
    const names = screen.getAllByRole('link').map(a => a.textContent);
    expect(names).toEqual(['Flight operations system', 'MIG Backup']);
    expect(screen.getByText(/treating identified risks on 1, baseline on the other 1/)).toBeInTheDocument();
  });

  // The same row says how it is delivered there — one list, not two panels.
  it('shows the security solution in place on the system, and what is wrong with it', () => {
    show([risky, baseline], [
      { system_id: 's1', delivery: 'complete', pattern_name: 'CrowdStrike EDR' },
      { system_id: 's2', delivery: 'incomplete', pattern_name: 'Veeam backup', missing_parts: ['Veeam Backup'], disagreement: 'Marked operational, but a part is missing' },
    ]);
    expect(screen.getByText('CrowdStrike EDR')).toBeInTheDocument();
    expect(screen.getByText('Missing: Veeam Backup')).toBeInTheDocument();
    expect(screen.getByText('Marked operational, but a part is missing')).toBeInTheDocument();
  });

  it('shows an exclusion with its reason instead of a justification', () => {
    show([{ ...baseline, status: 'not_applicable', exclusion_reason: 'Handled by the platform' }]);
    expect(screen.getByText(/Excluded here: Handled by the platform/)).toBeInTheDocument();
  });
});
