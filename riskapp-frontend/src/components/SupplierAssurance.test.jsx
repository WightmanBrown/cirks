// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('./DateField', () => ({ DateField: (p) => <input {...p} /> }));
vi.mock('../api', () => ({
  createSupplierEvidence: vi.fn(async () => ({})),
  updateSupplierEvidence: vi.fn(async () => ({})),
  deleteSupplierEvidence: vi.fn(async () => ({})),
}));
import { SupplierAssurance } from './SupplierAssurance';

const obj = (id, extra) => ({ control_id: id, title: `Objective ${id}`, ref: id, sources: ['service_provider'],
  met: false, ours: false, our_status: null, our_solutions: null, ...extra });

// One relationship: two of the supplier's objectives (one met), and two of ours.
const relationship = {
  id: 'r1', status: 'active', relationship_type: 'service_provider', system_name: 'SaaS',
  objectives: [
    obj('PR.DS-11'),
    obj('PR.DS-01', { met: true }),
    obj('GV.SC-04', { sources: ['all'], ours: true, met: true, our_status: 'implemented', our_solutions: ['CIRKS'] }),
    obj('GV.SC-01', { sources: ['all'], ours: true, our_status: 'partial', our_solutions: [] }),
  ],
  evidence: [{ id: 'e1', title: 'SOC 2', kind: 'report', is_current: true, effective_expiry: '2027-03-31', control_ids: ['PR.DS-01'] }],
  assurance_finding: { reason: 'partial', unmet_count: 1 },
};
const show = (props = {}) => render(
  <MemoryRouter><SupplierAssurance relationship={relationship} canEdit onChanged={vi.fn()} {...props} /></MemoryRouter>);

describe('SupplierAssurance', () => {
  test("counts only the supplier's objectives, and says how many of ours are in place", () => {
    show();
    const summary = screen.getByRole('button', { expanded: false });
    expect(summary).toHaveTextContent('1 of 2 supplier control objectives met');
    expect(summary).toHaveTextContent('1 not met');
    expect(summary).toHaveTextContent('ours: 1 of 2 in place');
  });

  test('shows ours apart: in place or not, and the solution that delivers it', () => {
    show({ focus: true });
    const heading = screen.getByRole('heading', { name: /Ours: met by our own control \(1 of 2 in place\)/ });
    const table = heading.nextElementSibling.nextElementSibling;
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('GV.SC-04');
    expect(rows[1]).toHaveTextContent('Yes');
    expect(rows[1]).toHaveTextContent('CIRKS');
    expect(rows[2]).toHaveTextContent('Not yet: partially implemented');
    expect(rows[2]).toHaveTextContent('No security solution recorded');
  });

  test('opens itself when the page was opened for this relationship', () => {
    show({ focus: true });
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
  });

  test("Record evidence on an unmet objective opens the form with that objective ticked, and only the supplier's are offered", () => {
    show({ focus: true });
    fireEvent.click(screen.getByRole('button', { name: 'Record evidence for PR.DS-11' }));
    const box = screen.getByRole('checkbox', { name: /PR\.DS-11/ });
    expect(box).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /PR\.DS-01/ })).not.toBeChecked();
    // Ours are never offered: a supplier's evidence cannot cover them.
    expect(screen.queryByRole('checkbox', { name: /GV\.SC/ })).toBeNull();
  });

  test('no Record evidence button on a met objective, nor without the right to edit', () => {
    show({ focus: true });
    expect(screen.queryByRole('button', { name: 'Record evidence for PR.DS-01' })).toBeNull();
    show({ focus: true, canEdit: false });
    expect(screen.getAllByRole('button', { name: /Record evidence for/ })).toHaveLength(1);   // only the first render's
  });
});
