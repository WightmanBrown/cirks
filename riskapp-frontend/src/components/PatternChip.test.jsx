// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { PatternChip } from './PatternChip';

describe('PatternChip', () => {
  test.each([
    ['template', 'Profile'],
    ['solution', 'Security solution'],
    ['pattern', 'Standard build'],
  ])('%s shows its label', (kind, label) => {
    render(<PatternChip kind={kind} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  test('icon only: no visible label, but named in full for assistive tech', () => {
    render(<PatternChip kind="pattern" iconOnly />);
    expect(screen.queryByText('Standard build')).toBeNull();
    expect(screen.getByRole('img', { name: 'Standard build' })).toBeInTheDocument();
  });

  test('an unknown kind renders nothing rather than a blank chip', () => {
    const { container } = render(<PatternChip kind="nonsense" />);
    expect(container).toBeEmptyDOMElement();
  });
});
