// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// Two-factor sign-in, set up by the person themselves (H-05, v166).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let status;
const api = {
  getTotpStatus: vi.fn(async () => status),
  setupTotp: vi.fn(async () => ({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauth_url: 'otpauth://totp/x', qr: 'data:image/png;base64,AAAA' })),
  confirmTotp: vi.fn(async () => { status = { enabled: true, enabled_at: '2026-11-02T10:00:00Z', pending: false }; return { enabled: true }; }),
  disableTotp: vi.fn(async () => { status = { enabled: false, enabled_at: null, pending: false }; return { enabled: false }; }),
};
vi.mock('../api', () => api);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { full_name: 'Casey Ciso', email: 'ciso@org.local' } }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { MyAccountPage } = await import('./MyAccountPage');
const show = () => render(<MemoryRouter><MyAccountPage /></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); status = { enabled: false, enabled_at: null, pending: false }; });

describe('My account: two-factor sign-in', () => {
  test('set up: scan, then switch on only with a code', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up two-factor sign-in' }));
    expect(await screen.findByAltText(/QR code/)).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    const on = screen.getByRole('button', { name: 'Switch on' });
    expect(on).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Code from your authenticator app'), { target: { value: '123456' } });
    fireEvent.click(on);
    await waitFor(() => expect(api.confirmTotp).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText(/Two-factor sign-in is on\./)).toBeInTheDocument();
    expect(screen.queryByAltText(/QR code/)).toBeNull();      // the key is not shown again
  });

  test('a wrong code says so and stays on the scan step', async () => {
    api.confirmTotp.mockRejectedValueOnce({ response: { data: { error: 'That code is not right.' } } });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up two-factor sign-in' }));
    fireEvent.change(await screen.findByLabelText('Code from your authenticator app'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Switch on' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
    expect(screen.getByAltText(/QR code/)).toBeInTheDocument();
  });

  test('turning it off needs the password and a code', async () => {
    status = { enabled: true, enabled_at: '2026-11-02T10:00:00Z', pending: false };
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off…' }));
    const off = screen.getByRole('button', { name: 'Turn off' });
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'my-password-1' } });
    expect(off).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Code from your authenticator app'), { target: { value: '654321' } });
    fireEvent.click(off);
    await waitFor(() => expect(api.disableTotp).toHaveBeenCalledWith('my-password-1', '654321'));
    expect(await screen.findByText('Two-factor sign-in is off.')).toBeInTheDocument();
  });
});
