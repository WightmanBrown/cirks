// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { MaturityChip } from './MaturityChip';
import { MATURITY_MEANINGS } from '../utils/ratingScale';

describe('MaturityChip', () => {
  it('shows the number and its word', () => {
    render(<MaturityChip value={3} />);
    expect(screen.getByText('3 Defined')).toBeInTheDocument();
  });

  it('explains the whole scale on mouseover, one sentence a level, with its own level marked', () => {
    render(<MaturityChip value={4} />);
    const title = screen.getByText('4 Managed').getAttribute('title');
    expect(title).toMatch(/^Control effectiveness, 1 to 5:/);
    for (const m of MATURITY_MEANINGS) expect(title).toContain(m);
    expect(title).toContain('▶ 4 Managed:');
    expect(title).not.toContain('▶ 3');
  });

  it('carries the explanation in the number variant too', () => {
    render(<MaturityChip value={2} variant="number" />);
    expect(screen.getByText('2').getAttribute('title')).toContain('▶ 2 Repeatable:');
  });

  it('says when a control is not rated, still explaining the scale', () => {
    render(<MaturityChip value={null} />);
    const chip = screen.getByText('Not rated');
    expect(chip.getAttribute('title')).toMatch(/^Not yet rated\./);
  });
});
