// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// The list columns used to show the department's role-holder derived from role
// membership, ignoring the stored assignment — so Health's systems list said
// "Grace Hopper" while the database said "Katie Sommer", a security consultant
// in another department. Wrong data with no symptom.

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssignedPerson } from './AssignedPerson';

describe('AssignedPerson', () => {
  test('shows who is actually assigned', () => {
    render(<AssignedPerson name="Grace Hopper" personDepartment="Health" ownerDepartment="Health" />);
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  test('nobody assigned reads as a dash, not as the department role-holder', () => {
    render(<AssignedPerson name={null} personDepartment={null} ownerDepartment="Health" />);
    expect(screen.getByTitle('Nobody is assigned')).toHaveTextContent('—');
  });

  test('marks an assignee from another department', () => {
    render(<AssignedPerson name="Katie Sommer" personDepartment="Information Security" ownerDepartment="Health" />);
    expect(screen.getByTitle('Katie Sommer is in Information Security, not Health'))
      .toBeInTheDocument();
  });

  test('the reason is available to screen readers, not just as a tooltip', () => {
    render(<AssignedPerson name="Katie Sommer" personDepartment="Information Security" ownerDepartment="Health" />);
    expect(screen.getByText(/in Information Security, not Health/)).toBeInTheDocument();
  });

  test('does NOT mark someone in the same department who is not the IAO', () => {
    // The rule deliberately is not "is this the department's IAO/IAM". That
    // flagged 39 of 39 systems and 94 of 94 services, because managed_by_user_id
    // has historically held the IAO rather than the IAM. A marker on every row
    // is decoration.
    render(<AssignedPerson name="Vint Cerf" personDepartment="Communications" ownerDepartment="Communications" />);
    expect(screen.queryByTitle(/not/)).not.toBeInTheDocument();
  });

  test('missing department data does not produce a false flag', () => {
    render(<AssignedPerson name="Someone" personDepartment={null} ownerDepartment="Health" />);
    expect(screen.getByText('Someone')).toBeInTheDocument();
    expect(screen.queryByTitle(/not Health/)).not.toBeInTheDocument();
  });
});
