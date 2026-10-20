// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

// Control what useAuth returns per test.
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '../context/AuthContext';

function renderGuard(props) {
  return render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route element={<ProtectedRoute {...props} />}>
          <Route path="/secret" element={<div>SECRET</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="*" element={<div>ELSEWHERE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const auth = (over) => ({
  user: { role: 'ciso' },
  loading: false,
  capabilitiesReady: true,
  hasCapability: (k) => (over.caps || []).includes(k),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('ProtectedRoute capability gating', () => {
  test('renders the route when the capability is held', () => {
    useAuth.mockReturnValue(auth({ caps: ['assets.read'] }));
    renderGuard({ capability: 'assets.read' });
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  test('redirects away when the capability is missing', () => {
    useAuth.mockReturnValue(auth({ caps: [] }));
    renderGuard({ capability: 'assets.read' });
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
  });

  test('redirects to /login when unauthenticated', () => {
    useAuth.mockReturnValue(auth({ user: null, caps: [] }));
    renderGuard({ capability: 'assets.read' });
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });

  test('renders nothing while auth is loading', () => {
    useAuth.mockReturnValue(auth({ loading: true }));
    const { container } = renderGuard({ capability: 'assets.read' });
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  test('with no capability prop, an authenticated user passes', () => {
    useAuth.mockReturnValue(auth({ caps: [] }));
    renderGuard({});
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  test('waits (renders nothing) while capabilities are not yet loaded', () => {
    // The race: caps not loaded yet must NOT read as "denied".
    useAuth.mockReturnValue(auth({ caps: [], capabilitiesReady: false }));
    const { container } = renderGuard({ capability: 'assets.read' });
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
    expect(screen.queryByText('ELSEWHERE')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });

  test('with no capability prop, capabilitiesReady is irrelevant', () => {
    useAuth.mockReturnValue(auth({ caps: [], capabilitiesReady: false }));
    renderGuard({});
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });
});
