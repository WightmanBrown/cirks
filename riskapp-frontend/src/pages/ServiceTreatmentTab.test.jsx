// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// Question 5 of the six — "are there risks with nothing planned?" — is the one
// a register answers by omission, so these tests pin that it is stated rather
// than left to be inferred from an empty table.

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ServiceTreatmentTab } from './BusinessServiceDetailPage';

const show = (service) =>
  render(
    <MemoryRouter>
      <ServiceTreatmentTab service={service} isExpert />
    </MemoryRouter>,
  );

describe('ServiceTreatmentTab', () => {
  test('states plainly when nothing is untreated, rather than showing an empty table', () => {
    show({ security_actions: [], untreated_risks: [] });
    expect(screen.getByText(/has an action against it/i)).toBeInTheDocument();
    expect(screen.getByText(/No security actions touch/i)).toBeInTheDocument();
  });

  test('names each untreated risk with its threat, system and score', () => {
    show({
      security_actions: [],
      untreated_risks: [
        { risk_id: 'r1', threat_name: 'Ransomware', system_id: 's1', system_name: 'Payroll', risk_score: 20 },
      ],
    });
    expect(screen.getByText('Ransomware')).toBeInTheDocument();
    expect(screen.getByText('Payroll')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  test('reports action progress as completed items over total', () => {
    show({
      untreated_risks: [],
      security_actions: [{
        id: 'a1', title: 'Patch the estate', status: 'in_progress', owner_name: 'A Person',
        target_date: '2026-01-31', overdue: true, items_total: 5, items_completed: 2,
      }],
    });
    expect(screen.getByText('2/5')).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
    expect(screen.getByText(/overdue/)).toBeInTheDocument();
  });

  test('counts only live actions as in flight — a completed one is not', () => {
    show({
      untreated_risks: [],
      security_actions: [
        { id: 'a1', title: 'Done',  status: 'completed',   items_total: 1, items_completed: 1 },
        { id: 'a2', title: 'Doing', status: 'in_progress', items_total: 2, items_completed: 0 },
      ],
    });
    const inFlight = screen.getByText(/action in flight/).previousSibling;
    expect(inFlight.textContent).toBe('1');
  });

  test('an action with no items says so instead of showing 0/0', () => {
    show({
      untreated_risks: [],
      security_actions: [{ id: 'a1', title: 'Empty', status: 'proposed', items_total: 0, items_completed: 0 }],
    });
    expect(screen.getByText('no items')).toBeInTheDocument();
  });
});
