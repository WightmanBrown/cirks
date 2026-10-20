// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The control OBJECTIVE page answers three questions in order: what it asks, how
// well it is met, and what our control is. It used to open straight onto editable
// engineering panels — for every role, and for objectives nobody had adopted.
// These tests pin the new contract: engineering only once adopted, read-only until
// a controls.write holder chooses to edit, and a read-out for everyone.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let detail;
let caps;
const updateSoaEntry = vi.fn();
const updateControl = vi.fn();
const rateControl = vi.fn();

vi.mock('../api', () => ({
  getSoaFindings: () => Promise.resolve({ counts: {}, findings: [] }),
  getControl: () => Promise.resolve(detail),
  getThreats: () => Promise.resolve([]),
  getUsers: () => Promise.resolve([]),
  updateControl: (...a) => updateControl(...a),
  linkControlThreat: vi.fn(),
  unlinkControlThreat: vi.fn(),
  updateControlMaturityCap: vi.fn(),
  getControlComponents: () => Promise.resolve({ components: [] }),
  updateSoaEntry: (...a) => updateSoaEntry(...a),
  getScopes: () => Promise.resolve({ scopes: [{ id: 's-cde', name: 'Cardholder data environment' }] }),
  rateControl: (...a) => rateControl(...a),
  linkControlComponent: vi.fn(), unlinkControlComponent: vi.fn(),

  createControlComponent: vi.fn(), updateControlComponent: vi.fn(),
  // Delivery patterns (v145)
  listComponents: () => Promise.resolve([]), getSystems: () => Promise.resolve([]),
  createDeliveryPattern: vi.fn(), deleteDeliveryPattern: vi.fn(),
  addDeliveryPatternPart: vi.fn(), removeDeliveryPatternPart: vi.fn(),
  listSecuritySolutions: () => Promise.resolve([]),
  getComponentRecordedOn: () => Promise.resolve([]), updateComponent: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'ciso' }, hasCapability: (c) => caps.has(c), capabilitiesReady: true }),
}));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));

const { ControlDetailPage } = await import('./ControlDetailPage');

const control = {
  id: 'c1', title: 'Administrative access requires MFA', description: 'All admin logins use a second factor.',
  control_type: 'preventive', status: 'active', is_baseline: false, framework: 'nist_csf', framework_ref: 'PR.AA-03',
  standard_refs: [{ standard: 'nist_csf', standard_name: 'NIST Cybersecurity Framework', ref: 'PR.AA-03' }],
  effectiveness: 4, effectiveness_notes: 'Audited Q3', rated_by_name: 'Lewis Fisher', rated_at: '2026-09-01T00:00:00Z',
};
const threats = [{ id: 't1', threat_id: 'th1', threat_name: 'Credential theft', threat_category: 'identity', threat_source: 'external', notes: null }];
const readout = { deployed_systems: 5, by_status: { operational: 3, degraded: 2, not_applicable: 1 }, risks_treated: 7, systems_with_risks_treated: 4 };

const show = (path = '/controls/c1') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/controls/:id" element={<ControlDetailPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  caps = new Set(['controls.read', 'controls.write']);
  updateSoaEntry.mockReset(); rateControl.mockReset(); updateControl.mockReset();
});

describe('an objective nobody has adopted', () => {
  beforeEach(() => {
    detail = { control, threats, readout, soa: { decided: false, applicable: false, drivers: [] } };
  });

  test('explains what it asks, and shows no engineering', async () => {
    show();
    expect(await screen.findByText('All admin logins use a second factor.')).toBeInTheDocument();
    expect(screen.getByText(/has not been adopted yet/)).toBeInTheDocument();
    expect(screen.queryByText('Components')).not.toBeInTheDocument();
    expect(screen.queryByText(/Threats it counters/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit control/ })).not.toBeInTheDocument();
  });

  test('says it is undecided, and where to decide it', async () => {
    show();
    expect(await screen.findByText('Not yet decided')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Statement of Applicability/ }).length).toBeGreaterThan(0);
  });
});

