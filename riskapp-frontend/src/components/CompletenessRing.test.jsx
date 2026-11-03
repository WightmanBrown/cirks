import { render, screen } from '@testing-library/react';
import { CompletenessRing, completenessSummary } from './CompletenessRing';

describe('CompletenessRing', () => {
  it('says the share complete and every count, so colour is never alone', () => {
    render(<CompletenessRing complete={6} partial={2} missing={2} of="control objectives" />);
    const ring = screen.getByRole('img');
    expect(ring).toHaveAccessibleName('60% complete of 10 control objectives: 6 complete, 2 partial, 2 missing');
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('2 missing')).toBeInTheDocument();
  });

  it('draws one segment per state present, in the order complete, partial, missing', () => {
    const { container } = render(<CompletenessRing complete={1} missing={3} />);
    const states = [...container.querySelectorAll('[data-state]')].map((n) => n.getAttribute('data-state'));
    expect(states).toEqual(['complete', 'missing']);
  });

  it('draws a whole circle when only one state is present', () => {
    const { container } = render(<CompletenessRing missing={4} />);
    expect(container.querySelectorAll('circle[data-state="missing"]')).toHaveLength(1);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows nothing to measure when every count is zero', () => {
    render(<CompletenessRing of="control objectives" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('Nothing to measure (no control objectives)');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('uses the caller\'s words for the states', () => {
    expect(completenessSummary({ complete: 3, partial: 1, missing: 0 }, { complete: 'met', partial: 'expired' }))
      .toBe('3 met, 1 expired');
  });

  it('can leave the counts to the caller', () => {
    render(<CompletenessRing complete={1} partial={1} showCounts={false} />);
    expect(screen.queryByText('1 complete')).not.toBeInTheDocument();
  });
});

describe('CompletenessRing rounding', () => {
  it('never shows 100% while anything is not complete', () => {
    render(<CompletenessRing complete={199} missing={1} />);
    expect(screen.getByText('99%')).toBeInTheDocument();
  });
});
