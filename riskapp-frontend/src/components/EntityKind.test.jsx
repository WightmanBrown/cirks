// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntityKind } from './EntityKind';

describe('EntityKind', () => {
  test('renders the "- <kind>" suffix', () => {
    render(<EntityKind kind="information asset" />);
    expect(screen.getByText('- information asset')).toBeInTheDocument();
  });
});