describe('an adopted objective', () => {
  beforeEach(() => {
    detail = { control, threats, readout, soa: {
      decided: true, applicable: true, justification: 'Contractual', implementation_status: 'partial',
      implementation_description: 'Okta for staff; contractors pending', drivers: ['contractual'],
    } };
  });

  test('reads out how well it is met', async () => {
    show();
    const heading = await screen.findByRole('heading', { name: /How well it is met/ });
    const readout = within(heading.closest('div'));
    expect(readout.getByText('Okta for staff; contractors pending')).toBeInTheDocument();
    expect(readout.getByText('Partial')).toBeInTheDocument();
    expect(readout.getByText('Audited Q3')).toBeInTheDocument();
    expect(screen.getByText('3 operational')).toBeInTheDocument();
    expect(screen.getByText('2 degraded')).toBeInTheDocument();
    expect(screen.getByText(/Excluded, with a reason, on 1 system/)).toBeInTheDocument();
    expect(screen.getByText('7 active risks across 4 systems')).toBeInTheDocument();
  });

  test('shows its control read-only until an editor chooses to edit', async () => {
    const user = userEvent.setup();
    show();
    expect(await screen.findByText('Credential theft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Link threat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unlink threat/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit control' }));
    expect(screen.getByRole('button', { name: /Link threat/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unlink threat/ })).toBeInTheDocument();
  });

  test('every part of Our control is open — nothing is folded away', async () => {
    show();
    await screen.findByText('Credential theft');
    // Gone from this page (owner, 2026-10-06/07): the component graph, and the
    // components list — what delivers an objective is its security solutions.
    expect(screen.queryByText('Components and relationships')).toBeNull();
    expect(screen.getByText('Security solutions')).toBeInTheDocument();
    expect(screen.queryByText('Component graph')).toBeNull();
    expect(document.querySelectorAll('[aria-expanded]')).toHaveLength(0);
  });

  test('Our control shows implementation and maturity without entering edit mode', async () => {
    show();
    await screen.findByText('Credential theft');
    const section = screen.getByRole('heading', { name: 'Implementation' }).closest('div');
    expect(within(section).getByText('Partial')).toBeInTheDocument();
    expect(within(section).getByText('Okta for staff; contractors pending')).toBeInTheDocument();
    expect(within(section).getByText('Audited Q3')).toBeInTheDocument();
    expect(within(section).getByText(/Rated by Lewis Fisher/)).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: /Save implementation/ })).not.toBeInTheDocument();
  });

  test('offers no edit mode without controls.write', async () => {
    caps = new Set(['controls.read']);
    show();
    await screen.findByText('Credential theft');
    expect(screen.queryByRole('button', { name: /Edit control/ })).not.toBeInTheDocument();
  });

  test('implementation and maturity are edited with the control, in Edit control mode', async () => {
    const user = userEvent.setup();
    updateSoaEntry.mockResolvedValue({});
    rateControl.mockResolvedValue({ control: { effectiveness: 5, effectiveness_notes: 'Pen-tested', status: 'adopted' } });
    show();
    await screen.findAllByText('Audited Q3');
    expect(screen.queryByRole('button', { name: /Save implementation/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit control' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /Implementation status/ }), 'implemented');
    await user.click(screen.getByRole('button', { name: /Maturity 5/ }));
    const evidence = screen.getByPlaceholderText(/Evidence for this rating/);
    await user.clear(evidence);
    await user.type(evidence, 'Pen-tested');
    await user.click(screen.getByRole('button', { name: /Save implementation/ }));
    expect(updateSoaEntry).toHaveBeenCalledWith('c1', { implementation_status: 'implemented', implementation_description: 'Okta for staff; contractors pending' });
    expect(rateControl).toHaveBeenCalledWith('c1', { effectiveness: 5, effectiveness_notes: 'Pen-tested' });
  });
});

// A finding links here saying "change the decision", so the form must be open
// when the reader arrives (owner, 2026-09-24).
describe('arriving from a finding', () => {
  test('?decide=1 opens the decision form', async () => {
    show('/controls/c1?decide=1');
    expect(await screen.findByRole('radio', { name: /It applies — adopt it/ })).toBeInTheDocument();
  });

  test('without the capability it stays read-only', async () => {
    caps = new Set(['controls.read']);
    show('/controls/c1?decide=1');
    expect(await screen.findByText(/Adopted — it applies\./)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /It applies — adopt it/ })).not.toBeInTheDocument();
  });
});

