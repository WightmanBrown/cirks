// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen } from '@testing-library/react';
import { PatternDiagram } from './PatternDiagram';
import { PatternFitChips } from './PatternFitChips';
import { P5, EDR_FIT } from './patternFixtures';

// A card's tag, whose type word is coloured in its own span.
const tag = (text) => (_, el) => /(^|[_ ])tag(_|$| )/.test(el?.className || '') && el.textContent === text;

describe('PatternDiagram', () => {
  test('the generic shape: every slot, its kind and the arrows’ words', () => {
    const { container } = render(<PatternDiagram pattern={P5} />);
    for (const s of P5.slots) expect(screen.getByText(s.label)).toBeInTheDocument();
    expect(screen.getByText('defines its configuration')).toBeInTheDocument();
    expect(screen.getByText('reports to')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-state="generic"]')).toHaveLength(4);
    expect(container.querySelectorAll('svg line')).toHaveLength(3);
  });

  test('a solution in the same shape says each slot’s state in words', () => {
    const { container } = render(<PatternDiagram pattern={P5} fit={EDR_FIT} label="CrowdStrike EDR" />);
    expect(screen.getByLabelText('CrowdStrike EDR')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="policy"]')).toHaveAttribute('data-state', 'missing');
    expect(screen.getByText('No policy')).toBeInTheDocument();
    expect(screen.getByText(tag('Information · missing'))).toBeInTheDocument();
    expect(screen.getByText('Crowdstrike Falcon Agent')).toBeInTheDocument();
    expect(screen.getByText('degraded on 1 system')).toBeInTheDocument();
    expect(screen.getByText(tag('Technology · in place'))).toBeInTheDocument();
  });

  test('a slot with several components names every one, counted, with the list as its tooltip', () => {
    const names = ['Core Switch 1', 'Core Switch 2', 'Core Switch 3', 'Core Switch 4'];
    const fit = { ...EDR_FIT, slots: EDR_FIT.slots.map(sl => (sl.key === 'policy'
      ? { ...sl, state: 'complete', parts: names.map((name, i) => ({ id: `cs${i}`, name, degraded_on: 0 })) } : sl)) };
    const { container } = render(<PatternDiagram pattern={P5} fit={fit} label="CrowdStrike EDR" />);
    const card = container.querySelector('[data-slot="policy"]');
    expect(card).toHaveTextContent(names.join(', '));            // never "A, B +2"
    expect(card).toHaveTextContent(/· 4/);
    expect(card.getAttribute('title')).toBe(`${P5.slots.find(s => s.key === 'policy').label}: ${names.join(', ')}`);
  });
});

describe('PatternFitChips', () => {
  test('one chip per slot, its mark and words', () => {
    render(<PatternFitChips fit={EDR_FIT} />);
    expect(screen.getByText('✓ team that runs it')).toBeInTheDocument();
    expect(screen.getByText('! part on the system degraded')).toBeInTheDocument();
    expect(screen.getByText('✗ policy')).toBeInTheDocument();
  });
  test('no pattern, or a supplier', () => {
    const { rerender } = render(<PatternFitChips fit={{ state: 'no_pattern', slots: [] }} />);
    expect(screen.getByText('No pattern stated')).toBeInTheDocument();
    rerender(<PatternFitChips fit={{ state: 'per_supplier', slots: [] }} />);
    expect(screen.getByText('Checked per supplier relationship')).toBeInTheDocument();
  });
});
