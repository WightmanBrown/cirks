// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateField } from './DateField';

function Harness({ initial = '', min, onValue }) {
  const [v, setV] = useState(initial);
  return (
    <form data-testid="f">
      <DateField aria-label="When" value={v} min={min} onChange={e => { setV(e.target.value); onValue?.(e.target.value); }} />
    </form>
  );
}

describe('DateField — typing a date as you write it', () => {
  test('31/03/2027 is read day first, reported as ISO, and shown back in words', () => {
    const seen = [];
    render(<Harness onValue={v => seen.push(v)} />);
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '31/03/2027' } });
    expect(seen.at(-1)).toBe('2027-03-31');
    expect(screen.getByText('Wed 31 Mar 2027')).toBeInTheDocument();
  });

  test('an existing value is shown for editing, day first', () => {
    render(<Harness initial="2028-01-01" />);
    expect(screen.getByLabelText('When')).toHaveValue('01/01/2028');
  });

  test('something unreadable says so in words, reports empty, and blocks the form', () => {
    const seen = [];
    render(<Harness onValue={v => seen.push(v)} />);
    const input = screen.getByLabelText('When');
    fireEvent.change(input, { target: { value: '31/02/2027' } });
    fireEvent.blur(input);
    expect(seen.at(-1)).toBe('');
    expect(screen.getByRole('alert')).toHaveTextContent('Type it as day/month/year, e.g. 31/03/2027');
    expect(input.validationMessage).toMatch(/Not a date CIRKS can read/);
    expect(screen.getByTestId('f').checkValidity()).toBe(false);
  });

  test('half-typed text is not wiped while it is still being typed', () => {
    render(<Harness />);
    const input = screen.getByLabelText('When');
    fireEvent.change(input, { target: { value: '31/0' } });
    expect(input).toHaveValue('31/0');
  });

  test('a minimum is explained, not just refused', () => {
    render(<Harness min="2027-01-01" />);
    const input = screen.getByLabelText('When');
    fireEvent.change(input, { target: { value: '01/12/2026' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toHaveTextContent('on or after Fri 1 Jan 2027');
  });
});
