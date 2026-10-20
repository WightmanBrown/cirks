// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import WithdrawControlDialog from './WithdrawControlDialog';
import { previewControlWithdrawal, withdrawControlFromUse } from '../api';

vi.mock('../api', () => ({
  previewControlWithdrawal: vi.fn(),
  withdrawControlFromUse: vi.fn(),
}));

const preview = {
  removed: {
    systems: [{ id: 's1', name: 'Power Generation', status: 'operational' },
              { id: 's2', name: 'Tax Records System', status: 'degraded' }],
    threats: [{ id: 't1', name: 'Supply chain compromise' }],
    judged_residuals: 10, open_items: 1,
  },
  risks_moved: [{ risk_id: 'r1', system: 'Power Generation', threat: 'Supply chain compromise',
                  before: '2/2/1', after: '4/4/3', before_score: 10, after_score: 20 }],
};

const show = (props = {}) => render(
  <WithdrawControlDialog controlId="c1" title="Hardware integrity checks"
                         onClose={() => {}} onDone={() => {}} {...props} />);

beforeEach(() => {
  previewControlWithdrawal.mockReset().mockResolvedValue(preview);
  withdrawControlFromUse.mockReset().mockResolvedValue({});
});

describe('WithdrawControlDialog', () => {
  it('says what would go, and which risks rise, before asking anything', async () => {
    show();
    expect(await screen.findByText(/Power Generation \(operational\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 risk rises when it goes/)).toBeInTheDocument();
    expect(screen.getByText('4/4/3 (20)')).toBeInTheDocument();
    // The residuals are the half people forget, so they are named and explained.
    expect(screen.getByText(/judged residuals/)).toBeInTheDocument();
    expect(screen.getByText(/come back if it is ever/)).toBeInTheDocument();
  });

  it('will not withdraw without a reason', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Withdraw from use' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Say why it is being withdrawn/);
    expect(withdrawControlFromUse).not.toHaveBeenCalled();
  });

  it('sends the reason, and reports it back', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    show({ onDone });
    await user.type(await screen.findByRole('textbox'), 'Attached in error');
    await user.click(screen.getByRole('button', { name: 'Withdraw from use' }));
    await waitFor(() => expect(withdrawControlFromUse).toHaveBeenCalledWith('c1', 'Attached in error'));
    expect(onDone).toHaveBeenCalled();
  });

  it('keeps what was typed when the save fails', async () => {
    const user = userEvent.setup();
    withdrawControlFromUse.mockRejectedValue({ response: { data: { error: 'Nope.' } } });
    show();
    await user.type(await screen.findByRole('textbox'), 'Attached in error');
    await user.click(screen.getByRole('button', { name: 'Withdraw from use' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope.');
    expect(screen.getByRole('textbox')).toHaveValue('Attached in error');
  });

  it('shows the refusal for a control delivered organisation-wide', async () => {
    previewControlWithdrawal.mockRejectedValue({ response: { data: {
      error: 'This control is delivered organisation-wide … Statement of Applicability decision' } } });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Statement of Applicability decision/);
  });
});
