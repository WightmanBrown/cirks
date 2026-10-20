// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { groupFindings } from './soaFindings';

const mirror = (sys, risks) => ({ finding_type: 'deployed_where_not_applicable', control_id: 'c1', ref: 'ID.RA-09',
  title: 'Authenticity', system_id: sys, system_name: `S${sys}`, system_status: 'operational', why: 'not_applicable', risks_affected: risks });

describe('groupFindings', () => {
  it('groups a mirror finding by control, keeping each system', () => {
    const [g] = groupFindings([mirror('1', 3), mirror('2', 0)]);
    expect(g.type).toBe('deployed_where_not_applicable');
    expect(g.controls).toHaveLength(1);
    expect(g.controls[0].systems.map(s => s.name)).toEqual(['S1', 'S2']);
    expect(g.controls[0].risks_affected).toBe(3);
    expect(g.count).toBe(2);
  });

  it('orders types as the panel reads them and leaves out empty ones', () => {
    const out = groupFindings([
      { finding_type: 'not_applicable_without_reason', control_id: 'c2', title: 'x' },
      mirror('1', 0),
    ]);
    expect(out.map(g => g.type)).toEqual(['deployed_where_not_applicable', 'not_applicable_without_reason']);
    expect(out[1].count).toBe(1);
  });
});
