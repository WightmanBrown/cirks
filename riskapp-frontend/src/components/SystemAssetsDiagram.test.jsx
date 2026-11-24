// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { vi } from 'vitest';
import { systemAssetsNodes, departmentsOf, settingDims, SETS_STRIPE } from './SystemAssetsDiagram';

const asset = (id, dept, c, i, a) => ({ id, name: `Asset ${id}`, department_id: dept, department_name: `Dept ${dept}`,
  confidentiality: c, integrity: i, availability: a });
const SYSTEM = { name: 'Mail', impact_c: 5, impact_i: 4, impact_a: 3,
  information_assets: [asset('a1', 'd1', 5, 1, 1), asset('a2', 'd1', 1, 1, 1), asset('a3', 'd2', 2, 4, 3)] };
const WORST = { threat_name: 'Phishing', score: { now: 20, driving: ['c'], probability: { c: 4, i: 1, a: 1 }, impact: { c: 5, i: 4, a: 3 } } };

describe('a system\'s information assets as a picture', () => {
  test('departments, most assets first, each with its own colour its assets wear', () => {
    const depts = departmentsOf(SYSTEM);
    expect(depts.map((d) => [d.name, d.assets.length])).toEqual([['Dept d1', 2], ['Dept d2', 1]]);
    expect(depts[0].stripe).not.toBe(depts[1].stripe);
    const { nodes } = systemAssetsNodes(SYSTEM);
    expect(nodes.find((n) => n.id === 'a-a1').stripe).toBe(depts[0].stripe);
  });

  test('the assets at the system\'s impact set it, and run heavy into it', () => {
    expect(settingDims(SYSTEM.information_assets[0], SYSTEM)).toEqual(['c']);
    expect(settingDims(SYSTEM.information_assets[2], SYSTEM)).toEqual(['i', 'a']);
    const { nodes, links } = systemAssetsNodes(SYSTEM);
    expect(links).toContainEqual({ from: 'a-a1', to: 'system', strong: true });
    expect(links).toContainEqual({ from: 'a-a2', to: 'system', strong: false });
    expect(nodes.find((n) => n.id === 'system')).toMatchObject({ tag: 'Impact · C5 I4 A3', detail: 'set by 2 assets', stripe: SETS_STRIPE });
  });

  test('the impact drops into the grid; the worst risk\'s likelihood runs in from the side', () => {
    const { links, nodes } = systemAssetsNodes(SYSTEM, WORST);
    expect(links).toContainEqual({ from: 'system', to: 'grid', into: 'top', label: 'impact 5' });
    expect(links).toContainEqual({ from: 'likelihood', to: 'grid', label: 'likelihood 4' });
    expect(nodes.find((n) => n.id === 'likelihood').detail).toBe('worst risk: Phishing');
  });

  test('a department or the impact filters the list; an asset opens; the grid opens the worst risk', () => {
    const onFilter = vi.fn(); const onAsset = vi.fn(); const onRisk = vi.fn();
    const { nodes } = systemAssetsNodes(SYSTEM, WORST, { onFilter, onAsset, onRisk, active: 'dept:d2' });
    nodes.find((n) => n.id === 'dept-d1').onClick();
    nodes.find((n) => n.id === 'system').onClick();
    nodes.find((n) => n.id === 'a-a3').onClick();
    nodes.find((n) => n.id === 'grid').onClick();
    expect(onFilter.mock.calls).toEqual([['dept:d1'], ['sets']]);
    expect(onAsset).toHaveBeenCalledWith('a3');
    expect(onRisk).toHaveBeenCalledWith('score');
    expect(nodes.find((n) => n.id === 'dept-d2').selected).toBe(true);
  });

  test('a system holding nothing says its impact is not rated', () => {
    const { nodes } = systemAssetsNodes({ ...SYSTEM, information_assets: [] });
    expect(nodes.find((n) => n.id === 'system')).toMatchObject({ tone: 'bad', title: 'Not rated' });
  });
});
