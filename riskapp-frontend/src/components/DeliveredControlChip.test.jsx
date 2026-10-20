// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeliveredControlChip, { isDeliveredOnce } from './DeliveredControlChip';

const renderChip = (control) => render(
  <MemoryRouter><DeliveredControlChip control={{ id: 'c1', ...control }} /></MemoryRouter>);

describe('DeliveredControlChip', () => {
  it('shows an organisation-wide control that reaches the system with its own status', () => {
    renderChip({ delivery: 'organisation', delivered_via: 'organisation', system_status: 'degraded' });
    const link = screen.getByRole('link', { name: 'organisation-wide · degraded' });
    expect(link).toHaveAttribute('href', '/controls/c1');
    expect(link.getAttribute('title')).toMatch(/own status \(degraded\)/);
  });

  it('shows a group control whose group is not on the system as not here', () => {
    renderChip({ delivery: 'group', delivered_via: null, system_status: null });
    const link = screen.getByRole('link', { name: 'for a group · not here' });
    expect(link.getAttribute('title')).toMatch(/none of its people groups/);
  });

  it('renders nothing for a control deployed on each system, or not stated', () => {
    const { container } = renderChip({ delivery: 'system', delivered_via: 'deployed' });
    expect(container).toBeEmptyDOMElement();
    expect(isDeliveredOnce({ delivery: null })).toBe(false);
    expect(isDeliveredOnce({ delivery: 'group' })).toBe(true);
  });
});
