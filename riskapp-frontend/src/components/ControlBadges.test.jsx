// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { ApplicabilityBadge } from './ControlBadges';

// Applicability is the Statement of Applicability's answer (v185), never a typed
// Baseline/Specific flag.
describe('ApplicabilityBadge', () => {
  it('says the whole organisation, and why', () => {
    render(<ApplicabilityBadge applicability="organisation" appliesIn={[]} />);
    expect(screen.getByText('Whole organisation')).toBeInTheDocument();
    expect(screen.getByText(/applies to every system/)).toBeInTheDocument();
  });

  it('names a single scope, and counts several', () => {
    const { rerender } = render(<ApplicabilityBadge applicability="scopes" appliesIn={['Cardholder data']} />);
    expect(screen.getAllByText(/Cardholder data/).length).toBeGreaterThan(0);
    rerender(<ApplicabilityBadge applicability="scopes" appliesIn={['A', 'B']} />);
    expect(screen.getByText('2 scopes')).toBeInTheDocument();
    expect(screen.getByText(/named scopes, so it applies to the systems in them: A, B\./)).toBeInTheDocument();
  });

  it('reads not decided when the SoA has said nothing, or nothing is known', () => {
    render(<ApplicabilityBadge applicability={undefined} />);
    expect(screen.getByText('Not decided')).toBeInTheDocument();
  });
});
