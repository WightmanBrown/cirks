// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { RelationDiagram, routeOf, roundedPath } from './RelationDiagram';
import { riskScoreNodes } from './RiskScoreDiagram';

describe('routing', () => {
  const a = { x: 0, y: 0, w: 100, h: 40, cy: 20, cx: 50 };
  test('a link into the left turns in the gutter before its target, so links into one box share a trunk', () => {
    const b1 = { x: 200, y: 0, w: 100, h: 40, cy: 20, cx: 250 };
    const b2 = { x: 200, y: 100, w: 100, h: 40, cy: 120, cx: 250 };
    expect(routeOf(a, b1)).toEqual([[100, 20], [200, 20]]);                    // level: straight across
    expect(routeOf(a, b2)).toEqual([[100, 20], [168, 20], [168, 120], [200, 120]]);
  });
  test('a link into the top runs across, then down', () => {
    const g = { x: 300, y: 200, w: 100, h: 100, cy: 250, cx: 350 };
    expect(routeOf(a, g, 'top')).toEqual([[100, 20], [350, 20], [350, 200]]);
    expect(routeOf({ ...a, y: 400, cy: 420 }, g, 'bottom')).toEqual([[100, 420], [350, 420], [350, 300]]);
  });
  test('corners are rounded, never by more than half the shorter stretch', () => {
    expect(roundedPath([[0, 0], [100, 0], [100, 100]])).toBe('M0,0 L92,0 Q100,0 100,8 L100,100');
    expect(roundedPath([[0, 0], [100, 0], [100, 6], [200, 6]])).toContain('Q100,0 100,3');
  });
});

describe('RelationDiagram', () => {
  test('a box with onClick is a button named in words; one without is not', () => {
    const go = vi.fn();
    render(<RelationDiagram label="the picture" nodes={[
      { id: 'a', col: 0, row: 0, tag: 'Threat', title: 'Phishing', onClick: go },
      { id: 'b', col: 1, row: 0, tag: 'Note', title: 'Plain' },
    ]} links={[{ from: 'a', to: 'b' }]} />);
    expect(screen.getByRole('figure', { name: 'the picture' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Threat: Phishing' }));
    expect(go).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Plain/ })).toBeNull();
  });
});

const ANSWER = {
  system_name: 'Harbour Booking', threat_name: 'Phishing',
  score: { now: 15, target: 10, probability: { c: 3, i: 1, a: 1 }, impact: { c: 5, i: 2, a: 1 }, driving: ['c'],
    threat_probability: 4, assets: [{ id: 'as1', name: 'Passenger records', c: 5, i: 2, a: 1, sets: true },
      { id: 'as2', name: 'Timetables', c: 1, i: 1, a: 1, sets: false }] },
  why: { objectives: [
    { control_id: 'o1', ref: 'CIRKS1.AT-01', title: 'Awareness training', status: 'missing', judged: false, now: null, sets: false },
    { control_id: 'o2', ref: 'CIRKS1.PR-02', title: 'Mail filtering', status: 'operational', judged: true, now: 3, sets: true },
  ] },
};

describe('How bad is it? as a picture', () => {
  test('the objective setting the likelihood comes first and feeds it heavy; one not in place does not feed it', () => {
    const { nodes, links } = riskScoreNodes(ANSWER);
    expect(nodes.filter((n) => n.col === 1).map((n) => n.title)).toEqual(['Mail filtering', 'Awareness training']);
    expect(nodes.find((n) => n.id === 'o-o2').tag).toBe('PR-02 · sets it');
    expect(links).toContainEqual({ from: 'o-o2', to: 'likelihood', strong: true });
    expect(links.find((l) => l.from === 'o-o1' && l.to === 'likelihood')).toBeUndefined();
    expect(links).toContainEqual({ from: 'threat', to: 'o-o1', arrow: false, dashed: true });
  });

  test('the likelihood drops into the grid from above; the asset setting the impact runs in from the side', () => {
    const { nodes, links, label } = riskScoreNodes(ANSWER);
    expect(links).toContainEqual({ from: 'likelihood', to: 'grid', into: 'top', label: 'likelihood 3' });
    expect(links).toContainEqual({ from: 'asset', to: 'grid', label: 'impact 5' });
    expect(nodes.find((n) => n.id === 'asset')).toMatchObject({ title: 'Passenger records', detail: 'and 1 more held' });
    expect(nodes.find((n) => n.id === 'likelihood').detail).toBe('down from 4');
    expect(nodes.find((n) => n.id === 'target').title).toBe('Score 10');
    expect(label).toMatch(/confidentiality likelihood 3, down from 4; impact 5 from Passenger records; score 15/);
  });

  test('each box goes to its record', () => {
    const onGo = vi.fn();
    const { nodes } = riskScoreNodes(ANSWER, onGo);
    nodes.find((n) => n.id === 'o-o1').onClick();
    nodes.find((n) => n.id === 'asset').onClick();
    nodes.find((n) => n.id === 'threat').onClick();
    nodes.find((n) => n.id === 'target').onClick();
    expect(onGo.mock.calls).toEqual([['why', 'risk-objective-o1'], ['about', 'risk-asset-as1'], ['about', 'risk-threat'], ['work', 'work']]);
  });

  test('more than five objectives fold into "N more"; none at all is said', () => {
    const many = { ...ANSWER, why: { objectives: Array.from({ length: 8 }, (_, i) => ({
      control_id: `x${i}`, ref: null, title: `Objective ${i}`, status: 'missing', judged: false, now: null, sets: false })) } };
    expect(riskScoreNodes(many).nodes.find((n) => n.id === 'more').title).toBe('3 more');
    const none = riskScoreNodes({ ...ANSWER, why: { objectives: [] } });
    expect(none.nodes.find((n) => n.id === 'none').title).toBe('None counters this threat');
    expect(none.links).toContainEqual({ from: 'threat', to: 'likelihood', dashed: true });
  });
});
