// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { reachOf, threatControlsNodes } from './ThreatControlsDiagram';

const sys = (id, status) => ({ system_id: id, system_name: id, status });
const sol = (id, extra = {}) => ({ id, name: `Solution ${id}`, kind: 'parts', solution_pattern: 'P5', ...extra });
const threat = { name: 'Ransomware', source: 'external', threat_category: 'deliberate', probability_c: 2, probability_i: 4, probability_a: 3 };
const controls = [
  { id: 'a', title: 'Backups are protected', reference_code: 'CIRKS1.BRR-02', status: 'adopted',
    on_systems: [sys('s1', 'operational'), sys('s2', 'operational'), sys('s3', 'operational')], solutions: [sol('veeam'), sol('supp', { kind: 'supplier', solution_pattern: 'P7' })] },
  { id: 'b', title: 'Least privilege', status: 'adopted', on_systems: [sys('s1', 'degraded'), sys('s2', 'missing'), sys('s3', 'not_recorded')], solutions: [sol('veeam'), sol('entra')] },
  { id: 'c', title: 'Access is reviewed', status: 'adopted', on_systems: [sys('s1', 'missing'), sys('s2', 'missing'), sys('s3', 'missing')], solutions: [] },
  { id: 'd', title: 'Segregation of duties', status: 'not_applicable', on_systems: [sys('s1', 'operational')], solutions: [] },
];

describe('reachOf', () => {
  it('colours an objective by how far it protects the threat\'s systems', () => {
    expect(reachOf(controls[0])).toMatchObject({ tone: 'good', words: '3/3 in place', short: 'on 3/3' });
    expect(reachOf(controls[1])).toMatchObject({ tone: 'warn', short: 'on 1/3' });
    expect(reachOf(controls[2])).toMatchObject({ tone: 'bad', short: 'on 0/3' });
    expect(reachOf(controls[3])).toMatchObject({ tone: 'quiet', short: 'not applicable' });
    expect(reachOf({ status: 'adopted', on_systems: [] })).toMatchObject({ tone: null });
  });
});

describe('threatControlsNodes', () => {
  const { nodes, links, label } = threatControlsNodes(threat, controls, { active: 'obj:b' });
  const node = (id) => nodes.find((n) => n.id === id);

  it('draws the threat in its source colour', () => {
    expect(node('threat')).toMatchObject({ kind: 'threat', stripe: 'var(--graph-threat)', tag: 'Threat · External' });
  });

  it('draws the objectives best covered first and marks the chosen one', () => {
    expect(nodes.filter((n) => n.id.startsWith('o-')).map((n) => n.id)).toEqual(['o-a', 'o-b', 'o-c', 'o-d']);
    expect(node('o-b')).toMatchObject({ selected: true, stripe: 'var(--accent)', tone: 'warn', tag: 'on 1/3' });
    expect(node('o-a').tag).toBe('BRR-02 · on 3/3');
  });

  it('runs each objective to its security solutions, a shared one drawn once', () => {
    expect(nodes.filter((n) => n.id.startsWith('s-')).map((n) => n.id).sort()).toEqual(['s-entra', 's-supp', 's-veeam']);
    expect(node('s-veeam')).toMatchObject({ tag: 'Solution · P5', detail: 'delivers 2 of these' });
    expect(node('s-supp').detail).toBe('provided by the supplier');
    expect(links.filter((l) => l.to === 's-veeam').map((l) => l.from)).toEqual(['o-a', 'o-b']);
  });

  it('runs the objectives with no solution to the red No security solution box', () => {
    expect(node('no-solution')).toMatchObject({ tone: 'bad', title: '2 objectives', tag: 'No security solution' });
    expect(links.filter((l) => l.to === 'no-solution').map((l) => l.from)).toEqual(['o-c', 'o-d']);
    expect(nodes.find((n) => n.id === 'likelihood' || n.id === 'grid')).toBeUndefined();
    expect(label).toMatch(/Access is reviewed \(0\/3 in place; no security solution\)/);
  });

  it('says when nothing is linked', () => {
    const r = threatControlsNodes(threat, []);
    expect(r.nodes.find((n) => n.id === 'o-none').title).toBe('None linked yet');
    expect(r.nodes.find((n) => n.id === 'no-solution')).toBeUndefined();
  });

  it('keeps the gaps and folds the best covered into N more', () => {
    const many = Array.from({ length: 14 }, (_, k) => ({ id: `g${k}`, title: `Good ${k}`, status: 'adopted', on_systems: [sys('s1', 'operational')], solutions: [sol('x')] }))
      .concat([{ id: 'gap', title: 'Gap', status: 'adopted', on_systems: [sys('s1', 'missing')], solutions: [] }]);
    const r = threatControlsNodes(threat, many);
    expect(r.nodes.map((n) => n.id)).toContain('o-gap');
    expect(r.nodes.find((n) => n.id === 'o-more').title).toBe('3 more, better covered');
  });
});

describe('threatControlsNodes with an objective chosen', () => {
  const { nodes, links } = threatControlsNodes(threat, controls, { active: 'obj:b' });
  const node = (id) => nodes.find((n) => n.id === id);
  const link = (from, to) => links.find((l) => l.from === from && l.to === to);

  it('lights its lines and the solutions delivering it, and fades the rest', () => {
    expect(link('o-b', 's-veeam').lit).toBe('var(--accent)');
    expect(link('o-b', 's-entra').lit).toBe('var(--accent)');
    expect(link('threat', 'o-b').lit).toBe('var(--accent)');
    expect(link('o-a', 's-veeam').faded).toBe(true);
    expect(node('s-veeam').lit).toBe('var(--accent)');
    expect(node('s-supp').faded).toBe(true);
    expect(node('no-solution').faded).toBe(true);
  });

  it('lights the No security solution box for an objective without one', () => {
    const r = threatControlsNodes(threat, controls, { active: 'obj:c' });
    expect(r.nodes.find((n) => n.id === 'no-solution').lit).toBe('var(--red)');
    expect(r.links.find((l) => l.from === 'o-c' && l.to === 'no-solution').lit).toBe('var(--red)');
    expect(r.nodes.find((n) => n.id === 's-veeam').faded).toBe(true);
  });

  it('lights nothing when no objective is chosen', () => {
    const r = threatControlsNodes(threat, controls);
    expect(r.nodes.some((n) => n.lit || n.faded)).toBe(false);
    expect(r.links.some((l) => l.lit || l.faded)).toBe(false);
  });
});
