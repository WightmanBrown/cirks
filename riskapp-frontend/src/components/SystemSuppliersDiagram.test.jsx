// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { vi } from 'vitest';
import { systemSuppliersNodes, suppliersOf, contractState } from './SystemSuppliersDiagram';

const rel = (id, sup, extra = {}) => ({ id, supplier_id: sup, supplier_name: `Supplier ${sup}`, relationship_type: 'product',
  department_name: 'Security', status: 'active', ...extra });
const ROWS = [rel('k1', 's1', { component_name: 'Falcon agent' }), rel('k2', 's1', { contract_ref: 'X-1', contract_end: '2026-12-20' }),
  rel('k3', 's2', { contract_ref: 'Y-2', contract_end: '2026-01-01' })];
const SYSTEM = { name: 'Mail', impact_c: 5, impact_i: 4, impact_a: 3, information_assets: [
  { id: 'a1', name: 'Timetables', confidentiality: 1, integrity: 2, availability: 2, department_name: 'Ports' },
  { id: 'a2', name: 'Passenger records', confidentiality: 5, integrity: 4, availability: 1, department_name: 'Ports' }] };
const today = new Date('2026-12-01');

describe('a system\'s suppliers as a picture', () => {
  test('suppliers, most contracts first, each its colour', () => {
    const s = suppliersOf(ROWS);
    expect(s.map((x) => [x.name, x.rows.length])).toEqual([['Supplier s1', 2], ['Supplier s2', 1]]);
    expect(s[0].stripe).not.toBe(s[1].stripe);
  });

  test('a contract says how it stands: not recorded, running out, ended', () => {
    expect(contractState(ROWS[0], today).word).toBe('no contract recorded');
    expect(contractState(ROWS[1], today)).toMatchObject({ tone: 'warn', word: 'ends 20 Dec 2026' });
    expect(contractState(ROWS[2], today)).toMatchObject({ tone: 'bad', word: 'ended 1 Jan 2026' });
    expect(contractState({ ...ROWS[1], status: 'ended' }, today).tone).toBe('quiet');
  });

  test('supplier to contract to system to its information assets, highest first', () => {
    const { nodes, links } = systemSuppliersNodes(SYSTEM, ROWS, { today });
    expect(nodes.find((n) => n.id === 'k-k1')).toMatchObject({ tag: 'Product', title: 'Through Falcon agent' });
    expect(nodes.find((n) => n.id === 'k-k2')).toMatchObject({ tag: 'Product · X-1', title: 'Directly to the system' });
    expect(links).toContainEqual({ from: 's-s1', to: 'k-k2', arrow: false });
    expect(links).toContainEqual({ from: 'k-k3', to: 'system', dashed: false });
    expect(nodes.filter((n) => n.col === 3).map((n) => n.title)).toEqual(['Passenger records', 'Timetables']);
    expect(links).toContainEqual({ from: 'system', to: 'a-a2', strong: true });
  });

  test('a supplier filters its contracts; a contract opens the supplier; an asset opens', () => {
    const onFilter = vi.fn(); const onSupplier = vi.fn(); const onAsset = vi.fn();
    const { nodes } = systemSuppliersNodes(SYSTEM, ROWS, { onFilter, onSupplier, onAsset, active: 'sup:s2', today });
    nodes.find((n) => n.id === 's-s1').onClick();
    nodes.find((n) => n.id === 'k-k3').onClick();
    nodes.find((n) => n.id === 'a-a1').onClick();
    expect(onFilter).toHaveBeenCalledWith('sup:s1');
    expect(onSupplier).toHaveBeenCalledWith('s2');
    expect(onAsset).toHaveBeenCalledWith('a1');
    expect(nodes.find((n) => n.id === 's-s2').selected).toBe(true);
  });
});
