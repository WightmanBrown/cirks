// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// Is the record current and trusted? — the CISO's C8 (docs/reporting-ciso.md).
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const kind = (k, label, page, over = {}) => ({
  kind: k, label, page, total: 2,
  written: { complete: 1, partial: 1, missing: 0, gaps_count: 1,
    checks: [{ key: 'description', words: 'a description', have: 1 }, { key: 'owner', words: 'an owner', have: 2 }],
    gaps: [{ id: `${k}1`, name: `${label} one`, lacks: ['a description'] }] },
  current: { months: 12, changed: 1, untouched: 1,
    stalest: [{ id: `${k}1`, name: `${label} one`, last_change: '2026-09-30T00:00:00Z', created_at: '2026-09-30T00:00:00Z' },
      { id: `${k}2`, name: `${label} two`, last_change: '2026-10-30T00:00:00Z', created_at: '2026-09-30T00:00:00Z' }] },
  ...over,
});
const report = {
  generated_at: '2026-11-05T10:00:00Z',
  headline: { records: 4, written_complete: 2, changed: 2, untouched: 2, readers: 3, people_active: 30 },
  kinds: [kind('system', 'Systems', '/systems/'), kind('component', 'Components', null)],
  used: { days: 90, searches: 4, enrichments: 1, by_machine: 0,
    readers: [{ role: 'information_asset_owner', people: 2, reads: 40 }, { role: 'ciso', people: 1, reads: 400 }] },
};
let caps;
vi.mock('../api', () => ({ getRecordCurrent: vi.fn(async () => report) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasCapability: (c) => caps.includes(c) }) }));
vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));

const { RecordCurrentPage } = await import('./RecordCurrentPage');
const page = () => render(<MemoryRouter><RecordCurrentPage /></MemoryRouter>);

beforeEach(() => { caps = ['reports.read']; });

describe('Is the record current and trusted?', () => {
  test('needs reports.read', () => {
    caps = [];
    page();
    expect(screen.getByText(/Insufficient permissions/i)).toBeInTheDocument();
  });

  test('says what is written down and lists what is not', async () => {
    page();
    expect(await screen.findByText('records fully written down')).toBeInTheDocument();
    expect(screen.getAllByText('1 of 2 have a description')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Show the 1 not complete' })[0]);
    expect(screen.getByText(/missing a description/)).toBeInTheDocument();
  });

  test('a system opens its page; a component, which has none, is named', async () => {
    page();
    const links = await screen.findAllByRole('link', { name: 'Systems one' });
    expect(links[0]).toHaveAttribute('href', '/systems/system1');
    expect(screen.queryByRole('link', { name: 'Components one' })).not.toBeInTheDocument();
  });

  test('who reads CIRKS, by role', async () => {
    page();
    expect(await screen.findByText(/answered 4 searches and 1 SOC lookup/)).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });
});
