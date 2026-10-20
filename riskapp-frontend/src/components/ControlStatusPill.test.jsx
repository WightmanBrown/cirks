// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// An objective's status is derived on the server (v124) into four states. The
// words live in one place (utils/objectiveStatus.js) so every badge agrees.

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ControlStatusPill } from './ControlStatusPill';
import { StatusPill } from './ControlBadges';
import { OBJECTIVE_STATUSES } from '../utils/objectiveStatus';

describe('objective status words', () => {
  test('there are exactly the four derived states', () => {
    expect(OBJECTIVE_STATUSES.map(s => s.value)).toEqual(['adopted', 'not_assessed', 'not_decided', 'not_applicable']);
  });

  test.each(OBJECTIVE_STATUSES)('both pills say "$label" for $value, with its meaning as a hint', ({ value, label, hint }) => {
    const { unmount } = render(<><ControlStatusPill status={value} /><StatusPill status={value} /></>);
    const shown = screen.getAllByText(label);
    expect(shown).toHaveLength(2);
    shown.forEach(el => expect(el).toHaveAttribute('title', hint));
    unmount();
  });

  test.each(['active', 'under_review', 'ineffective', 'planned'])('the retired stored value %s is not given a label', (old) => {
    const { container } = render(<ControlStatusPill status={old} />);
    expect(container).toBeEmptyDOMElement();
  });
});
