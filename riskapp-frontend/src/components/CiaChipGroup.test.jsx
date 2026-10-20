// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CiaChipGroup } from './CiaChipGroup';

describe('CiaChipGroup', () => {
  test('renders C, I, A letters in that order', () => {
    render(<CiaChipGroup c={5} i={3} a={1} />);
    const letters = screen.getAllByText(/^[CIA]$/).map(el => el.textContent);
    expect(letters).toEqual(['C', 'I', 'A']);
  });

  test('renders each dimension value', () => {
    render(<CiaChipGroup c={5} i={3} a={1} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('shows an em-dash for an unrated dimension', () => {
    render(<CiaChipGroup c={4} i={null} a={2} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
