// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { render, screen, fireEvent } from '@testing-library/react';
import { riskControlsNodes, RiskControlsDiagram, solKey, altKey, partState } from './RiskControlsDiagram';

const part = (id, extra = {}) => ({ id, name: `Part ${id}`, component_type: 'technology', on_system: true, system_status: 'operational', part_location: 'on_system', slot_key: 'agent', ...extra });
const sol = (id, extra = {}) => ({ id, name: `Solution ${id}`, kind: 'parts', solution_pattern: 'P5', state: 'complete', in_use: false, parts: [part(`${id}1`), part(`${id}2`, { on_system: false, system_status: null })], ...extra });
const ctl = (id, extra = {}) => ({ id, title: `Objective ${id}`, probability_c: 2, probability_i: 2, probability_a: 2, probability_judged: true, components: [], ...extra });

const ok = ctl('ok', { on_system: true, system_status: 'operational', solutions: [sol('edr', { in_use: true }), sol('alt1'), sol('alt2')] });
const weak = ctl('weak', { on_system: true, system_status: 'degraded', solutions: [sol('siem', { in_use: true, state: 'degraded' })] });
const gone = ctl('gone', { on_system: false, system_status: null, solutions: null, components: [part('x')] });
const groups = (extra = {}) => [
  { key: 'operational', title: 'Current operational controls on this system', empty: 'Nothing', rows: [ok] },
  { key: 'impaired', title: 'Degraded', rows: [weak] },
  { key: 'missing', title: 'Missing', rows: [gone] },
  { key: 'excluded', title: 'Excluded', rows: [] },
  ...(extra.more || []),
];

describe('riskControlsNodes', () => {
  it('draws every objective under its heading, operational first, missing below', () => {
    const { nodes } = riskControlsNodes(groups());
    const ids = nodes.map((n) => n.id).filter((id) => /^(h|o)-/.test(id));
    expect(ids).toEqual(['h-operational', 'o-ok', 'h-impaired', 'o-weak', 'h-missing', 'o-gone']);
    const row = (id) => nodes.find((n) => n.id === id).row;
    expect(row('o-ok')).toBeLessThan(row('o-weak'));
    expect(row('o-weak')).toBeLessThan(row('o-gone'));
  });

  it('shows the solution in use and folds the others into one box', () => {
    const { nodes } = riskControlsNodes(groups());
    expect(nodes.find((n) => n.id === 's-ok-edr')).toMatchObject({ tone: 'good', tag: 'Solution · P5 · in use' });
    expect(nodes.find((n) => n.id === 's-ok-alt1')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'alt-ok').title).toBe('+ 2 other ways to deliver it');
    const open = riskControlsNodes(groups(), { open: new Set([altKey('ok')]) }).nodes;
    expect(open.find((n) => n.id === 's-ok-alt1').tag).toBe('Other way · P5');
  });

  it('keeps parts hidden until the solution is chosen, then shows each in its slot', () => {
    expect(riskControlsNodes(groups()).nodes.some((n) => n.id.startsWith('p-'))).toBe(false);
    const { nodes, links } = riskControlsNodes(groups(), { open: new Set([solKey('ok', 'edr')]) });
    const parts = nodes.filter((n) => n.id.startsWith('p-ok-edr'));
    expect(parts.map((n) => n.title)).toEqual(['Part edr1', 'Part edr2']);
    expect(parts[1]).toMatchObject({ tone: 'bad', col: 2 });
    expect(parts[1].detail).toBe('not recorded here');
    expect(links.find((l) => l.to === parts[1].id).dashed).toBe(true);
    // The unfolded parts push the next objective down.
    const before = riskControlsNodes(groups()).nodes.find((n) => n.id === 'o-weak').row;
    expect(nodes.find((n) => n.id === 'o-weak').row).toBeGreaterThan(before);
  });

  it('runs an objective with no solution to a red box', () => {
    const { nodes, links } = riskControlsNodes(groups());
    expect(nodes.find((n) => n.id === 'n-gone')).toMatchObject({ tone: 'bad', tag: 'No security solution' });
    expect(links.find((l) => l.to === 'n-gone')).toMatchObject({ dashed: true, tone: 'bad' });
  });

  it('says when nothing is operational, and drops other empty groups', () => {
    const g = groups().map((x) => (x.key === 'operational' ? { ...x, rows: [] } : x));
    const { nodes } = riskControlsNodes(g);
    expect(nodes.find((n) => n.id === 'e-operational').title).toBe('Nothing');
    expect(nodes.find((n) => n.id === 'h-excluded')).toBeUndefined();
  });

  it('lights the chosen objective and fades the rest', () => {
    const { nodes } = riskControlsNodes(groups(), { selected: 'weak' });
    expect(nodes.find((n) => n.id === 'o-weak').selected).toBe(true);
    expect(nodes.find((n) => n.id === 'o-ok').faded).toBe(true);
  });
});

