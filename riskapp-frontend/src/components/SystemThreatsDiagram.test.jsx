// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { vi } from 'vitest';
import { systemThreatsNodes, combinationsOf } from './SystemThreatsDiagram';

const t = (id, source, cat, score, l, i, own = 4) => ({ id, name: `Threat ${id}`, threat_source: source, threat_category: cat,
  assessed: score != null, risk_id: score != null ? `r${id}` : null, risk_score: score, grid_likelihood: l, grid_impact: i,
  threat_likelihood: own });
const SYSTEM = { name: 'Mail',
  threats: [t('a', 'external', 'deliberate', 10, 2, 5), t('b', 'external', 'deliberate', 25, 5, 5),
    t('c', 'internal', 'accidental', 5, 1, 5), t('d', 'natural', 'environmental', null, null, null, 3)],
  information_assets: [{ id: 'x', name: 'Timetables', confidentiality: 1, integrity: 2, availability: 2 },
    { id: 'y', name: 'Passenger records', confidentiality: 5, integrity: 4, availability: 1 }] };
const SECURITY = { objectives: [
  { control_id: 'o1', title: 'Mail filtering', reference_code: 'CIRKS1.PR-01', threats: ['Threat b'] },
  { control_id: 'o2', title: 'Awareness', reference_code: null, threats: ['Threat a', 'Threat b'] },
  { control_id: 'o3', title: 'Backups', reference_code: null, threats: ['Threat d'] },
] };
const CONTROLS = [{ id: 'o1', status: 'operational' }, { id: 'o2', status: 'missing' }];

describe('a system\'s threats as a picture', () => {
  test('every combination of source and category on the system, in order, as a selector', () => {
    const combos = combinationsOf(SYSTEM.threats);
    expect(combos.map((c) => [c.word, c.threats.map((x) => x.id)])).toEqual([
      ['External · Deliberate', ['b', 'a']], ['Internal · Accidental', ['c']], ['Natural · Environmental', ['d']]]);
    const { nodes } = systemThreatsNodes(SYSTEM, SECURITY, CONTROLS, 'internal/accidental');
    const left = nodes.filter((n) => n.col === 0 && n.id.startsWith('c-'));
    expect(left.map((n) => [n.title, n.tag, n.selected])).toEqual([
      ['External · Deliberate', '2 threats', false], ['Internal · Accidental', '1 threat', true], ['Natural · Environmental', '1 threat', false]]);
  });

  test('the chosen layer: its threats with their likelihood, the objectives against them, those in place feeding the likelihood', () => {
    const { nodes, links } = systemThreatsNodes(SYSTEM, SECURITY, CONTROLS, 'external/deliberate');
    expect(nodes.filter((n) => n.col === 1).map((n) => [n.title, n.badge.props.value])).toEqual([['Threat b', 5], ['Threat a', 2]]);
    expect(nodes.filter((n) => n.col === 2 && n.id.startsWith('o-')).map((n) => [n.title, n.tag])).toEqual([
      ['Mail filtering', 'PR-01 · in place'], ['Awareness', 'missing']]);
    expect(links).toContainEqual({ from: 't-b', to: 'o-o1', arrow: false, dashed: false });
    expect(links).toContainEqual({ from: 't-a', to: 'o-o2', arrow: false, dashed: true });
    expect(links.find((l) => l.from === 't-a' && l.to === 'o-o1')).toBeUndefined();
    expect(links).toContainEqual({ from: 'o-o1', to: 'likelihood' });
    expect(links.find((l) => l.from === 'o-o2' && l.to === 'likelihood')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'likelihood')).toMatchObject({ title: 'Up to 5', detail: 'across 2 threats' });
  });

  test('the grid on the right counts the layer\'s risks; likelihood from above, the asset rated highest from the side', () => {
    const { nodes, links } = systemThreatsNodes(SYSTEM, SECURITY, CONTROLS, 'external/deliberate');
    expect(links).toContainEqual({ from: 'likelihood', to: 'grid', into: 'top', label: 'likelihood 5' });
    expect(links).toContainEqual({ from: 'asset', to: 'grid', label: 'impact 5' });
    expect(nodes.find((n) => n.id === 'grid').col).toBe(4);
    const grid = nodes.find((n) => n.id === 'grid').render().props;
    expect([grid.countAt(5, 5), grid.countAt(5, 2), grid.countAt(5, 1), grid.caption]).toEqual([1, 1, 0, 'risk count']);
    expect(nodes.find((n) => n.id === 'asset').title).toBe('Passenger records');
  });

  test('a threat not yet assessed shows its own likelihood; selecting and opening', () => {
    const onSelect = vi.fn(); const onThreat = vi.fn(); const onObjective = vi.fn(); const onGrid = vi.fn();
    const { nodes } = systemThreatsNodes(SYSTEM, SECURITY, CONTROLS, 'natural/environmental', { onSelect, onThreat, onObjective, onGrid });
    expect(nodes.find((n) => n.id === 't-d')).toMatchObject({ tag: 'Threat · not assessed', tone: 'warn' });
    expect(nodes.find((n) => n.id === 't-d').badge.props.value).toBe(3);
    nodes.find((n) => n.id === 'c-external/deliberate').onClick();
    nodes.find((n) => n.id === 't-d').onClick();
    nodes.find((n) => n.id === 'o-o3').onClick();
    nodes.find((n) => n.id === 'grid').onClick();
    expect(onSelect).toHaveBeenCalledWith('external/deliberate');
    expect(onThreat.mock.calls[0][0].id).toBe('d');
    expect(onObjective).toHaveBeenCalledWith('o3');
    expect(onGrid).toHaveBeenCalled();
  });
});
