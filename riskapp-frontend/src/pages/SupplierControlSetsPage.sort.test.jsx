// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { describe, it, expect } from 'vitest';
import { sortRows } from '../hooks/useTableSort';
import { OBJECTIVE_STATUS } from '../utils/objectiveStatus';
import { SET_OBJECTIVE_ACCESSORS } from './SupplierControlSetsPage';

describe('supplier control sets sort', () => {
  it('sorts the objective by its reference, else its title', () => {
    const rows = [{ ref: null, title: 'Backups' }, { ref: 'GV.SC-02', title: 'Zeta' }, { ref: 'GV.SC-01', title: 'Yankee' }];
    expect(sortRows(rows, SET_OBJECTIVE_ACCESSORS.objective).map((r) => r.title)).toEqual(['Backups', 'Yankee', 'Zeta']);
  });

  it('sorts the SoA status by the words the pill shows', () => {
    const [k1, k2] = Object.keys(OBJECTIVE_STATUS);
    expect(SET_OBJECTIVE_ACCESSORS.soa({ objective_status: k1 })).toBe(OBJECTIVE_STATUS[k1].label);
    expect(SET_OBJECTIVE_ACCESSORS.soa({ objective_status: k2 })).toBe(OBJECTIVE_STATUS[k2].label);
  });
});
