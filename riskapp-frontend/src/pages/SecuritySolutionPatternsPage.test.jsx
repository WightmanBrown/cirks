// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { P5 } from '../components/patternFixtures';

vi.mock('../components/Shell', () => ({ Shell: ({ children }) => <div>{children}</div> }));
vi.mock('../components/BackButton', () => ({ BackButton: () => null }));
vi.mock('../api', () => ({ getSolutionPatterns: vi.fn(async () => [P5, { ...P5, code: 'P2', name: 'Managed process', solutions: 0 }]) }));

import { SecuritySolutionPatternsPage } from './SecuritySolutionPatternsPage';

test('each pattern: a tile, its diagram, what it needs, and the solutions built from it', async () => {
  render(<MemoryRouter><SecuritySolutionPatternsPage /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: /P5 · Central security service/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /P5 · 20 solutions/ })).toHaveAttribute('href', '#P5');
  expect(screen.getByRole('link', { name: '20 security solutions are built from it →' })).toHaveAttribute('href', '/security-solutions?pattern=P5');
  expect(screen.getByRole('link', { name: 'No security solution is built from it yet →' })).toBeInTheDocument();
  expect(screen.getAllByLabelText(/Central security service: Security system/)).toHaveLength(1);
});

test('each pattern says why it matters and gives an explanatory example, slot by slot', async () => {
  render(<MemoryRouter><SecuritySolutionPatternsPage /></MemoryRouter>);
  await screen.findByRole('heading', { name: /P5 · Central security service/ });
  // the tile and the section both lead with the reason
  expect(screen.getAllByText('Protects many systems consistently with one capability.').length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText(/For example: endpoint detection and response/)[0]).toBeInTheDocument();
  expect(screen.getAllByText('The agent on each laptop')[0]).toBeInTheDocument();
  expect(screen.getAllByText(/not a record in CIRKS/)[0]).toBeInTheDocument();
});
