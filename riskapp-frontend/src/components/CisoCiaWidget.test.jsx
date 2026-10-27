// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

const getImpactTables = vi.fn();
vi.mock('../api', () => ({ getImpactTables: (...a) => getImpactTables(...a) }));

import { CisoCiaWidget } from './CisoCiaWidget';

const table = (scope, published) => ({ id: Math.random(), scope, published_at: published ? '2026-01-01' : null });
const show = () => render(<MemoryRouter><CisoCiaWidget /></MemoryRouter>);

describe('CisoCiaWidget', () => {
  it('counts organisation tables not yet published, ignoring department ones', async () => {
    getImpactTables.mockResolvedValue([table('organisation', false), table('organisation', true), table('department', false)]);
    show();
    expect(await screen.findByText('organisation impact table not yet published')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('says when every organisation table is published', async () => {
    getImpactTables.mockResolvedValue([table('organisation', true), table('organisation', true)]);
    show();
    expect(await screen.findByText('All 2 organisation impact tables are published.')).toBeInTheDocument();
  });

  it('says when there are none', async () => {
    getImpactTables.mockResolvedValue([table('department', true)]);
    show();
    expect(await screen.findByText('No organisation impact tables yet.')).toBeInTheDocument();
  });
});
