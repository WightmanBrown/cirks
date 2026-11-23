// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The security team's service — the CISO's C6 (docs/reporting-ciso.md).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const q = (label, over = {}) => ({
  label, current: false, from: '2026-07-01',
  validation: { n: 0, median_days: null }, acceptance: { n: 0, median_days: null }, delivery: { n: 0, median_days: null },
  completed: 0, points_removed: 0, points_per_head: 0, ...over,
});
const report = {
  generated_at: '2026-11-05T10:00:00Z', thresholds: { action: 12 },
  headline: { waiting: 2, oldest_days: 40, oldest_group: 'validation', validation_median_days: 3, points_removed_quarter: 18, heads: 2 },
  waiting: [
    { key: 'validation', label: 'Risks waiting for validation', who: 'The CISO: validate or return each one', count: 1, oldest_days: 40,
      rows: [{ risk_id: 'r1', score: 16, days: 40, system_name: 'Payroll', threat_name: 'Ransomware', department_name: 'Treasury' }] },
    { key: 'acceptance', label: 'Security actions waiting to be accepted', who: 'The CISO', count: 1, oldest_days: 5,
      rows: [{ action_id: 'a1', title: 'Install EDR', days: 5, subject_type: 'risk', risk_id: 'r2' }] },
    { key: 'expiring', label: 'Exceptions expired, or expiring within 30 days', who: 'The SIRO or CISO', count: 0, oldest_days: null, rows: [] },
  ],
  quarters: [q('Q4 2026', { current: true, validation: { n: 4, median_days: 3 }, completed: 1, points_removed: 18, points_per_head: 9 }), q('Q3 2026'), q('Q2 2026'), q('Q1 2026')],
  work: {
    days: 90, total: 10, top_share: 80,
    areas: [{ area: 'Risks', n: 8 }, { area: 'Systems', n: 2 }],
    people: [{ id: 'u1', name: 'Lewis Fisher', roles: ['ciso'], total: 8, areas: { Risks: 6, Systems: 2 } },
      { id: 'u2', name: 'Katie Sommer', roles: ['security_consultant'], total: 2, areas: { Risks: 2 } }],
  },
};
let caps;
const { riskAnswerSample } = await import('../components/RiskAnswer.sample');
vi.mock('../api', () => ({ getTeamService: vi.fn(async () => report), getRiskAnswer: vi.fn(async () => riskAnswerSample()) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { TeamServicePage } = await import('./TeamServicePage');
const page = () => render(<MemoryRouter><TeamServicePage /></MemoryRouter>);

beforeEach(() => { caps = ['reports.read']; });

describe('The security team’s service', () => {
  test('needs reports.read', () => {
    caps = [];
    page();
    expect(screen.getByText(/Insufficient permissions/i)).toBeInTheDocument();
  });

  test('the headline says what is waiting and the longest wait', async () => {
    page();
    expect(await screen.findByText('things the business is waiting on security for')).toBeInTheDocument();
    expect(screen.getByText('40 days')).toBeInTheDocument();
    expect(screen.getByText('The oldest is a risk waiting for validation.')).toBeInTheDocument();
    expect(screen.getByText('9 per member of the security team (2).')).toBeInTheDocument();
  });

  test('each wait unfolds the risk\'s answer in place, with its age', async () => {
    page();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Show' }))[0]);
    expect(screen.getByText(/waiting 40 days; Treasury/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Payroll — Ransomware/ }));
    expect(await screen.findByText('Mitigate, not agreed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /The decision record/ })).toHaveAttribute('href', '/risks/r1#decision');
  });

  test('where the work goes names who carries it', async () => {
    page();
    expect(await screen.findByText(/Lewis Fisher made 80% of them/)).toBeInTheDocument();
    expect(screen.getByText('Q4 2026')).toBeInTheDocument();
  });
});
