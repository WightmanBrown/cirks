// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const getAgenda = vi.fn();
vi.mock('../api/index', () => ({
  getAgenda: (...a) => getAgenda(...a),
  generateAgenda: vi.fn(), addAgendaItem: vi.fn(), updateAgendaItem: vi.fn(),
  deleteAgendaItem: vi.fn(), reorderAgendaItems: vi.fn(), recordDecision: vi.fn(),
}));

import { AgendaSection } from './AgendaSection';

const item = (category, title, order_index) => ({
  id: `${category}-${order_index}`, category, title, order_index, source: 'auto', notes: null,
});

describe('AgendaSection', () => {
  // The backend generates every one of these (meetings/agendaController.js
  // CATEGORY_BASE). A category missing from the page's own lists is dropped
  // silently: threat_identification was, until 2026-10-26.
  it('shows an item from every category the backend generates', async () => {
    const generated = [
      'opening', 'previous_minutes', 'change_briefing', 'cycle_overview', 'isms_objectives',
      'threat_identification', 'new_risks', 'action_progress', 'sap_health', 'assurance',
      'risk_validation', 'action_adoption', 'exceptions', 'aob', 'close',
    ];
    getAgenda.mockResolvedValue({ items: generated.map((c, i) => item(c, `Item for ${c}`, i)) });
    render(<MemoryRouter><AgendaSection meetingId="m1" isSecretary={false} isClosed={false} minutesIssued={false} /></MemoryRouter>);
    for (const c of generated) {
      expect(await screen.findByText(`Item for ${c}`)).toBeInTheDocument();
    }
    expect(screen.getByText('Identified Exposures Awaiting Assessment')).toBeInTheDocument();
  });
});
