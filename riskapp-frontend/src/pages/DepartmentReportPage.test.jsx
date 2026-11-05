// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The IAO's My department report (docs/reporting-iao.md).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    { key: 'risks_answered', label: 'Every risk scoring 15 or more being treated or accepted', total: 4, met: 1,
      open: [{ link: '/risks/r1', label: 'Records — Ransomware', why: 'scores 20; nothing answering it' }] },
  ],
  actions: [],
  shared: { systems_total: 1, systems: [{ system_id: 's9', system_name: 'Corporate Email', owner_department_id: 'd2',
    owner_department_name: 'Communications', owner_names: 'Gordon Welchman', services: ['Patient letters'],
    risks: [{ risk_id: 'x1', threat_name: 'Phishing', score: 16, answer: 'nothing' }], risks_total: 3, at_or_above_action: 1, answered: 0, max_score: 16 }] },
  reputation: { tables_marked: 0, table_names: [], risks: [] },
  improvement: { trend: [], changes: [], days: 365 },
  gaps: { unassessed: [], systems_without_threats: [], assets_on_no_system: [], assets_not_rated: [] },
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
    expect(await screen.findByText('of your risks scoring 15 or more are being treated or accepted')).toBeInTheDocument();
    expect(screen.getByText('3 risks have nothing answering them yet.')).toBeInTheDocument();
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
