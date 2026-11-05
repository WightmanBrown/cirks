// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The risk analyst's My work, and where unknown risk is hiding (docs/reporting-analyst.md).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const report = (who = { kind: 'self', name: 'Stevie Topping', can_choose: false }) => ({
  generated_at: '2026-11-04T10:00:00Z', who, thresholds: { action: 15 },
  headline: { risks_identified: 10, to_do: 3, first_time: 7, validated: 8, at_or_above_action: 4 },
  work: [
    { key: 'returned', label: 'Returned to you for rework', count: 1, rows: [{ risk_id: 'r1', label: 'Payroll — Ransomware', score: 20, why: 'Rationale too thin', link: '/risks/r1' }] },
    { key: 'pending', label: 'Waiting for the CISO to validate', count: 0, rows: [] },
  ],
  findings: { total: 0 },
  actions: [],
  quality: { risks: 10, completeness: { fully_judged: 6, objectives_unjudged: 5, impact_known: 10 },
    acceptance: { validated: 8, first_time: 7, returned_now: 1, pending: 1 }, timeliness: { past_review: 0, median_days_since_assessed: 30 },
    consistency: { soa_findings: 0, objective_solution: 2, component_scope: 1 } },
  record: { days: 365, risks_identified: 10, judgements_set: 40, scores_lowered: 12, points_removed: 96, scores_raised: 0, actions_built: 2, actions_completed: 1, findings_acted: 0, meetings_attended: 0 },
  benefit: { fixes: [{ control_id: 'c1', reference: 'PR.AA-05', title: 'Access permissions', points_removed: 38, risks: 6, systems: 3 }], unjudged: 4 },
  relationships: [{ department_id: 'd1', department_name: 'Health', owner_names: 'Grace Hopper', iam_names: 'Florence Nightingale', risks: 5, at_or_above_action: 2, unanswered: 2, unknown: 3, shared_systems_used: 8 }],
});
const unknown = {
  generated_at: '2026-11-04T10:00:00Z', thresholds: { action: 15 }, high_unjudged: 2,
  groups: [
    { key: 'unassessed', label: 'Threats identified on a system but not assessed', count: 1, who: 'A risk analyst: assess the risk',
      rows: [{ system_id: 's1', system_name: 'Payroll', threat_name: 'Phishing', department_name: 'Treasury' }] },
    { key: 'no_assets', label: 'Systems holding no information asset, so their impact is unknown', count: 0, who: 'The IAM', rows: [] },
  ],
};
let caps, data;
const getAnalystReport = vi.fn(async () => data);
vi.mock('../api', () => ({ getAnalystReport: (...a) => getAnalystReport(...a), getUnknownRisk: vi.fn(async () => unknown) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { AnalystReportPage } = await import('./AnalystReportPage');
const { UnknownRiskPage } = await import('./UnknownRiskPage');

beforeEach(() => { caps = ['risks.write', 'reports.read']; data = report(); getAnalystReport.mockClear(); });

describe('My work', () => {
  const show = () => render(<MemoryRouter><AnalystReportPage /></MemoryRouter>);
  test('puts a risk returned for rework first, with the reason and a link', async () => {
    show();
    expect(await screen.findByText('Payroll — Ransomware')).toHaveAttribute('href', '/risks/r1');
    expect(screen.getByText(/Rationale too thin/)).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for the CISO/)).not.toBeInTheDocument();
  });
  test('shows the difference made from the record', async () => {
    show();
    expect(await screen.findByText('points taken off risk scores in the last year')).toBeInTheDocument();
    expect(screen.getAllByText('96').length).toBeGreaterThan(0);
  });
  test('names the people to work with in each department', async () => {
    show();
    expect(await screen.findByText('IAO Grace Hopper; IAM Florence Nightingale')).toBeInTheDocument();
  });
  test('an analyst cannot choose another analyst; the CISO can', async () => {
    show();
    await screen.findByText('My work', { selector: 'h1', exact: false });
    expect(screen.queryByLabelText('Whose work')).not.toBeInTheDocument();
    data = report({ kind: 'team', can_choose: true, analysts: [{ id: 'u1', full_name: 'Stevie Topping' }] });
    show();
    fireEvent.change(await screen.findByLabelText('Whose work'), { target: { value: 'u1' } });
    expect(getAnalystReport).toHaveBeenLastCalledWith('u1');
  });
});

describe('Where unknown risk is hiding', () => {
  const show = () => render(<MemoryRouter><UnknownRiskPage /></MemoryRouter>);
  test('lists each kind with who can put it right, and opens the rows', async () => {
    show();
    expect(await screen.findByText('Threats identified on a system but not assessed')).toBeInTheDocument();
    expect(screen.getByText('Who can put it right: A risk analyst: assess the risk.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByText('Payroll — Phishing')).toHaveAttribute('href', '/systems/s1');
  });
});
