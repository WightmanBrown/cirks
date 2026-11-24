// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { vi } from 'vitest';
import { systemRisksNodes, bandStripe } from './SystemRisksDiagram';

const RISKS = [
  { risk_id: 'r1', risk_score: 25, threat_name: 'Phishing' },
  { risk_id: 'r2', risk_score: 12, threat_name: 'Malware' },
  { risk_id: 'r3', risk_score: 4, threat_name: 'Flood' },
];
const ANSWER = {
  system_name: 'Mail', threat_name: 'Malware',
  score: { now: 12, target: null, probability: { c: 3, i: 1, a: 1 }, impact: { c: 4, i: 1, a: 1 }, driving: ['c'],
    threat_probability: 4, assets: [{ id: 'as1', name: 'Mailboxes', c: 4, i: 1, a: 1, sets: true }] },
  why: { objectives: [{ control_id: 'o1', ref: null, title: 'Mail filtering', status: 'operational', judged: true, now: 3, sets: true }] },
};

describe('Risks on this system as a picture', () => {
  test('the risks are a column on the left, worst first, the chosen one pressed', () => {
    const { nodes } = systemRisksNodes(RISKS, 'r2', null);
    const col = nodes.filter((n) => n.col === 0);
    expect(col.map((n) => [n.title, n.tag, n.selected])).toEqual([
      ['Phishing', 'Catastrophic', false], ['Malware', 'High', true], ['Flood', 'Low', false]]);
    // The value in its chip, in every view.
    expect(col.map((n) => n.badge.props.value)).toEqual([25, 12, 4]);
  });

  test('the chosen risk stands for its threat: the picture hangs off it, one column to the right', () => {
    const { nodes, links } = systemRisksNodes(RISKS, 'r2', ANSWER);
    expect(nodes.find((n) => n.id === 'threat')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'o-o1').col).toBe(2);
    expect(nodes.find((n) => n.id === 'grid').col).toBe(4);
    expect(links).toContainEqual({ from: 'r-r2', to: 'o-o1', arrow: false, dashed: false });
    // Lined up with the chosen risk: its objectives start on its row.
    expect(nodes.find((n) => n.id === 'o-o1').row).toBe(1);
  });

  test('selecting a risk asks for it; a box in the picture opens the risk at its record', () => {
    const onSelect = vi.fn(); const onGo = vi.fn();
    const { nodes } = systemRisksNodes(RISKS, 'r2', ANSWER, { onSelect, onGo });
    nodes.find((n) => n.id === 'r-r3').onClick();
    nodes.find((n) => n.id === 'o-o1').onClick();
    expect(onSelect).toHaveBeenCalledWith('r3');
    expect(onGo).toHaveBeenCalledWith('why', 'risk-objective-o1');
  });

  test('each risk wears its band\'s colour, as its chip and list row do', () => {
    const { nodes } = systemRisksNodes(RISKS, 'r1', null);
    expect(nodes.find((n) => n.id === 'r-r1').stripe).toBe('var(--band-catastrophic-edge)');
    expect(nodes.find((n) => n.id === 'r-r2').stripe).toBe('var(--band-high-fg)');
    expect(bandStripe(null)).toBeUndefined();
  });
});
