// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { DeliveryPatternsSection } from './DeliveryPatternsSection';

const createDeliveryPattern = vi.fn();
const addDeliveryPatternPart = vi.fn();
const recordedOn = vi.fn();
const edr = {
  id: 'p-edr', name: 'CrowdStrike EDR', kind: 'parts', parts: [],
  objectives: [{ id: 'c-mon', title: 'Monitoring', reference_code: null }, { id: 'c-log', title: 'Logging', reference_code: null }],
};
const COMPONENTS = [
  { id: 'k-agent', name: 'Falcon agent', component_type: 'technology', instantiation: 'per_system' },
  { id: 'k-console', name: 'CrowdStrike console', component_type: 'technology', instantiation: 'organisational' },
  { id: 'k-new', name: 'Rapid7 engine', component_type: 'technology', instantiation: null },
];
const veeam = { id: 'p-veeam', name: 'Veeam backup', kind: 'parts', parts: [], objectives: [{ id: 'c-bak', title: 'Backups', reference_code: null }] };

vi.mock('../api', () => ({
  createDeliveryPattern: (...a) => createDeliveryPattern(...a),
  deleteDeliveryPattern: vi.fn(), removeDeliveryPatternPart: vi.fn(),
  addDeliveryPatternPart: (...a) => addDeliveryPatternPart(...a),
  listComponents: () => Promise.resolve(COMPONENTS),
  getComponentRecordedOn: (...a) => recordedOn(...a),
  updateComponent: vi.fn(),
  listSecuritySolutions: () => Promise.resolve([edr, veeam]),
}));

const renderIt = (canEdit) => render(
  <MemoryRouter>
    <DeliveryPatternsSection controlId="c-mon" patterns={[edr]} canEdit={canEdit} onChanged={() => {}} />
  </MemoryRouter>,
);

describe('a shared security solution (v147)', () => {
  test('names the other objectives it delivers, and warns an editor that changes reach them', () => {
    renderIt(true);
    expect(screen.getByText(/Also delivers one other objective/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logging' })).toHaveAttribute('href', '/controls/c-log');
    expect(screen.getByText(/Changing its name or parts changes it for all 2/)).toBeInTheDocument();
  });

  test('a reader sees what it is shared with, but no warning about editing', () => {
    renderIt(false);
    expect(screen.getByText(/Also delivers one other objective/)).toBeInTheDocument();
    expect(screen.queryByText(/changes it for all/)).not.toBeInTheDocument();
  });

  test('adding an existing solution offers only those not already here, and sends its id', async () => {
    createDeliveryPattern.mockResolvedValue([edr, veeam]);
    renderIt(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add an existing security solution' }));
    const select = await screen.findByRole('combobox', { name: 'Security solution' });
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(2));
    expect(screen.queryByRole('option', { name: /CrowdStrike EDR/ })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'p-veeam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to this objective' }));
    await waitFor(() => expect(createDeliveryPattern).toHaveBeenCalledWith('c-mon', { pattern_id: 'p-veeam' }));
  });
});

describe('adding a part: where it can be follows from its scope', () => {
  const pick = async (id) => {
    const sel = await screen.findByLabelText('Part to add to CrowdStrike EDR');
    await waitFor(() => expect(sel.querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(sel, { target: { value: id } });
  };

  test('a component that exists once per system goes on the system — not asked', async () => {
    renderIt(true);
    await pick('k-agent');
    expect(screen.getByText(/On the system itself — Falcon agent exists once per system/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Where the part must be')).not.toBeInTheDocument();
  });

  test('one that exists once for the organisation: once for the organisation, or on a security system', async () => {
    renderIt(true);
    await pick('k-console');
    const where = screen.getByLabelText('Where the part must be');
    const labels = [...where.querySelectorAll('option')].map(o => o.textContent);
    expect(labels).toEqual(['Where must it be?', 'On a security system', 'Once for the organisation']);
  });

  test('on a security system: only the systems that record it, the only one chosen', async () => {
    recordedOn.mockResolvedValue([
      { id: 's-mon', name: 'Security monitoring platform', status: 'operational', is_security_system: true },
      // recorded here too, but not a security system: not offered (v155)
      { id: 's-other', name: 'Harbour Booking Server', status: 'operational', is_security_system: false },
    ]);
    renderIt(true);
    await pick('k-console');
    fireEvent.change(screen.getByLabelText('Where the part must be'), { target: { value: 'service' } });
    const sys = await screen.findByLabelText('Security system');
    expect([...sys.querySelectorAll('option')].map(o => o.textContent)).toEqual(['Security monitoring platform']);
    expect(sys).toHaveValue('s-mon');
  });

  test('recorded nowhere: says so, and cannot be added', async () => {
    recordedOn.mockResolvedValue([]);
    renderIt(true);
    await pick('k-console');
    fireEvent.change(screen.getByLabelText('Where the part must be'), { target: { value: 'service' } });
    expect(await screen.findByText(/is not recorded on any system yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add part/ })).toBeDisabled();
  });

  test('scope not stated: it is asked first', async () => {
    renderIt(true);
    await pick('k-new');
    expect(screen.getByText(/exist once for the organisation, or once per system/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Once per system' })).toBeInTheDocument();
  });

  test('a shared solution warns at the button, and asks before changing it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderIt(true);
    await pick('k-agent');
    const add = screen.getByRole('button', { name: 'Add part — changes it for all 2 objectives' });
    fireEvent.click(add);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/changes "CrowdStrike EDR" for all 2 objectives/));
    expect(addDeliveryPatternPart).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
