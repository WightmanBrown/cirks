// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The board summary (docs/reporting-siro.md, report 9).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const grid = () => Array.from({ length: 5 }, () => Array(5).fill(0));
const exposure = {
  total: 228, at_or_above_action: 64, above_owner_max: 10, target_at_or_above_action: 64, target_above_owner_max: 9,
  answered_by_action: 3, answered_by_acceptance: 4, unanswered: 57, decided_not_delivered: 56, acceptances: 4, acceptances_expired: 1,
};
let board, caps;
const tiles = (tol = {}) => ['at_or_above_action', 'above_owner_max', 'decided_not_delivered', 'acceptances_expired'].map((f) => {
  const key = `exposure.${f}`;
  const t = tol[key] || null;
  const value = exposure[f];
  const rag = t ? (value <= t.green_max ? 'green' : value <= t.amber_max ? 'amber' : 'red') : null;
  return { key, direction: 'lower_better', value, tolerance: t, rag };
});
const make = (trend) => {
  const current = grid(); current[4][2] = 5;   // impact 5, likelihood 3
  return {
    generated_at: '2026-11-03T10:00:00Z', definition_ver: 1, thresholds: { action: 12, owner_max: 19 },
    exposure, tiles: tiles(), heat_map: { current, target: grid() },
    compliance: [
      { code: 'nist_csf', name: 'NIST Cybersecurity Framework', loaded: true, requirements: 106, covered: 38, partial: 59, gap: 8, excluded: 1 },
      { code: 'iso27001', name: 'ISO/IEC 27001', loaded: false, requirements: 0, covered: 0, partial: 0, gap: 0, excluded: 0 },
    ],
    controls: {
      soa: { not_decided: 0, not_applicable: 1, implemented: 38, under_way: 59, not_implemented: 9 },
      on_systems: { operational: 921, degraded: 101, missing: 388 },
      effectiveness: [9, 8, 23, 13, 19], effectiveness_not_rated: 34,
      findings: { objective_without_solution: 79, component_record: 46, document_review: 0, asset_rating: 4, supplier_assurance: 16 },
    },
    efficiency: { items_completed: 2, items_withdrawn: 22, items_open: 3, actions_open: 3, actions_overdue: 0, actions_completed: 1,
                  median_days_to_complete: 9, risk_points_removed: 10, risks_reduced: 1 },
    departments: [{ department_id: 'd1', department_name: 'Communications', risks: 55, at_or_above_action: 14, above_owner_max: 3, unanswered: 14, findings: 15, assets: 7 }],
    trend,
  };
};

const api = {
  getBoardSummary: vi.fn(async () => board),
  setTolerance: vi.fn(async () => ({})),
  clearTolerance: vi.fn(async () => {}),
};
vi.mock('../api', () => api);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { BoardSummaryPage } = await import('./BoardSummaryPage');
const show = () => render(<MemoryRouter><BoardSummaryPage /></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); board = make([]); caps = ['reports.read']; });

describe('Board summary', () => {
  test('leads with the four headline numbers', async () => {
    show();
    expect(await screen.findByText('decided, with nothing carrying it out')).toBeInTheDocument();
    expect(screen.getByText('56')).toBeInTheDocument();
    expect(screen.getByText(/risks scoring 12 or more, which must be treated/)).toBeInTheDocument();
  });

  test('places risks on the heat map, saying each square\'s count', async () => {
    show();
    expect(await screen.findByTitle('Impact 5, likelihood 3 (score 15): 5 risks')).toHaveTextContent('5');
  });

  test('shows compliance as the share of requirements met', async () => {
    show();
    expect(await screen.findByText('NIST Cybersecurity Framework')).toBeInTheDocument();
    expect(screen.getByText('36%')).toBeInTheDocument();   // 38 of 105 counted, rounded down
  });

  test('lists a standard switched on without its requirements, without a percentage', async () => {
    show();
    expect(await screen.findByText('ISO/IEC 27001')).toBeInTheDocument();
    expect(screen.getByText(/Switched on, but its requirements are not loaded/)).toBeInTheDocument();
  });

  test('says when the trend starts, until there are two months', async () => {
    show();
    expect(await screen.findByText(/The trend starts in November 2026/)).toBeInTheDocument();
  });

  test('draws the trend and the direction of travel once a previous month is held', async () => {
    board = make([{ period: '2026-10', definition_ver: 1, summary: { exposure: { ...exposure, at_or_above_action: 70, above_owner_max: 10, decided_not_delivered: 56, acceptances_expired: 0 } } }]);
    show();
    expect(await screen.findByRole('img', { name: /scoring 12 or more: Oct 26 70, Nov 26 64/ })).toBeInTheDocument();
    expect(screen.getByText('▼ 6 since last month')).toBeInTheDocument();
    expect(screen.getAllByText('no change since last month').length).toBeGreaterThan(0);
  });

  test('a figure with no tolerance is not rated', async () => {
    show();
    expect((await screen.findAllByText('No tolerance set')).length).toBe(4);
    expect(screen.queryByText('Outside tolerance')).toBeNull();
    expect(screen.queryByText('Set tolerance')).toBeNull();        // reading is not setting
  });

  test('a figure is rated against the tolerance the SIRO set, in words', async () => {
    board.tiles = tiles({
      'exposure.at_or_above_action': { direction: 'lower_better', green_max: 20, amber_max: 40, reason: 'r', set_by_name: 'Helen Wright', set_at: '2026-11-03T10:00:00Z' },
      'exposure.acceptances_expired': { direction: 'lower_better', green_max: 0, amber_max: 2, reason: 'r', set_by_name: 'Helen Wright', set_at: '2026-11-03T10:00:00Z' },
    });
    show();
    expect(await screen.findByText('Outside tolerance')).toBeInTheDocument();   // 64 > 40
    expect(screen.getByText('Near the limit')).toBeInTheDocument();            // 1 ≤ 2
    expect(screen.getByText('Green up to 20, amber up to 40')).toBeInTheDocument();
    expect(screen.getAllByText(/Set by Helen Wright/).length).toBe(2);
  });

  test('the SIRO sets a tolerance with a reason', async () => {
    caps = ['reports.read', 'reports.tolerances'];
    show();
    fireEvent.click((await screen.findAllByText('Set tolerance'))[0]);
    fireEvent.change(screen.getByLabelText('Green up to'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Amber up to'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Why this tolerance'), { target: { value: 'Agreed by the board in October' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.setTolerance).toHaveBeenCalledWith('exposure.at_or_above_action',
      { green_max: 20, amber_max: 40, reason: 'Agreed by the board in October' }));
    await waitFor(() => expect(api.getBoardSummary).toHaveBeenCalledTimes(2));   // reloaded
  });
});
