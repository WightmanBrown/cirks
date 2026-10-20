// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { componentRecordReasons } from './componentRecord';

describe('componentRecordReasons', () => {
  test('a v138-shaped finding reads as before', () => {
    expect(componentRecordReasons({ missing_count: 1, missing_component_names: ['OSSEC agent'] }))
      .toEqual(['Not recorded, though its controls need it: OSSEC agent']);
  });

  test('memberships come first, then parts, objectives and choices', () => {
    expect(componentRecordReasons({
      missing_membership_names: ['Connectivity'], missing_count: 0, missing_component_names: [],
      unrecorded_objective_names: ['DE.CM-01 Networks are monitored'], needs_solution_count: 2, conflict_count: 1,
    })).toEqual([
      'Nothing recorded for Connectivity',
      'Implied by the security architecture, not recorded: DE.CM-01 Networks are monitored',
      '2 control objectives a threat here calls for have no security solution chosen',
      '1 control objective is delivered by two required security solutions — choose one',
    ]);
  });

  test('objectives needing a decision are named where the API names them', () => {
    expect(componentRecordReasons({
      needs_solution_count: 1, needs_solution_objectives: [{ id: 'c1', title: 'Incidents are contained', reference_code: null }],
      conflict_count: 1, conflict_objectives: [{ id: 'c2', title: 'Networks are monitored', reference_code: 'DE.CM-01' }],
    })).toEqual([
      'No security solution is chosen for a control objective a threat here calls for: Incidents are contained',
      'Two required security solutions deliver the same control objective, choose one: DE.CM-01 Networks are monitored',
    ]);
  });

  test('past three unrecorded objectives, the count stands in for the titles', () => {
    expect(componentRecordReasons({ unrecorded_objective_names: ['a', 'b', 'c', 'd'] }))
      .toEqual(['4 control objectives implied by the security architecture are not recorded on the system (see the Control objectives tab)']);
  });

  test('no finding, no reasons', () => {
    expect(componentRecordReasons(undefined)).toEqual([]);
  });
});