describe('the decision is made on the objective page', () => {
  beforeEach(() => {
    detail = { control, threats, readout, soa: { decided: false, applicable: false, drivers: [] } };
  });

  test('deciding it applies sends the decision and relabels the page', async () => {
    const user = userEvent.setup();
    updateSoaEntry.mockResolvedValue({ control_status: 'not_assessed' });
    show();
    await user.click(await screen.findByRole('button', { name: 'Decide' }));
    await user.type(screen.getByRole('textbox', { name: /Why it applies/ }), 'Contract with the bank');
    await user.click(screen.getByRole('button', { name: 'contractual' }));
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(updateSoaEntry).toHaveBeenCalledWith('c1', { applicable: true, justification: 'Contract with the bank', drivers: ['contractual'], scope_ids: [] });
    expect(await screen.findByText('Adopted — it applies.')).toBeInTheDocument();
  });

  test('saying it does not apply needs a reason', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Decide' }));
    await user.click(screen.getByRole('radio', { name: /does not apply/ }));
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(updateSoaEntry).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/needs a reason/);
  });

  test('a failed save keeps what was typed — the lesson from the old inline editor', async () => {
    const user = userEvent.setup();
    updateSoaEntry.mockRejectedValue(new Error('network'));
    show();
    await user.click(await screen.findByRole('button', { name: 'Decide' }));
    const why = screen.getByRole('textbox', { name: /Why it applies/ });
    await user.type(why, 'Words I do not want to lose');
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/still here/);
    expect(screen.getByRole('textbox', { name: /Why it applies/ })).toHaveValue('Words I do not want to lose');
  });

  test('without controls.write there is nothing to decide', async () => {
    caps = new Set(['controls.read']);
    show();
    await screen.findByText('Not decided yet.');
    expect(screen.queryByRole('button', { name: 'Decide' })).not.toBeInTheDocument();
  });
});

describe('the objective\'s own words can be edited', () => {
  beforeEach(() => {
    detail = { control, threats, readout, soa: { decided: false, applicable: false, drivers: [] } };
  });

  test('saving rewords the page', async () => {
    const user = userEvent.setup();
    updateControl.mockResolvedValue({ control: { title: 'Admin access requires MFA', description: 'Every admin login.' } });
    show();
    await user.click(await screen.findByRole('button', { name: 'Edit wording' }));
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title); await user.type(title, 'Admin access requires MFA');
    const desc = screen.getByRole('textbox', { name: 'Description' });
    await user.clear(desc); await user.type(desc, 'Every admin login.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateControl).toHaveBeenCalledWith('c1', { title: 'Admin access requires MFA', description: 'Every admin login.' });
    expect(await screen.findByRole('heading', { name: /Admin access requires MFA/ })).toBeInTheDocument();
  });

  test('a blank title is refused before sending', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Edit wording' }));
    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateControl).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be blank/);
  });

  test('a failed save (e.g. a title already used) keeps what was typed', async () => {
    const user = userEvent.setup();
    updateControl.mockRejectedValue({ response: { data: { error: 'Another control objective is already titled "X".' } } });
    show();
    await user.click(await screen.findByRole('button', { name: 'Edit wording' }));
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title); await user.type(title, 'X');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already titled/);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('X');
  });

  test('is not offered without controls.write', async () => {
    caps = new Set(['controls.read']);
    show();
    await screen.findByText('All admin logins use a second factor.');
    expect(screen.queryByRole('button', { name: 'Edit wording' })).not.toBeInTheDocument();
  });
});

