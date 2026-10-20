// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The SoA page is a REGISTER (2026-09-22): the statement an auditor reads. It
// reports each objective's decision, justification, implementation and maturity,
// and edits none of them in place — those live on the objective's own page. Its
// one editing act is deciding several objectives at once.
//
// (These tests replace the save-failure tests for the old inline editors. That
// lesson — a failure must keep what was typed — moved with the editing, to the
// objective page, and is pinned there; here it applies to the bulk reason.)

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const row = (id, ref, title, extra = {}) => ({
  control_id: id, ref, title, entry_kind: 'control', applicable: true, status: 'adopted',
  justification: 'Policy requires it', drivers: [], implementation_status: 'implemented',
  implementation_description: 'Provided by ManageEngine', effectiveness: 3, standard_refs: [], ...extra,
});

const decideSoaBulk = vi.fn();
const setDeliveryBulk = vi.fn();
let rows;

vi.mock('../api', () => ({
  getSoaFindings: () => Promise.resolve({ counts: {}, findings: [] }),
  getSoa: () => Promise.resolve({ framework: 'all', framework_label: 'All control objectives', summary: {},
    groups: [{ label: 'NIST Cybersecurity Framework', controls: rows }] }),
  getSoaCoverage: () => Promise.resolve(null),
  getSoaVersions: () => Promise.resolve({ versions: [] }),
  createSoaVersion: () => Promise.resolve({}),
  updateSoaEntry: vi.fn(),
  getStandards: () => Promise.resolve({ standards: [] }),
  decideSoaBulk: (...a) => decideSoaBulk(...a),
  setDeliveryBulk: (...a) => setDeliveryBulk(...a),
  getScopes: () => Promise.resolve({ scopes: [{ id: 's-cde', name: 'Cardholder data environment' }] }),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'ciso' }, hasCapability: () => true, capabilitiesReady: true }),
}));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));

const { StatementOfApplicabilityPage } = await import('./StatementOfApplicabilityPage');
const show = () => render(<MemoryRouter><StatementOfApplicabilityPage /></MemoryRouter>);

beforeEach(() => {
  decideSoaBulk.mockReset();
  rows = [
    row('c1', 'GV.OC-01', 'Mission is understood', { scopes: [{ id: 's-cde', name: 'Cardholder data environment' }] }),
    row('c2', 'GV.OC-02', 'Stakeholders are understood', { applicable: false, status: 'not_applicable', justification: null }),
    row('c3', 'GV.OC-03', 'Legal requirements', { applicable: false, status: 'not_decided', justification: null, delivery: 'organisation' }),
  ];
});

describe('the register reads, it does not edit', () => {
  test('shows each objective\'s decision, why and how — with no editors', async () => {
    show();
    expect(await screen.findByText('Policy requires it')).toBeInTheDocument();
    expect(screen.getByText('Provided by ManageEngine')).toBeInTheDocument();
    expect(screen.getByText('Adopted')).toBeInTheDocument();
    expect(screen.getAllByText('No justification recorded')).toHaveLength(1);   // decided, but unexplained
    expect(screen.queryByPlaceholderText(/Why does this objective/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/endpoint management platform/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Applicable$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assess|Re-rate/ })).not.toBeInTheDocument();
  });

  test('each objective links to its own page, where it is edited', async () => {
    show();
    const link = await screen.findByRole('link', { name: 'Mission is understood' });
    expect(link).toHaveAttribute('href', '/controls/c1');
  });
});

// The figure and the list are the same question asked twice (owner, 2026-09-24).
describe('clicking a summary figure filters the register', () => {
  test('narrows to the rows it counted, and clicking again clears it', async () => {
    const user = userEvent.setup();
    show();
    expect(await screen.findByRole('link', { name: 'Mission is understood' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Not applicable/ }));
    expect(screen.queryByRole('link', { name: 'Mission is understood' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Not applicable/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Not applicable/ }));
    expect(screen.getByRole('link', { name: 'Mission is understood' })).toBeInTheDocument();
  });

  test('says so when a figure leaves nothing on screen, and offers the way back', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('link', { name: 'Mission is understood' });
    await user.click(screen.getByRole('button', { name: /Missing justification/ }));
    if (screen.queryByText(/Nothing matches the figures/)) {
      await user.click(screen.getByRole('button', { name: 'Show everything' }));
    }
    expect(screen.getByRole('link', { name: 'Mission is understood' })).toBeInTheDocument();
  });
});

