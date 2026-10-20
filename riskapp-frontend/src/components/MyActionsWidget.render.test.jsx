// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the API surface the widget touches on mount. vi.mock is hoisted, so the
// mock object must be created via vi.hoisted to be available inside the factory.
const api = vi.hoisted(() => ({
  getPendingRisks:        vi.fn().mockResolvedValue({ count: 0 }),
  getActionStats:         vi.fn().mockResolvedValue({ open_items: 0 }),
  getSiroCyclePending:    vi.fn().mockResolvedValue([]),
  getSiroActionPending:   vi.fn().mockResolvedValue([]),
  getMyInProgressActions: vi.fn().mockResolvedValue(null),
  getAcceptanceQueue:     vi.fn().mockResolvedValue({ count: 0 }),
  getMeetings:            vi.fn().mockResolvedValue({ meetings: [] }),
  getReturnedToMe:        vi.fn().mockResolvedValue({ count: 0 }),
}));
vi.mock('../api', () => api);

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '../context/AuthContext';
import { MyActionsWidget } from './MyActionsWidget';

function mockAuth({ role = 'risk_analyst' } = {}) {
  useAuth.mockReturnValue({ user: { role, id: 'u1' }, hasCapability: () => false });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getActionStats.mockResolvedValue({ open_items: 0 });
  api.getMyInProgressActions.mockResolvedValue(null);
});

describe('MyActionsWidget (rendered)', () => {
  test('the widget is titled "My Tasks"', async () => {
    mockAuth();
    render(<MyActionsWidget />);
    expect(await screen.findByText('My Tasks')).toBeInTheDocument();
  });

  test('in-progress actions are a summary row that navigates to the list page (not an unfold)', async () => {
    api.getMyInProgressActions.mockResolvedValue({ count: 2, needs_update_count: 0 });
    mockAuth();
    render(<MyActionsWidget />);

    const row = await screen.findByText('My in-progress actions');
    row.click();
    expect(navigate).toHaveBeenCalledWith('/actions?mine=1');
  });

  test('open remediation items are a navigating count row to /remediation', async () => {
    api.getActionStats.mockResolvedValue({ open_items: 3 });
    mockAuth();
    render(<MyActionsWidget />);

    const row = await screen.findByText('Remediation items still open');
    row.click();
    expect(navigate).toHaveBeenCalledWith('/remediation');
  });
});
