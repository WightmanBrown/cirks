// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The organisation's risk appetite (v171).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const data = {
  appetite: { action_threshold: 12, analyst_max: 11, owner_max: 19, reason: null, set_at: null, set_by_name: null },
  by_score: [{ score: 8, risks: 10, no_action_required: 2 }, { score: 12, risks: 6, no_action_required: 0 }, { score: 20, risks: 4, no_action_required: 0 }],
};
let caps;
const setRiskAppetite = vi.fn();
vi.mock('../api', () => ({ getRiskAppetite: vi.fn(async () => data), setRiskAppetite: (...a) => setRiskAppetite(...a) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { RiskAppetitePage } = await import('./RiskAppetitePage');
const show = () => render(<MemoryRouter><RiskAppetitePage /></MemoryRouter>);
const field = (label) => screen.getByLabelText(label, { exact: false });

beforeEach(() => { caps = ['risk_appetite.write']; setRiskAppetite.mockReset(); });

describe('Risk appetite', () => {
  test('says the current numbers in words, and that they were never changed', async () => {
    show();
    expect(await screen.findByText(/a risk scoring this or more must be treated \(10 risks of 20 today\)/)).toBeInTheDocument();
    expect(screen.getByText('The values CIRKS ships with; never changed.')).toBeInTheDocument();
  });

  test('says what a new threshold would mean, and warns of risks marked no action required', async () => {
    show();
    fireEvent.click(await screen.findByText('Change'));
    fireEvent.change(field('Action threshold'), { target: { value: '8' } });
    fireEvent.change(field('A risk analyst may accept'), { target: { value: '7' } });
    expect(screen.getByText(/20 risks of 20 would have to be treated/)).toBeInTheDocument();
    expect(screen.getByText(/2 risks marked .no action required. would be at or above it/)).toBeInTheDocument();
  });

  test('will not save numbers out of order', async () => {
    show();
    fireEvent.click(await screen.findByText('Change'));
    fireEvent.change(field('A risk analyst may accept'), { target: { value: '12' } });
    expect(screen.getByText('A risk analyst may accept only risks below the action threshold.')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeDisabled();
  });

  test('lists the risks named when the change is refused', async () => {
    setRiskAppetite.mockRejectedValue({ response: { data: { error: 'One risk is marked …', conflicts: [{ risk_id: 'r1', system_name: 'Payroll', threat_name: 'Ransomware', score: 8 }] } } });
    show();
    fireEvent.click(await screen.findByText('Change'));
    fireEvent.change(field('Why the risk appetite'), { target: { value: 'Board review' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Payroll — Ransomware')).toBeInTheDocument();
  });

  test('without the capability, says what is missing', () => {
    caps = [];
    show();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
  });
});
