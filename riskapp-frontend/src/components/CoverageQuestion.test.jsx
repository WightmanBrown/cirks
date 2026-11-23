// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CoverageQuestion } from './CoverageQuestion';

const t = (operational, degraded, missing) => ({ operational, degraded, missing, total: operational + degraded + missing });
const systems = Array.from({ length: 24 }, (_, i) => ({
  system_id: `s${i}`, name: `System ${i}`, department_id: 'd1', department_name: 'Treasury',
  risks_at_or_above_action: i === 23 ? 3 : 0, cause: i === 23 ? 'no_pattern' : null, ...t(24 - i, 0, i),
}));
const data = {
  action_threshold: 12, totals: t(10, 2, 5),
  objectives: [{ control_id: 'c1', ref: 'CIRKS1.BRR-02', title: 'Backups are protected', cause: null, ...t(9, 1, 0) },
               { control_id: 'c2', ref: 'CIRKS1.SD-01', title: 'Secure development policy', cause: 'no_solution', ...t(0, 0, 4) }],
  systems, departments: [],
  degraded: [{ system_id: 's1', system_name: 'Payroll', department_name: 'Treasury', control_id: 'c1', ref: 'CIRKS1.BRR-02', title: 'Backups are protected', risks: 2, top_score: 20 }],
};
const show = (by) => render(<MemoryRouter><CoverageQuestion data={data} by={by} /></MemoryRouter>);

describe('CoverageQuestion', () => {
  test('a short list is shown whole, with why each is low', () => {
    show('objective');
    expect(screen.getByRole('link', { name: 'BRR-02 Backups are protected' })).toHaveAttribute('href', '/controls/c1');
    expect(screen.getByText(/No security solution delivers it/)).toBeInTheDocument();
    expect(screen.queryByText('Worst covered')).toBeNull();
  });

  test('a long list shows the worst and the best, worst first, each opening the system report', () => {
    show('system');
    const worst = screen.getByRole('heading', { name: /Worst covered/ }).parentElement;
    const names = within(worst).getAllByRole('link').map((a) => a.textContent);
    expect(names[0]).toBe('System 23');
    expect(within(worst).getByRole('link', { name: 'System 23' })).toHaveAttribute('href', '/reporting/systems/s23');
    expect(within(worst).getByText(/No system pattern stated/)).toBeInTheDocument();
    const best = screen.getByRole('heading', { name: /Best covered/ }).parentElement;
    expect(within(best).getAllByRole('link')[0].textContent).toBe('System 0');
  });

  test('degraded controls show the risks behind each, the highest as a score pill', () => {
    show('degraded');
    const row = screen.getByRole('link', { name: 'Payroll' }).closest('tr');
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('20')).toBeInTheDocument();
  });

  test('a column header sorts the rows', () => {
    show('objective');
    const names = () => screen.getAllByRole('link').map((a) => a.textContent);
    expect(names()).toEqual(['BRR-02 Backups are protected', 'SD-01 Secure development policy']);
    fireEvent.click(screen.getByRole('button', { name: /In place/ }));
    expect(names()).toEqual(['SD-01 Secure development policy', 'BRR-02 Backups are protected']);
  });
});
