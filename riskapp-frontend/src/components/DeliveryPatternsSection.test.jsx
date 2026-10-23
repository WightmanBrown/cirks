// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../api', () => ({
  createDeliveryPattern: vi.fn(), deleteDeliveryPattern: vi.fn(),
  addDeliveryPatternPart: vi.fn(), removeDeliveryPatternPart: vi.fn(),
  listComponents: vi.fn(async () => []), listSecuritySolutions: vi.fn(async () => []),
  chooseCirksForControl: vi.fn(async () => [{ id: 'p1', name: 'CIRKS', kind: 'parts', parts: [], objectives: [] }]),
}));
import { chooseCirksForControl } from '../api';
import { DeliveryPatternsSection } from './DeliveryPatternsSection';

const cirks = { ref: 'GV.SC-04', reason: 'The supplier register records every supplier relationship.', chosen: false };
const show = (props) => render(
  <MemoryRouter><DeliveryPatternsSection controlId="c1" patterns={[]} canEdit onChanged={vi.fn()} cirks={cirks} {...props} /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe('DeliveryPatternsSection: CIRKS as a security solution', () => {
  test('offers CIRKS, with the reason, on an objective it can deliver', () => {
    show();
    const note = screen.getByRole('note', { name: 'CIRKS can deliver this objective' });
    expect(note).toHaveTextContent('GV.SC-04');
    expect(note).toHaveTextContent('The supplier register records every supplier relationship.');
    expect(screen.getByRole('button', { name: 'Use CIRKS for this objective' })).toBeInTheDocument();
  });

  test('choosing it is one click, and hands the new solutions back', async () => {
    const onChanged = vi.fn();
    show({ onChanged });
    fireEvent.click(screen.getByRole('button', { name: 'Use CIRKS for this objective' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(chooseCirksForControl).toHaveBeenCalledWith('c1');
    expect(onChanged.mock.calls[0][0][0].name).toBe('CIRKS');
  });

  test('says nothing once chosen, or where CIRKS cannot deliver it', () => {
    show({ cirks: { ...cirks, chosen: true } });
    expect(screen.queryByRole('note', { name: 'CIRKS can deliver this objective' })).toBeNull();
    show({ cirks: null });
    expect(screen.queryByRole('note', { name: 'CIRKS can deliver this objective' })).toBeNull();
  });

  test('a reader sees the suggestion but no button', () => {
    show({ canEdit: false });
    expect(screen.getByRole('note', { name: 'CIRKS can deliver this objective' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use CIRKS for this objective' })).toBeNull();
  });
});
