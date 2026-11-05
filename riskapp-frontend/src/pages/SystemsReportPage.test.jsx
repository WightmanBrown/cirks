// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The IAM's My systems and system reports (docs/reporting-iam.md).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const grid = () => Array.from({ length: 5 }, () => Array(5).fill(0));
const sys = (id, name, extra = {}) => ({
  system_id: id, system_name: name, managed_by_name: 'Florence Nightingale', managed_by_me: false,
  risks: 3, max_score: 20, at_or_above_action: 2, answered: 1,
  objectives: { operational: 20, degraded: 2, missing: 3 }, record_complete: false, record_missing: 2,
  open_actions: 1, compliance: [{ code: 'nist_csf', name: 'NIST CSF', applies: 25, met: 20, partial: 2, gap: 3 }], since: null, ...extra,
});
const list = {
  generated_at: '2026-11-04T10:00:00Z', can_choose: false, department: { id: 'd1', name: 'Health' },
  thresholds: { action: 15, owner_max: 19 },
  systems: [sys('s1', 'Medical Records', { managed_by_me: true }), sys('s2', 'Pharmacy')],
  shared: { relied_on: [{ system_id: 's1', system_name: 'Medical Records', department_id: 'd2', department_name: 'Justice', owner_names: 'Bob Kirk', services: ['Courts'] }], depends_on: 8 },
  record: { days: 365, items_completed: 0, median_days_to_complete: null, completed: [], items_open: 0, score_changes: 0, assets_rated: 0, actions_raised: 0, meetings_attended: 0, recorded_changes: 0 },
};
const one = {
  generated_at: '2026-11-04T10:00:00Z',
  system: { id: 's1', name: 'Medical Records', department_name: 'Health', managed_by_name: 'Florence Nightingale', owner_names: 'Grace Hopper' },
  thresholds: { action: 15, owner_max: 19 },
  headline: { risks: 1, at_or_above_action: 1, above_owner_max: 0, answered: { treated: 0, accepted: 0, nothing: 1 } },
  heat_map: { current: grid(), target: grid() },
  risks: [{ risk_id: 'r1', threat_name: 'Ransomware', score: 20, target_score: null, at_or_above_action: true, answer: 'nothing', explanation: 'Malware that encrypts data' }],
  assets: [], services: [], actions: [],
  compliance: [{ code: 'nist_csf', name: 'NIST CSF', applies: 2, met: 1, partial: 0, gap: 1,
    requirements: [{ id: 'q1', ref: 'PR.AA-05', title: 'Access permissions', state: 'gap', objectives: [], shortfalls: [{ title: 'Least privilege', ref: 'C-1', status: 'missing' }] }] }],
  value: { made: [], removed: 0, in_place: [], to_fund: [] },
  improvement: { trend: [], changes: [], days: 365 },
  decisions: [{ risk_id: 'r1', kind: 'minuted', at: '2026-10-01T00:00:00Z', by: 'Meg Secretary', words: 'Mitigate by March', on: 'the risk', department_present: [], threat_name: 'Ransomware', ref: 'ai1', views: [] }],
  people: { solutions: [{ solution_id: 'p1', name: 'EDR', hours: 2, basis: 'per_system' }], hours_here: 2, shared: [], not_known: 1, named: [{ component_id: 'c1', name: 'Records team' }], open_items: [] },
};
let caps;
const recordDecisionView = vi.fn(async () => ({}));
vi.mock('../api', () => ({
  getSystemsReport: vi.fn(async () => list), getSystemReport: vi.fn(async () => one), getDepartments: vi.fn(async () => []),
  recordDecisionView: (...a) => recordDecisionView(...a),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { SystemsReportPage } = await import('./SystemsReportPage');
const { SystemReportPage } = await import('./SystemReportPage');

beforeEach(() => { caps = ['reports.department']; });

describe('My systems', () => {
  const show = () => render(<MemoryRouter><SystemsReportPage /></MemoryRouter>);
  test('lists the department’s systems, each opening its report', async () => {
    show();
    expect(await screen.findByText('Pharmacy')).toHaveAttribute('href', '/reporting/systems/s2');
    expect(screen.getAllByText('NIST CSF: 20 of 25 met')).toHaveLength(2);
  });
  test('narrows to the systems managed by me', async () => {
    show();
    fireEvent.click(await screen.findByText('Managed by me (1)'));
    expect(screen.queryByText('Pharmacy')).not.toBeInTheDocument();
  });
  test('says plainly when nothing is recorded under my name', async () => {
    show();
    expect(await screen.findByText(/CIRKS has nothing recorded under your name/)).toBeInTheDocument();
    expect(screen.getByText('Bob Kirk')).toBeInTheDocument();
  });
});

describe('System report', () => {
  const show = () => render(<MemoryRouter initialEntries={['/reporting/systems/s1']}>
    <Routes><Route path="/reporting/systems/:id" element={<SystemReportPage />} /></Routes></MemoryRouter>);
  test('explains each risk and whether it is answered', async () => {
    show();
    expect(await screen.findByText('Malware that encrypts data')).toBeInTheDocument();
    expect(screen.getByText('Nothing answering it')).toBeInTheDocument();
  });
  test('shows a requirement not met here, with the objective missing', async () => {
    show();
    fireEvent.click(await screen.findByText('Show the requirements not met'));
    expect(screen.getByText('C-1 Least privilege (missing)')).toBeInTheDocument();
  });
  test('sums the effort estimated for each system, and says what is not known', async () => {
    show();
    expect(await screen.findByText('2 hours a month')).toBeInTheDocument();
    expect(screen.getByText(/1 solution in use here has no estimate/)).toBeInTheDocument();
  });
  test('the department may record a view on a decision, which is sent with the decision it is on', async () => {
    caps = ['reports.department', 'decisions.record_view'];
    show();
    fireEvent.click(await screen.findByText('Record my view'));
    fireEvent.change(screen.getByLabelText(/Your view on this decision/), { target: { value: 'I disagree: the budget was not there' } });
    fireEvent.click(screen.getByText('Record'));
    await screen.findByText('Record my view');
    expect(recordDecisionView).toHaveBeenCalledWith('r1', { decision_kind: 'minuted', decision_ref: 'ai1', body: 'I disagree: the budget was not there' });
  });
  test('without the capability, no view can be recorded', async () => {
    show();
    await screen.findByText(/Mitigate by March/);
    expect(screen.queryByText('Record my view')).not.toBeInTheDocument();
  });
  test('records each decision with whether the department was present', async () => {
    show();
    expect(await screen.findByText(/Mitigate by March/)).toBeInTheDocument();
    expect(screen.getByText('Nobody from the department was recorded present')).toBeInTheDocument();
  });
});
