// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The CISO report (docs/reporting-ciso.md): C2, C1, C5.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const risk = (id, state, extra = {}) => ({
  risk_id: id, system_name: `System ${id}`, threat_name: 'Ransomware', department_name: 'Health', score: 16,
  validated: true, treatment_decision: 'mitigate', minuted: null, owner_act: null, in_hand: null, state, ...extra,
});
const report = {
  generated_at: '2026-11-03T10:00:00Z', thresholds: { action: 12 },
  headline: { at_or_above_action: 3, agreed: 1, shared_systems_at_risk: 1, joint_fixes: 1 },
  agreement: {
    total: 3, agreed: 1, decided_not_agreed: 1, not_decided: 1,
    risks: [
      risk('a', 'agreed', { minuted: { meeting_date: '2026-09-30', decision_text: 'Treat it', about: 'risk', department_present: true } }),
      risk('b', 'decided_not_agreed'),
      risk('c', 'not_decided', { validated: false, treatment_decision: null }),
    ],
  },
  investment: {
    objectives: 3, costed: 1, unjudged: 1,
    fixes: [
      { control_id: 'o1', title: 'Networks are monitored', reference: 'DE.CM-01', risks: 14, risks_judged: 14, risks_agreed: 6,
        risks_with_work: 0, points_removed: 36, risks_brought_below_action: 3, systems: 9, points_per_system: 4,
        departments: [{ id: 'd1', name: 'Health' }, { id: 'd2', name: 'Justice' }],
        solutions: [{ solution_id: 's1', name: 'NIDS', cost: { one_off: 9000, annual: null, basis: 'organisation' } }],
        cost: { one_off: 9000, annual: null, basis: 'organisation' }, cost_unknown_because: null, points_per_thousand: 4 },
      { control_id: 'o2', title: 'Capacity', reference: 'PR.IR-04', risks: 2, risks_judged: 1, risks_agreed: 0, risks_with_work: 0,
        points_removed: 4, risks_brought_below_action: 0, systems: 2, points_per_system: 2, departments: [{ id: 'd1', name: 'Health' }],
        solutions: [], cost: null, cost_unknown_because: 'no security solution delivers it on every system', points_per_thousand: null },
    ],
  },
  shared: {
    systems_total: 1,
    systems: [{ system_id: 'x', system_name: 'Corporate Email', department_count: 2, risks_at_or_above_action: 5, max_score: 20,
                departments: [{ id: 'd1', name: 'Health' }, { id: 'd2', name: 'Justice' }] }],
    threats: [{ threat_name: 'Ransomware', risks: 3, max_score: 16, departments: [{ id: 'd1', name: 'Health' }, { id: 'd2', name: 'Justice' }] }],
    joint_fixes: [],
  },
};
let caps;
vi.mock('../api', () => ({ getCisoReport: vi.fn(async () => report) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { CisoReportPage } = await import('./CisoReportPage');
const show = () => render(<MemoryRouter><CisoReportPage /></MemoryRouter>);

beforeEach(() => { caps = ['reports.read']; });

describe('CISO report', () => {
  test('leads with how many risks the business has agreed', async () => {
    show();
    expect(await screen.findByText('risks scoring 12 or more have a treatment the business has agreed')).toBeInTheDocument();
  });

  test('lists the risks not yet agreed first, and the agreed ones on request', async () => {
    show();
    expect(await screen.findByText('System b — Ransomware')).toBeInTheDocument();
    expect(screen.getByText('not validated')).toBeInTheDocument();
    expect(screen.queryByText('System a — Ransomware')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Agreed/ }));
    expect(screen.getByText(/Minuted .*“Treat it”/)).toBeInTheDocument();
  });

  test('ranks the fixes, with the cost or why it is not known', async () => {
    show();
    expect(await screen.findByText('Networks are monitored')).toBeInTheDocument();
    expect(screen.getByText('9,000 one-off')).toBeInTheDocument();
    expect(screen.getByText(/Not known: no security solution delivers it/)).toBeInTheDocument();
  });

  test('draws the shared systems against the departments that use them', async () => {
    show();
    expect(await screen.findByText('Corporate Email')).toBeInTheDocument();
    expect(screen.getAllByTitle(/uses Corporate Email: 5 risks/)).toHaveLength(2);
  });

  test('is closed to a role without reports.read', () => {
    caps = [];
    show();
    expect(screen.queryByText('CISO report')).not.toBeInTheDocument();
  });
});