describe('the bulk decision', () => {
  // A bare checkbox reads as a bullet, and what it is for is invisible until
  // something is ticked (owner, 2026-09-24).
  test('the selection boxes say what they are, and what selecting is for', async () => {
    show();
    expect(await screen.findByText(/Select objectives to decide several together/)).toBeInTheDocument();
    expect(screen.getAllByText('Select').length).toBeGreaterThan(0);
    expect(screen.getByText(/^Select all \d+$/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('checkbox', { name: /GV.OC-01/ }));
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.queryByText(/Select objectives to decide several together/)).not.toBeInTheDocument();
  });

  test('selecting shows the bar; adopting sends only the decision', async () => {
    const user = userEvent.setup();
    decideSoaBulk.mockResolvedValue({ decided: 2, justification_kept: 1, statuses: {} });
    show();
    await user.click(await screen.findByRole('checkbox', { name: /GV.OC-01/ }));
    await user.click(screen.getByRole('checkbox', { name: /GV.OC-03/ }));
    const bar = screen.getByRole('region', { name: /Decide the selected/ });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    await user.type(within(bar).getByRole('textbox', { name: 'Reason' }), 'Baseline policy');
    await user.click(within(bar).getByRole('button', { name: 'Decide 2' }));
    expect(decideSoaBulk).toHaveBeenCalledWith({ control_ids: ['c1', 'c3'], applicable: true, justification: 'Baseline policy', drivers: [], scope_ids: [] });
    expect(await screen.findByText(/Decided 2 objectives; kept the justification already written on 1/)).toBeInTheDocument();
  });

  test('marking not applicable needs a reason, and sends nothing without one', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('checkbox', { name: /GV.OC-03/ }));
    const bar = screen.getByRole('region', { name: /Decide the selected/ });
    await user.click(within(bar).getByRole('radio', { name: /Not applicable/ }));
    await user.click(within(bar).getByRole('button', { name: 'Decide 1' }));
    expect(decideSoaBulk).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/needs a reason/);
  });

  test('a failure keeps the selection and the typed reason', async () => {
    const user = userEvent.setup();
    decideSoaBulk.mockRejectedValue({ response: { data: { error: 'boom' } } });
    show();
    await user.click(await screen.findByRole('checkbox', { name: /GV.OC-01/ }));
    const bar = screen.getByRole('region', { name: /Decide the selected/ });
    await user.type(within(bar).getByRole('textbox', { name: 'Reason' }), 'Keep me');
    await user.click(within(bar).getByRole('button', { name: 'Decide 1' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'));
    expect(within(screen.getByRole('region', { name: /Decide the selected/ })).getByRole('textbox', { name: 'Reason' })).toHaveValue('Keep me');
    expect(screen.getByRole('checkbox', { name: /GV.OC-01/ })).toBeChecked();
  });

  test('a section can be selected at once', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('checkbox', { name: /Select all 3 in NIST/ }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });
});

describe('the view dropdown', () => {
  test('offers custom control objectives alongside the record and the standards', async () => {
    show();
    const select = await screen.findByRole('combobox', { name: /view/i });
    const options = [...select.querySelectorAll('option')].map(o => o.textContent);
    expect(options).toEqual(expect.arrayContaining(['All control objectives', 'Custom control objectives']));
  });
});

describe('where objectives apply (scopes)', () => {
  test('a narrowed objective says where it applies', async () => {
    show();
    expect(await screen.findByText('in Cardholder data environment')).toBeInTheDocument();
  });

  test('the Applies-in filter narrows the register', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('Mission is understood');
    await user.selectOptions(screen.getAllByRole('combobox').find(el => el.textContent.includes('Anywhere')), 's-cde');
    expect(screen.getByText('Mission is understood')).toBeInTheDocument();
    expect(screen.queryByText('Stakeholders are understood')).not.toBeInTheDocument();
  });

  test('the bulk decision can adopt into a scope', async () => {
    const user = userEvent.setup();
    decideSoaBulk.mockResolvedValue({ decided: 1, justification_kept: 0, statuses: {} });
    show();
    await user.click(await screen.findByRole('checkbox', { name: /GV.OC-03/ }));
    const bar = screen.getByRole('region', { name: /Decide the selected/ });
    await user.selectOptions(within(bar).getByRole('combobox', { name: 'Applies in' }), 's-cde');
    await user.click(within(bar).getByRole('button', { name: 'Decide 1' }));
    expect(decideSoaBulk).toHaveBeenCalledWith(expect.objectContaining({ applicable: true, scope_ids: ['s-cde'] }));
  });
});

describe('delivery modes on the register (v127)', () => {
  test('an organisation-wide objective says so on its row', async () => {
    show();
    expect(await screen.findByText('Organisation-wide')).toBeInTheDocument();
  });

  test('the bulk bar sets the delivery mode for the selected objectives', async () => {
    const user = userEvent.setup();
    setDeliveryBulk.mockResolvedValue({ updated: 2, unchanged: 0 });
    show();
    await user.click(await screen.findByRole('checkbox', { name: /GV.OC-01/ }));
    await user.click(screen.getByRole('checkbox', { name: /GV.OC-02/ }));
    const bar = screen.getByRole('region', { name: /Decide the selected/ });
    await user.selectOptions(within(bar).getByRole('combobox', { name: 'Delivered' }), 'organisation');
    await user.click(within(bar).getByRole('button', { name: 'Set on 2' }));
    expect(setDeliveryBulk).toHaveBeenCalledWith(['c1', 'c2'], 'organisation');
    expect(await screen.findByText(/Delivery set to organisation-wide on 2 objectives/)).toBeInTheDocument();
  });
});