describe('partState', () => {
  it('names a part on a security system that is not recorded there', () => {
    expect(partState(part('p', { on_system: false, part_location: 'service' })).words).toBe('not recorded on the security system');
  });
});

describe('RiskControlsDiagram', () => {
  it('reports the objective and solution chosen', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(<RiskControlsDiagram groups={groups()} onSelect={onSelect} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /^Objective weak:/ }));
    expect(onSelect).toHaveBeenCalledWith('weak');
    fireEvent.click(screen.getByRole('button', { name: /^Security solution Solution edr/ }));
    expect(onToggle).toHaveBeenCalledWith(solKey('ok', 'edr'));
  });
});

describe('other ways', () => {
  it('stays under its solution when the parts are unfolded', () => {
    const { nodes } = riskControlsNodes(groups(), { open: new Set([solKey('ok', 'edr')]) });
    const sol = nodes.find((n) => n.id === 's-ok-edr');
    const alt = nodes.find((n) => n.id === 'alt-ok');
    expect(alt.row - sol.row).toBeCloseTo(0.8);
    expect(alt.col).toBe(1);
  });
});

describe('values and the best paths', () => {
  it('puts the likelihood each objective brings on its line, as a chip', () => {
    const { links } = riskControlsNodes(groups());
    const toEdr = links.find((l) => l.from === 'o-ok' && l.to === 's-ok-edr');
    render(<>{toEdr.label}</>);
    expect(screen.getByText('2')).toBeInTheDocument();
    // A degraded objective counts a rung worse.
    const toSiem = links.find((l) => l.from === 'o-weak' && l.to === 's-weak-siem');
    expect(toSiem.label.props.title).toBe('Counts as C3 I3 A3');
    expect(links.find((l) => l.to === 'n-gone').label).toBeTruthy();
  });

  it('draws heavy the paths lowering the risk below the threat\'s own likelihood', () => {
    const { nodes, links } = riskControlsNodes(groups(), { open: new Set([solKey('ok', 'edr')]) });
    expect(links.find((l) => l.to === 's-ok-edr')).toMatchObject({ strong: true, tone: 'good' });
    expect(links.find((l) => l.to === 'p-ok-edr-edr1')).toMatchObject({ strong: true });
    expect(links.find((l) => l.to === 's-weak-siem').strong).toBeUndefined();
    expect(nodes.find((n) => n.id === 'o-ok').detail).toBe('best effect · C2 I2 A2');
  });

  it('emphasises nothing when no objective lowers the likelihood', () => {
    const { links } = riskControlsNodes(groups(), { inherent: { c: 2, i: 2, a: 2 } });
    expect(links.some((l) => l.strong)).toBe(false);
  });

  it('folds the other ways up again from a cross on their dashed line', () => {
    const { nodes } = riskControlsNodes(groups(), { open: new Set([altKey('ok')]) });
    expect(nodes.find((n) => n.id === 'alt-ok')).toBeUndefined();
    const cross = nodes.find((n) => n.id === 'fold-ok');
    expect(cross.ariaLabel).toBe('Fold up the 2 other security solutions for Objective ok.');
    // Between the solution in use and the first other way, in the gutter.
    expect(cross.row).toBeGreaterThan(nodes.find((n) => n.id === 's-ok-edr').row);
    expect(cross.row).toBeLessThan(nodes.find((n) => n.id === 's-ok-alt1').row);
    expect(cross.col).toBeGreaterThan(0);
    expect(cross.col).toBeLessThan(1);
  });
});

