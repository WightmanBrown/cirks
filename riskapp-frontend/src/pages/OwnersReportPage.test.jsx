// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// Who owns what — the CISO's C4 (docs/reporting-ciso.md).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const empty = () => ({ risks: [], systems: [], assets: [], services: [], suppliers: [] });
const person = (over) => ({
  id: 'u1', name: 'Grace Hopper', email: 'g@x', role: 'information_asset_owner', roles: ['information_asset_owner'],
  department_id: 'd1', department_name: 'Health', is_active: true,
  accountable: { ...empty(), risks_count: 5,
    risks: [{ id: 'r1', score: 20, past_review: false, system_name: 'Patient records', threat_name: 'Ransomware' }],
    systems: [{ id: 's1', name: 'Patient records' }] },
  responsible: { items: [], actions: [], controls: [], documents: [], findings: [{ kind: 'rating-incomplete', id: 'a1', name: 'Clinical notes' }] },
  manages: { systems: [], assets: [], services: [] },
  load: { risks_at_threshold: 1, risks_past_review: 0, items_overdue: 0, actions_overdue: 0, findings: 1, total: 2 },
  ...over,
});
const report = {
  generated_at: '2026-11-05T10:00:00Z', thresholds: { action: 15 },
  people: [
    person(),
    person({ id: 'u2', name: 'Lee Ver', is_active: false, role: 'information_asset_manager', roles: ['information_asset_manager'],
      load: { risks_at_threshold: 0, risks_past_review: 0, items_overdue: 0, actions_overdue: 0, findings: 0, total: 0 } }),
  ],
  departments: [{ id: 'd1', name: 'Health', owner_names: 'Grace Hopper', is_siro_fallback: false, manager_names: null, risks: 5, risks_at_threshold: 1, systems: 1, assets: 0, services: 0 },
    { id: 'd2', name: 'Treasury', owner_names: 'Sam Siro', is_siro_fallback: true, manager_names: 'Ann', risks: 2, risks_at_threshold: 0, systems: 1, assets: 1, services: 1 }],
  gaps: [
    { key: 'siro_fallback', label: 'Departments with no Information Asset Owner, whose risks fall to the SIRO', count: 1, who: 'An administrator',
      rows: [{ department_id: 'd2', department_name: 'Treasury', risks: 2, risks_at_threshold: 0, services: 1 }] },
    { key: 'inactive', label: 'Records still named to someone whose account is no longer active', count: 1, who: 'An administrator',
      rows: [{ kind: 'system', id: 's9', name: 'Ledger', as: 'manager', person_name: 'Lee Ver', department_name: 'Treasury' }] },
    { key: 'documents', label: 'Policies, standards and procedures with no owner', count: 0, who: 'Whoever', rows: [] },
  ],
};
let caps;
vi.mock('../api', () => ({ getOwnersReport: vi.fn(async () => report) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { OwnersReportPage } = await import('./OwnersReportPage');
const page = () => render(<MemoryRouter><OwnersReportPage /></MemoryRouter>);

beforeEach(() => { caps = ['reports.read']; });

describe('Who owns what', () => {
  test('needs reports.read', () => {
    caps = [];
    page();
    expect(screen.getByText(/Insufficient permissions/i)).toBeInTheDocument();
  });

  test('the gaps link to the record and name who has left', async () => {
    page();
    expect(await screen.findByText(/whose risks fall to the SIRO/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Show' })[1]);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveAttribute('href', '/systems/s9');
    expect(screen.getByText(/manager: Lee Ver/)).toBeInTheDocument();
  });

  test('people with something needing them come first, and unfold to their records', async () => {
    page();
    const grace = await screen.findByRole('button', { name: 'Grace Hopper' });
    expect(screen.queryByRole('button', { name: 'Lee Ver' })).not.toBeInTheDocument();
    expect(screen.getByText('1 risk scoring 15 or higher; 1 finding')).toBeInTheDocument();
    fireEvent.click(grace);
    expect(screen.getByRole('link', { name: 'Patient records — Ransomware' })).toHaveAttribute('href', '/risks/r1');
    expect(screen.getByRole('link', { name: 'Clinical notes' })).toHaveAttribute('href', '/findings');
    fireEvent.click(screen.getByRole('button', { name: 'Inactive accounts' }));
    expect(screen.getByRole('button', { name: 'Lee Ver' })).toBeInTheDocument();
  });

  test('a department with no IAO says the SIRO carries it', async () => {
    page();
    expect(await screen.findByText('SIRO, no IAO')).toBeInTheDocument();
  });
});
