// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// A standard's view is a LENS on the one SoA record (v122). A requirement's state
// is derived from the controls mapped to it; the page must show that derivation
// and offer nothing to edit except an exclusion — which needs a reason.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const updateSoaEntry = vi.fn();

const req = (id, ref, state, extra = {}) => ({
  control_id: id, ref, title: `Requirement ${ref}`, description: 'd', requirement_state: state,
  applicable: state === 'covered' || state === 'partial', implementation_status: 'implemented',
  justification: null, drivers: [], exclusion: null, mapped_controls: [], ...extra,
});

vi.mock('../api', () => ({
  getSoaFindings: () => Promise.resolve({ counts: {}, findings: [] }),
  getSoa: () => Promise.resolve({
    framework: 'tpss_test', framework_label: 'Test Payment Security Standard',
    summary: { total: 2, covered: 1, partial: 0, excluded: 0, gap: 1, implemented: 1 },
    groups: [{ label: 'Payment environment', controls: [
      req('r1', '1.2', 'covered', { mapped_controls: [
        { control_id: 'c1', title: 'Inventories of systems', coverage: 'full', decided: true, applicable: true,
          implementation_status: 'implemented', implementation_description: 'ManageEngine 365' },
      ] }),
      req('r2', '2.3', 'gap'),
    ] }],
  }),
  getSoaCoverage: () => Promise.resolve(null),
  getSoaVersions: () => Promise.resolve({ versions: [] }),
  createSoaVersion: () => Promise.resolve({}),
  updateSoaEntry: (...a) => updateSoaEntry(...a),
  getStandards: () => Promise.resolve({ standards: [{ code: 'tpss_test', name: 'Test Payment Security Standard', reference_count: 12 }] }),
  getScopes: () => Promise.resolve({ scopes: [] }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'ciso' }, hasCapability: () => true, capabilitiesReady: true }),
}));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));

const { StatementOfApplicabilityPage } = await import('./StatementOfApplicabilityPage');

const show = () => render(
  <MemoryRouter initialEntries={['/soa/tpss_test']}>
    <Routes><Route path="/soa/:framework" element={<StatementOfApplicabilityPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { updateSoaEntry.mockReset(); updateSoaEntry.mockResolvedValue({}); });

describe('a standard view', () => {
  test('names the standard it is a lens on, not a hardcoded one', async () => {
    show();
    expect(await screen.findByRole('heading', { name: /Test Payment Security Standard/ })).toBeInTheDocument();
  });

  test('shows each requirement\'s derived state and the controls that meet it', async () => {
    show();
    // The row badges (the summary strip repeats the words, so match the badge's hint).
    expect(await screen.findByTitle(/At least one fully mapped control objective is applicable/)).toHaveTextContent('Covered');
    expect(screen.getByTitle(/No applicable control objective meets this requirement/)).toHaveTextContent('Gap');
    expect(screen.getByText('Inventories of systems')).toBeInTheDocument();
    expect(screen.getByText('ManageEngine 365')).toBeInTheDocument();
    expect(screen.getByText(/No control objective is mapped/)).toBeInTheDocument();
  });

  test('offers no applicability or status controls — those live on the control', async () => {
    show();
    await screen.findByTitle(/At least one fully mapped control objective is applicable/);
    expect(screen.queryByRole('checkbox', { name: /^Applicable$/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('combobox').filter(el => el.value === 'implemented')).toHaveLength(0);
  });

  test('excluding a requirement needs a reason, and sends only the exclusion', async () => {
    const user = userEvent.setup();
    show();
    const [, second] = await screen.findAllByRole('button', { name: /Exclude for this standard/ });
    await user.click(second);
    const confirm = screen.getByRole('button', { name: /^Exclude$/ });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/does this requirement not apply/), 'We hold no stored card data');
    await user.click(confirm);
    await waitFor(() => expect(updateSoaEntry).toHaveBeenCalledWith('r2', { excluded: true, justification: 'We hold no stored card data' }));
  });
});