describe('best boxes', () => {
  it('frames the best objective and its solution in green until one is chosen', () => {
    const { nodes } = riskControlsNodes(groups());
    expect(nodes.find((n) => n.id === 'o-ok').lit).toBe('var(--green)');
    expect(nodes.find((n) => n.id === 's-ok-edr').lit).toBe('var(--green)');
    expect(nodes.find((n) => n.id === 'o-weak').lit).toBeUndefined();
    expect(riskControlsNodes(groups(), { selected: 'weak' }).nodes.find((n) => n.id === 'o-ok').lit).toBeUndefined();
  });
});

describe('the threat', () => {
  const threat = { name: 'Ransomware', onClick: () => {} };
  const inherent = { c: 5, i: 4, a: 5 };

  it('stands first, level with the first objective, and fans out to every objective', () => {
    const { nodes, links } = riskControlsNodes(groups(), { threat, inherent });
    const t = nodes.find((n) => n.id === 'threat');
    expect(t).toMatchObject({ col: 0, kind: 'threat', title: 'Ransomware', detail: 'likelihood 5 on its own' });
    expect(t.row).toBe(nodes.find((n) => n.id === 'o-ok').row);
    expect(nodes.find((n) => n.id === 'o-ok').col).toBe(1);
    expect(links.filter((l) => l.from === 'threat').map((l) => l.to)).toEqual(['o-ok', 'o-weak', 'o-gone']);
  });

  it('carries its own likelihood as a chip on its line, once', () => {
    const { links } = riskControlsNodes(groups(), { threat, inherent });
    const out = links.filter((l) => l.from === 'threat');
    expect(out.filter((l) => l.label)).toHaveLength(1);
    render(<>{out[0].label}</>);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('dashes the line to an objective not in place, and draws the best path heavy', () => {
    const { links } = riskControlsNodes(groups(), { threat, inherent });
    expect(links.find((l) => l.from === 'threat' && l.to === 'o-gone').dashed).toBe(true);
    expect(links.find((l) => l.from === 'threat' && l.to === 'o-ok')).toMatchObject({ strong: true, dashed: false });
  });
});

describe('best likelihood', () => {
  const inherent = { c: 5, i: 5, a: 5 };

  it('stands on the right with the lowest figure in place, joined to the best objectives', () => {
    const { nodes, links } = riskControlsNodes(groups(), { inherent, threat: { name: 'T' } });
    const best = nodes.find((n) => n.id === 'best');
    expect(best).toMatchObject({ col: 4, title: 'Best likelihood = 2', tone: 'good', detail: 'C2 I2 A2 · from 1 objective' });
    expect(links.filter((l) => l.to === 'best').map((l) => l.from)).toEqual(['s-ok-edr']);
    expect(best.row).toBe(nodes.find((n) => n.id === 's-ok-edr').row);
  });

  it('runs on from the first part when the solution is unfolded, so it crosses nothing', () => {
    const { links } = riskControlsNodes(groups(), { inherent, open: new Set([solKey('ok', 'edr')]) });
    expect(links.filter((l) => l.to === 'best').map((l) => l.from)).toEqual(['p-ok-edr-edr1']);
  });

  it('says so when nothing lowers the likelihood', () => {
    const { nodes, links } = riskControlsNodes(groups(), { inherent: { c: 2, i: 2, a: 2 } });
    expect(nodes.find((n) => n.id === 'best')).toMatchObject({ title: 'Best likelihood = 2', tone: 'bad' });
    expect(nodes.find((n) => n.id === 'best').detail).toMatch(/nothing lowers it/);
    expect(links.some((l) => l.to === 'best')).toBe(false);
  });
});

describe('best likelihood chips', () => {
  it('carries a chip inside the box and one on each line into it, where the line leaves its block', () => {
    const { nodes, links } = riskControlsNodes(groups(), { inherent: { c: 5, i: 5, a: 5 } });
    const best = nodes.find((n) => n.id === 'best');
    render(<>{best.badge}</>);
    expect(screen.getByText('2')).toBeInTheDocument();
    const into = links.find((l) => l.to === 'best');
    expect(into).toMatchObject({ labelAt: 'start' });
    expect(into.label.props.title).toBe('Counts as C2 I2 A2');
  });
});
