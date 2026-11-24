// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { vi } from 'vitest';
import { aboutRiskNodes } from './AboutRiskDiagram';

const RISK = {
  system_name: 'Harbour Booking', department_name: 'Ports', impact_c: 5, impact_i: 3, impact_a: 2,
  threat_name: 'Phishing', threat_category: 'deliberate', validation_status: 'validated',
  rationale: 'Phishing against the booking staff.', identified_by_name: 'Ada', owner_name: 'Grace',
  owner_is_siro_fallback: false, review_date: '2027-05-16', created_at: '2026-11-17',
  system_assets: Array.from({ length: 6 }, (_, k) => ({ id: `a${k}`, name: `Asset ${k}`, c: k, i: 1, a: 1 })),
};

describe('About this risk as a picture', () => {
  test('the highest-rated assets feed the system, the rest fold; the threat comes up into the risk', () => {
    const { nodes, links } = aboutRiskNodes(RISK, undefined, new Date('2026-12-01'));
    expect(nodes.filter((n) => n.id.startsWith('a-a')).map((n) => n.title)).toEqual(['Asset 5', 'Asset 4', 'Asset 3', 'Asset 2']);
    expect(nodes.find((n) => n.id === 'a-more').title).toBe('2 more');
    expect(nodes.find((n) => n.id === 'system').tag).toBe('System · C5 I3 A2');
    expect(links).toContainEqual({ from: 'threat', to: 'risk', into: 'bottom', label: 'against' });
    expect(links).toContainEqual({ from: 'risk', to: 'owner' });
  });

  test('an overdue review and a missing owner are said in words', () => {
    const { nodes, label } = aboutRiskNodes({ ...RISK, owner_name: null, review_date: '2026-01-01' }, undefined, new Date('2026-12-01'));
    expect(nodes.find((n) => n.id === 'review')).toMatchObject({ tone: 'bad', detail: 'overdue' });
    expect(nodes.find((n) => n.id === 'owner')).toMatchObject({ tone: 'bad', title: 'Nobody' });
    expect(label).toMatch(/Risk owner nobody; review 1 Jan 2026 \(overdue\)/);
  });

  test('each box goes to its record in About this risk', () => {
    const onGo = vi.fn();
    const { nodes } = aboutRiskNodes(RISK, onGo);
    for (const id of ['a-a5', 'system', 'threat', 'risk', 'owner', 'review']) nodes.find((n) => n.id === id).onClick();
    expect(onGo.mock.calls.map((c) => c[1])).toEqual(['risk-asset-a5', 'risk-system', 'risk-threat', 'risk-rationale', 'risk-owner', 'risk-review']);
    expect(onGo.mock.calls.every((c) => c[0] === 'about')).toBe(true);
  });
});
