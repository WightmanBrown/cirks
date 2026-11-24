// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { departmentColour } from '../utils/departmentColour';
import { RatingChip } from './RatingChip';
import { SOURCE, CATEGORY, STRIPE } from './SystemThreatsDiagram';

// The systems a threat is identified against, and the departments owning them,
// as a picture (owner, 2026-11-19; docs/relation-diagrams.md): the folded view
// of the threat page's Systems affected tab.
//
//                ┌─▶ System  [risk] ─┐
//   Threat L4 ───┼─▶ System  [risk] ─┴──▶ Department
//                └─▶ System  not assessed ──▶ Department
//
// The threat wears the colour of where it comes from, as on its other picture.
// Each system carries its risk's chip, or says it is not assessed yet (amber;
// red once the identification has outlived a full review cycle). Each
// department has a colour its systems and its list wear; its systems are drawn
// together, worst risk first, so the lines into it do not cross.
//
//   threat  GET /threats/:id (name, source, threat_category, probability_c/i/a,
//           systems with department_id/name, assessed, risk_score, stale)

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const word = (map, k) => map[k] || (k ? k[0].toUpperCase() + k.slice(1) : 'Not stated');

// The departments owning the threat's systems, most systems first, each with
// its colour and its systems worst risk first (not assessed last).
export function departmentsOf(systems) {
  const by = new Map();
  for (const s of systems || []) {
    const key = s.department_id || 'none';
    if (!by.has(key)) by.set(key, { id: key, name: s.department_name || 'No department', systems: [] });
    by.get(key).systems.push(s);
  }
  return [...by.values()]
    .sort((x, y) => y.systems.length - x.systems.length || x.name.localeCompare(y.name))
    .map((d) => ({
      ...d,
      stripe: departmentColour(d.id === 'none' ? null : d.id),
      systems: [...d.systems].sort((x, y) => Number(y.assessed) - Number(x.assessed)
        || (y.risk_score ?? 0) - (x.risk_score ?? 0) || x.name.localeCompare(y.name)),
    }));
}

export function threatSystemsNodes(threat, { active = null, isExpert = true, onFilter = () => {}, onSystem = () => {} } = {}) {
  const systems = threat.systems || [];
  const depts = departmentsOf(systems);
  const stripe = STRIPE[threat.source] || 'var(--ppitf-people)';
  const own = Math.max(threat.probability_c ?? 0, threat.probability_i ?? 0, threat.probability_a ?? 0);
  const assessed = systems.filter((s) => s.assessed).length;
  const nodes = [];
  const links = [];
  const kind = `${word(SOURCE, threat.source)} · ${word(CATEGORY, threat.threat_category)}`;
  const mid = Math.max(systems.length - 1, 0) / 2;

  nodes.push({ id: 'threat', col: 0, row: mid, kind: 'threat', stripe, selected: active === 'all',
    tag: `Threat · ${word(SOURCE, threat.source)}`, title: threat.name,
    detail: `${word(CATEGORY, threat.threat_category)} · ${plural(systems.length, 'system')}`,
    badge: own ? <RatingChip value={own} scale="probability" variant="number" /> : null,
    ariaLabel: `${threat.name}, ${kind.toLowerCase()}: identified on ${plural(systems.length, 'system')}, ${assessed} assessed. List them all.`,
    onClick: () => onFilter('all') });

  let row = 0;
  for (const d of depts) {
    const first = row;
    for (const s of d.systems) {
      nodes.push({ id: `s-${s.id}`, col: 1, row, kind: 'asset', stripe: d.stripe,
        tone: s.assessed ? null : s.stale ? 'bad' : 'warn',
        tag: s.assessed ? (s.validation_status === 'validated' ? 'System' : 'Not validated')
          : s.stale ? 'Not assessed · overdue' : 'Not assessed',
        title: s.name,
        badge: s.assessed ? <RatingChip value={s.risk_score} scale="risk" variant={isExpert ? 'number' : 'word'} /> : null,
        ariaLabel: s.assessed ? `${s.name}: risk ${s.risk_score}. Open the risk.` : `${s.name}: not assessed yet. Assess it.`,
        onClick: () => onSystem(s) });
      links.push({ from: 'threat', to: `s-${s.id}`, dashed: !s.assessed });
      links.push({ from: `s-${s.id}`, to: `d-${d.id}`, arrow: false });
      row += 1;
    }
    const worst = Math.max(0, ...d.systems.map((s) => s.risk_score ?? 0));
    nodes.push({ id: `d-${d.id}`, col: 2, row: first + (row - 1 - first) / 2, kind: 'people', stripe: d.stripe,
      selected: active === `dept:${d.id}`, tag: 'Department', title: d.name,
      detail: plural(d.systems.length, 'system'),
      badge: worst ? <RatingChip value={worst} scale="risk" variant={isExpert ? 'number' : 'word'} /> : null,
      ariaLabel: `${d.name}: ${plural(d.systems.length, 'system')}${worst ? `, worst risk ${worst}` : ''}. List them.`,
      onClick: () => onFilter(`dept:${d.id}`) });
  }
  if (!systems.length) {
    nodes.push({ id: 's-none', col: 1, row: 0, tone: 'bad', tag: 'Systems', title: 'Identified on none',
      detail: 'identify it on a system below', onClick: () => onFilter('all') });
    links.push({ from: 'threat', to: 's-none', dashed: true });
  }

  const label = `${threat.name}, ${kind.toLowerCase()}, is identified on ${plural(systems.length, 'system')}, ${assessed} assessed, `
    + `in ${plural(depts.length, 'department')}: `
    + depts.map((d) => `${d.name} (${d.systems.map((s) => `${s.name} ${s.assessed ? `risk ${s.risk_score}` : 'not assessed'}`).join(', ')})`).join('; ')
    + '.';
  return { nodes, links, label, depts };
}

export function ThreatSystemsDiagram({ threat, active, isExpert, onFilter, onSystem }) {
  const { nodes, links, label } = threatSystemsNodes(threat, { active, isExpert, onFilter, onSystem });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
