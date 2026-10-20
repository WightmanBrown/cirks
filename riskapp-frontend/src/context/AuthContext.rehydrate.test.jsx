// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Rehydration must refuse a HALF-CLEARED session.
//
// A `user` object with no token beside it made the app believe it was logged in.
// LoginPage sends an apparently-logged-in user to /dashboard, whose requests 401,
// whose interceptor hard-redirects to /login — which bounces straight back. The
// browser's navigation throttle was the only thing stopping it, leaving the app
// parked on a page whose every fetch had failed. Reproduced at 11 navigations in
// 10 seconds before the fix.

vi.mock('../api', () => ({
  getMyCapabilities: vi.fn(() => Promise.resolve({ capabilities: [], department_isolation: false })),
}));

function Probe() {
  const { user, capabilitiesReady } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <span data-testid="ready">{String(capabilitiesReady)}</span>
    </div>
  );
}

const USER = JSON.stringify({ id: 'u1', email: 'S.Topping@mig.local', role: 'risk_analyst' });

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('AuthContext rehydration', () => {
  it('restores a session when a token is present', async () => {
    localStorage.setItem('user', USER);
    localStorage.setItem('access_token', 'a-token');
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('S.Topping@mig.local');
  });

  it('accepts a refresh token alone — the access token is short-lived by design', async () => {
    localStorage.setItem('user', USER);
    localStorage.setItem('refresh_token', 'r-token');
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('S.Topping@mig.local');
  });

  // The regression.
  it('refuses a user object with NO tokens, and scrubs the leftovers', async () => {
    localStorage.setItem('user', USER);
    localStorage.setItem('capabilities', JSON.stringify(['risks.read']));
    localStorage.setItem('department_isolation', 'true');

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));

    expect(screen.getByTestId('user')).toHaveTextContent('none');
    // Leaving these behind would let the next reload rebuild the same wreckage.
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('capabilities')).toBeNull();
    expect(localStorage.getItem('department_isolation')).toBeNull();
  });

  it('is unbothered by empty storage', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });
});
