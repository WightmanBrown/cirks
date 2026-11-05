// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The SIRO's report (docs/reporting-siro.md, reports 1 and 2).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let caps;
const risk = (over) => ({
  risk_id: 'r1', system_id: 's1', system_name: 'Payroll', threat_name: 'Ransomware',
  department_id: 'd1', department_name: 'Finance', owner_names: 'Fran Owner', owner_is_siro_fallback: false,
  score: 16, target_score: null, treatment_decision: 'mitigate', review_date: '2027-01-01',
  has_open_action: false, has_active_exception: false, ...over,
});
const report = {
  generated_at: '2026-11-03T10:00:00Z',
  thresholds: { action: 12, owner_max: 19, analyst_max: 11, max_exception_days: 365, expiring_days: 90, config_updated_at: '2026-10-01T00:00:00Z' },
  exposure: {
    total: 40, with_target: 1,
    current: { at_or_above_action: 3, above_owner_max: 1 },
    target: { at_or_above_action: 2, above_owner_max: 1 },
    by_department: [{ department_id: 'd1', department_name: 'Finance', owner_names: 'Fran Owner', total: 40, at_or_above_action: 3, above_owner_max: 1 }],
    top_risks: [risk({ score: 20, risk_id: 'r2', threat_name: 'Insider fraud' }), risk()],
    concentration: [{ system_id: 's1', system_name: 'Payroll', department_name: 'Finance', count: 2, max_score: 20 }],
  },
  decisions: {
    decided_not_delivered: [risk()],
    accept_not_recorded: [], no_decision: [],
    above_owner_max: [risk({ score: 20, risk_id: 'r2', threat_name: 'Insider fraud' })],
    acceptances: [{
      exception_id: 'e1', risk_id: 'r3', system_name: 'Website', threat_name: 'Defacement', department_name: 'Comms',
      risk_score: 15, accepted_by_name: 'Ann Analyst', accepted_role: 'risk_analyst', accepted_at: '2026-06-01T00:00:00Z',
      expires_at: '2026-12-01', days_until_expiry: 28, renewals: 2, within_authority_now: false, expiring_soon: true,
    }],
    breaches: [], signoff_pending: [],
  },
};

vi.mock('../api', () => ({
  getSiroReport: vi.fn(async () => report),
  getViewMode: vi.fn(async () => ({ view_mode: 'business' })),
  putViewMode: vi.fn(async () => ({})),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));
vi.mock('../components/CapabilityGate', () => ({ CapabilityGate: ({ capability }) => <p>needs {capability}</p> }));

const { SiroReportPage } = await import('./SiroReportPage');
const show = () => render(<MemoryRouter><SiroReportPage /></MemoryRouter>);

beforeEach(() => { caps = ['reports.read']; });

describe('SIRO report', () => {
  test('is refused without reports.read', () => {
    caps = [];
    show();
    expect(screen.getByText('needs reports.read')).toBeInTheDocument();
  });

  test('lists the risks decided with nothing carrying them out, each opening the risk', async () => {
    show();
    const heading = await screen.findByRole('heading', { name: /Decided, with nothing carrying it out/ });
    const table = heading.nextElementSibling.nextElementSibling;
    expect(table).toHaveTextContent('Ransomware');
    expect(table.querySelector('a[href="/risks/r1"]')).not.toBeNull();
  });

  test('says who may accept what, from the organisation\'s thresholds', async () => {
    show();
    expect(await screen.findByText('Information asset owner')).toBeInTheDocument();
    expect(screen.getByText('CISO, SIRO or admin')).toBeInTheDocument();
    expect(screen.getAllByText('19').length).toBeGreaterThan(0);
  });

  test('flags an acceptance outside its accepter\'s authority and one expiring soon', async () => {
    show();
    expect(await screen.findByText('No: the risk has risen')).toBeInTheDocument();
    expect(screen.getByText(/1 acceptance now outside the accepter's authority/)).toBeInTheDocument();
    expect(screen.getByText(/1 acceptance expiring within 90 days/)).toBeInTheDocument();
    expect(screen.getByText('2 times')).toBeInTheDocument();
  });

  test('shows exposure now and after committed work', async () => {
    show();
    const heading = await screen.findByRole('heading', { name: /Now, and after committed work/ });
    const rows = heading.nextElementSibling.querySelectorAll('tbody tr');
    expect(rows[0]).toHaveTextContent('Scoring 12 or more32');
    expect(rows[1]).toHaveTextContent('Above 1911');
  });
});
