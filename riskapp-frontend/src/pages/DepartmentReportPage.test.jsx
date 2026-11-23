// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The IAO's My department report (docs/reporting-iao.md).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const grid = () => Array.from({ length: 5 }, () => Array(5).fill(0));
const report = (extra = {}) => ({
  generated_at: '2026-11-04T10:00:00Z', can_choose: false,
  department: { id: 'd1', name: 'Health', owner_names: 'Grace Hopper' },
  thresholds: { action: 15, owner_max: 19 },
  headline: { risks: 10, at_or_above_action: 4, above_owner_max: 1, unanswered: 3,
    answered: { treated: 1, accepted: 0, nothing: 3 }, obligations_met: 1, obligations_total: 2,
    shared_at_or_above_action: 5, actions_need_you: 0 },
  heat_map: { current: grid(), target: grid() },
  risks: [],
  obligations: [
    { key: 'assets_rated', label: 'Every information asset rated against every mandatory impact table', total: 3, met: 3, open: [] },
    { key: 'risks_answered', label: 'Every risk scoring 15 or higher being treated or accepted', total: 4, met: 1,
      open: [{ link: '/risks/r1', label: 'Records — Ransomware', why: 'scores 20; nothing answering it' }] },
  ],
  actions: [],
  shared: { systems_total: 1, systems: [{ system_id: 's9', system_name: 'Corporate Email', owner_department_id: 'd2',
    owner_department_name: 'Communications', owner_names: 'Gordon Welchman', services: ['Patient letters'],
    risks: [{ risk_id: 'x1', threat_name: 'Phishing', score: 16, answer: 'nothing' }], risks_total: 3, at_or_above_action: 1, answered: 0, max_score: 16 }] },
  reputation: { tables_marked: 0, table_names: [], risks: [] },
  improvement: { trend: [], changes: [], days: 365 },
  gaps: { unassessed: [], systems_without_threats: [], assets_on_no_system: [], assets_not_rated: [] },
  compliance_gaps: {
    systems: [{ system_id: 's1', system_name: 'Patient Records', objectives: [
      { control_id: 'c1', ref: 'CIRKS1.BRR-02', title: 'Backups are protected', status: 'missing' },
      { control_id: 'c2', ref: 'CIRKS1.CVM-04', title: 'Malware protection', status: 'unknown' }] }],
    system_gaps: 2,
    organisation: [{ control_id: 'c3', ref: 'CIRKS1.SCM-03', title: 'Suppliers are assessed', delivery: 'organisation', status: 'planned' }],
  },
  ...extra,
});
let caps, data;
vi.mock('../api', () => ({ getDepartmentReport: vi.fn(async () => data), getDepartments: vi.fn(async () => [{ id: 'd1', name: 'Health' }, { id: 'd2', name: 'Communications' }]) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { DepartmentReportPage } = await import('./DepartmentReportPage');
const show = () => render(<MemoryRouter><DepartmentReportPage /></MemoryRouter>);

beforeEach(() => { caps = ['reports.department']; data = report(); });

describe('My department', () => {
  test('leads with the risks answered, using the organisation’s threshold', async () => {
    show();
    expect(await screen.findByText('of your risks scoring 15 or higher have a security action planned or have been formally accepted')).toBeInTheDocument();
    expect(screen.getByText('3 risks have neither yet.')).toBeInTheDocument();
  });

  test('lists open obligations with where to put them right', async () => {
    show();
    expect(await screen.findByText('Records — Ransomware')).toHaveAttribute('href', '/risks/r1');
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
  });

  test('names the owner of a shared system, read only', async () => {
    show();
    expect(await screen.findByText('Gordon Welchman')).toBeInTheDocument();
    expect(screen.getByText('Corporate Email')).not.toHaveAttribute('href');
  });

  test('lists the compliance gaps: per system, and for the whole organisation', async () => {
    show();
    expect(await screen.findByText(/2 gaps on 1 system of your department, and 1 objective delivered for the whole organisation not yet implemented/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^2/ }));
    expect(screen.getByRole('link', { name: 'BRR-02 Backups are protected' })).toHaveAttribute('href', '/controls/c1');
    expect(screen.getByText(/state unknown/)).toBeInTheDocument();
    expect(screen.getByText(/— planned/)).toBeInTheDocument();
  });

  test('says how to mark a reputational table when none is marked', async () => {
    show();
    expect(await screen.findByText(/No impact table is marked as reputational yet/)).toBeInTheDocument();
  });

  test('offers a department picker only to those who may choose', async () => {
    show();
    await screen.findByText(/Health, risk owner Grace Hopper/);
    expect(screen.queryByLabelText('Department')).not.toBeInTheDocument();
    data = report({ can_choose: true });
    show();
    expect(await screen.findByLabelText('Department')).toBeInTheDocument();
  });
});
