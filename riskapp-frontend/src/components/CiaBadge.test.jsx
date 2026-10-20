// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CiaBadge } from './CiaBadge';

describe('CiaBadge', () => {
  test('renders the numeric value only', () => {
    render(<CiaBadge value={4} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  test('renders an em-dash for a null value', () => {
    render(<CiaBadge value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('renders 0 distinctly (not treated as unset)', () => {
    // value == null guards against null/undefined only; 0 is a real value.
    render(<CiaBadge value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
