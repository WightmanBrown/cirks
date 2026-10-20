// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The brief: when you assign anything to anyone, you should be able to tell who
// they are — role and department — without cross-referencing another screen.
//
// The old system-create picker offered bare names under a "— default to me —"
// option, which is how a security consultant from Information Security ended up
// owning four of Health's clinical systems.

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonSelect } from './PersonSelect';
import { personLabel, roleLabel } from '../utils/roles';

const hopper = { id: 'u1', full_name: 'Grace Hopper', role: 'information_asset_owner', department_name: 'Health', department_id: 'd1' };
const sommer = { id: 'u2', full_name: 'Katie Sommer', role: 'security_consultant', department_name: 'Information Security', department_id: 'd2' };

describe('personLabel', () => {
  test('names the person, their role and their department', () => {
    expect(personLabel(hopper)).toBe('Grace Hopper — IAO, Health');
  });
  test('a person with no department still reads sensibly', () => {
    expect(personLabel({ full_name: 'Nobody', role: 'admin' })).toBe('Nobody — Admin');
  });
  test('an unrecognised role shows the raw value rather than a blank', () => {
    // An unknown role is a data problem; hiding it is how it survives.
    expect(roleLabel('wizard')).toBe('wizard');
  });
});

describe('PersonSelect', () => {
  test('every option carries role and department', () => {
    render(<PersonSelect users={[hopper, sommer]} value="" onChange={() => {}} />);
    expect(screen.getByRole('option', { name: 'Grace Hopper — IAO, Health' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Katie Sommer — Sec. Consultant, Information Security' })).toBeInTheDocument();
  });

  test('the suggestion is separated out, not buried in an alphabetical list', () => {
    render(<PersonSelect users={[hopper, sommer]} value="" onChange={() => {}} suggestedId="u1" />);
    const grouped = screen.getByRole('option', { name: 'Grace Hopper — IAO, Health' });
    expect(grouped.closest('optgroup')).toHaveAttribute('label', 'Suggested');
    expect(screen.getByRole('option', { name: /Katie Sommer/ }).closest('optgroup'))
      .toHaveAttribute('label', 'Everyone else');
  });

  test('the placeholder offers UNASSIGNED, never "default to me"', () => {
    render(<PersonSelect users={[hopper]} value="" onChange={() => {}} />);
    expect(screen.getByRole('option', { name: '— unassigned —' })).toBeInTheDocument();
    expect(screen.queryByText(/default to me/i)).not.toBeInTheDocument();
  });

  test('a warning renders when the department has no IAO', () => {
    render(
      <PersonSelect users={[sommer]} value="" onChange={() => {}}
                    warning="Health has no Information Asset Owner." />,
    );
    expect(screen.getByText(/no Information Asset Owner/i)).toBeInTheDocument();
  });

  test('choosing someone reports their id; clearing reports null', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonSelect users={[hopper, sommer]} value="" onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox'), 'u2');
    expect(onChange).toHaveBeenCalledWith('u2');
    await user.selectOptions(screen.getByRole('combobox'), '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
