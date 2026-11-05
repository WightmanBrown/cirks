// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RiskGrid } from './RiskGrid';

describe('RiskGrid — the one probability-impact grid', () => {
  test('puts impact up the side and likelihood along the bottom, with each square\'s count', () => {
    render(<RiskGrid countAt={(i, p) => (i === 5 && p === 1 ? 34 : 0)} />);
    const cell = screen.getByTitle('Impact 5, likelihood 1 (score 5): 34 risks');
    expect(cell).toHaveTextContent('34');
    expect(screen.getByText('Impact')).toBeInTheDocument();
    expect(screen.getByText(/Likelihood/)).toBeInTheDocument();
  });

  test('colours every square by its band, fading the empty ones', () => {
    const { container } = render(<RiskGrid countAt={() => 0} />);
    const cells = container.querySelectorAll('[role="cell"]');
    expect(cells).toHaveLength(25);
    const top = screen.getByTitle('Impact 5, likelihood 5 (score 25): 0 risks');
    expect(top.className).toMatch(/band_catastrophic/);
    expect(top.className).toMatch(/empty/);
  });

  test('a square can filter: it reports likelihood then impact', () => {
    const onCellClick = vi.fn();
    render(<RiskGrid countAt={() => 1} onCellClick={onCellClick} selected={{ likelihood: 3, impact: 4 }} />);
    const cell = screen.getByTitle('Impact 4, likelihood 3 (score 12): 1 risk');
    expect(cell).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTitle('Impact 2, likelihood 5 (score 10): 1 risk'));
    expect(onCellClick).toHaveBeenCalledWith(5, 2);
  });

  test('one risk\'s position shows its score and nothing else', () => {
    render(<RiskGrid marked={{ likelihood: 4, impact: 5 }} />);
    expect(screen.getByTitle('Impact 5 × likelihood 4 = 20')).toHaveTextContent('20');
  });

  test('the whole grid can be one link', () => {
    const onClick = vi.fn();
    render(<RiskGrid countAt={() => 0} onClick={onClick} ariaLabel="Open the register" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the register' }));
    expect(onClick).toHaveBeenCalled();
  });
});
