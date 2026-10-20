// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { DeliveryChip } from './DeliveryChip';

describe('DeliveryChip', () => {
  test.each([
    ['complete', 'delivered'], ['degraded', 'degraded'], ['incomplete', 'incomplete'], ['no_pattern_in_place', 'no solution'],
  ])('%s reads "%s"', (delivery, label) => {
    render(<DeliveryChip delivery={delivery} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
  test('nothing for an objective without patterns', () => {
    const { container } = render(<DeliveryChip delivery={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