describe('where the objective applies (scopes)', () => {
  test('it can be narrowed to a scope when deciding', async () => {
    const user = userEvent.setup();
    detail = { control, threats, readout, soa: { decided: false, applicable: false, drivers: [] } };
    updateSoaEntry.mockResolvedValue({ control_status: 'not_assessed' });
    show();
    await user.click(await screen.findByRole('button', { name: 'Decide' }));
    await user.click(await screen.findByRole('radio', { name: /Only in these scopes/ }));
    await user.click(screen.getByRole('button', { name: 'Cardholder data environment' }));
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(updateSoaEntry).toHaveBeenCalledWith('c1', expect.objectContaining({ applicable: true, scope_ids: ['s-cde'] }));
    expect(await screen.findByText(/Applies in:/)).toHaveTextContent('Cardholder data environment');
  });

  test('narrowed with no scope chosen is refused before sending', async () => {
    const user = userEvent.setup();
    detail = { control, threats, readout, soa: { decided: false, applicable: false, drivers: [] } };
    show();
    await user.click(await screen.findByRole('button', { name: 'Decide' }));
    await user.click(await screen.findByRole('radio', { name: /Only in these scopes/ }));
    await user.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(updateSoaEntry).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one scope/);
  });

  test('the read-out compares deployment with where it applies, and flags deployment outside', async () => {
    detail = { control, threats,
      readout: { ...readout, expected_systems: 3, deployed_expected: 2, deployed_outside: 1 },
      soa: { decided: true, applicable: true, implementation_status: 'partial', drivers: [],
             scopes: [{ id: 's-cde', name: 'Cardholder data environment' }] } };
    show();
    expect(await screen.findByText(/On 2 of 3 systems where it applies \(Cardholder data environment\)/)).toBeInTheDocument();
    expect(screen.getByText(/Also on 1 system outside where it applies/)).toBeInTheDocument();
  });
});

describe('how the control is delivered (v127)', () => {
  const adopted = { decided: true, applicable: true, implementation_status: 'implemented', drivers: [], scopes: [] };

  test('not stated: the read-out counts deployments as today and says the mode is not stated', async () => {
    detail = { control: { ...control, delivery: null }, threats, soa: adopted,
               readout: { ...readout, expected_systems: 51, deployed_expected: 21 } };
    show();
    expect(await screen.findByText(/On 21 of 51 systems where it applies/)).toBeInTheDocument();
    expect(screen.getByText(/How it is delivered is not stated/)).toBeInTheDocument();
  });

  test('organisation-wide: reaches everywhere it applies, without counting deployments', async () => {
    detail = { control: { ...control, delivery: 'organisation' }, threats, soa: adopted,
               readout: { ...readout, reach_systems: 51 } };
    show();
    expect(await screen.findByText(/Delivered organisation-wide — reaches all 51 systems where it applies/)).toBeInTheDocument();
    expect(screen.queryByText(/not stated/)).not.toBeInTheDocument();
  });

  test('for a group: names the group and its reach', async () => {
    detail = { control: { ...control, delivery: 'group' }, threats, soa: adopted,
               readout: { ...readout, reach_systems: 28, groups: [{ id: 'g1', name: 'IT Administrators', systems: 28 }] } };
    show();
    expect(await screen.findByText(/For IT Administrators — reaches 28 systems where it applies/)).toBeInTheDocument();
  });

  test('for a group with none linked: says so, rather than reporting zero as if it were a fact', async () => {
    detail = { control: { ...control, delivery: 'group' }, threats, soa: adopted, readout: { ...readout, reach_systems: 0, groups: [] } };
    show();
    expect(await screen.findByText(/no group is linked yet/)).toBeInTheDocument();
  });

  test('the mode is chosen in Edit control, one only, and saved', async () => {
    const user = userEvent.setup();
    detail = { control: { ...control, delivery: null }, threats, soa: adopted, readout };
    updateControl.mockResolvedValue({ control: { delivery: 'organisation' } });
    show();
    await screen.findByText('Credential theft');
    await user.click(screen.getByRole('button', { name: 'Edit control' }));
    const group = screen.getByRole('radiogroup', { name: 'How it is delivered' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    await user.click(within(group).getByRole('radio', { name: /Organisation-wide/ }));
    await user.click(screen.getByRole('button', { name: /Save implementation/ }));
    expect(updateControl).toHaveBeenCalledWith('c1', { delivery: 'organisation' });
  });
});
