// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The code step of sign-in (v166). Until v166 no account could reach it; a
// wrong code used to clear the step silently, leaving the person guessing.
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const login = vi.fn();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, login, loading: false }) }));

const { LoginPage } = await import('./LoginPage');
const refuse = (error) => login.mockRejectedValueOnce({ response: { data: { error, totp_required: true } } });

describe('signing in with a second factor', () => {
  test('asks for the code, sends it, and says when it is wrong', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    refuse('Enter the code from your authenticator app.');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ciso@org.local' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const code = await screen.findByPlaceholderText('000000');
    expect(screen.queryByText('Enter the code from your authenticator app.')).toBeNull();

    refuse('That code is not right. Use the newest code from your authenticator app.');
    fireEvent.change(code, { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(await screen.findByText(/That code is not right/)).toBeInTheDocument();
    expect(login).toHaveBeenLastCalledWith({ email: 'ciso@org.local', password: 'a-password-123', totp_code: '111111' });
  });
});
