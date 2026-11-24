// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RatingChip } from './RatingChip';
import { SOURCE, CATEGORY, STRIPE, IN_PLACE, shortRef } from './SystemThreatsDiagram';

// One threat, its mitigating control objectives and the security solutions
// delivering them, as a picture (owner, 2026-11-19; docs/relation-diagrams.md):
// the folded view of the threat page's Mitigating controls panel, in the
// colours of a system's Threats tab.
//
//                ┌─ objective  on 17/19 ─┬──▶ Security solution
//   Threat L4 ───┼─ objective  on 14/19 ─┴──▶ Security solution
//                └─ objective  on 0/19 ─ ─ ─▶ No security solution
//
// The threat wears the colour of where it comes from (external, internal,
// natural). Each objective is coloured by how far it protects the systems the
// threat is identified on: in place on all of them, on some, on none, or ruled
// out by the Statement of Applicability. Each runs to the security solutions
// that can deliver it (shared between objectives, v147); an objective no
// solution delivers runs to the red No security solution box, because nothing
// can put it in place on any system.
//
//   threat    GET /threats/:id (name, source, threat_category, probability_c/i/a)
//   controls  GET /threats/:id/controls (status = SoA standing, reference_code,
//             on_systems with the objective's state on each, solutions)

const MAX_OBJECTIVES = 12;
const MAX_SOLUTIONS = 14;
export const OBJECTIVE_STRIPE = 'var(--accent)';
export const NO_SOLUTION_STRIPE = 'var(--red)';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const word = (map, k) => map[k] || (k ? k[0].toUpperCase() + k.slice(1) : 'Not stated');

// How far an objective protects the threat's systems.
export function reachOf(c) {
  const on = c.on_systems || [];
  const operational = on.filter((s) => s.status === 'operational').length;
  const inPlace = on.filter((s) => IN_PLACE.has(s.status)).length;
  if (c.status === 'not_applicable') return { tone: 'quiet', inPlace: 0, of: on.length, words: 'not applicable (SoA)', short: 'not applicable' };
  if (!on.length) return { tone: null, inPlace: 0, of: 0, words: 'on no system yet', short: 'on no system' };
  const tone = operational === on.length ? 'good' : inPlace > 0 ? 'warn' : 'bad';
  const words = `${inPlace}/${on.length} in place`;
  return { tone, inPlace, of: on.length, words, short: `on ${inPlace}/${on.length}` };
}

export function threatControlsNodes(threat, controls, { active = null, onFilter = () => {}, onSolution = () => {} } = {}) {
  const stripe = STRIPE[threat.source] || 'var(--ppitf-people)';
  const own = Math.max(threat.probability_c ?? 0, threat.probability_i ?? 0, threat.probability_a ?? 0);
  const objectives = (controls || []).map((c) => ({ ...c, reach: reachOf(c), solutions: c.solutions || [] }));
  const rank = (o) => (o.reach.tone === 'good' ? 0 : o.reach.tone === 'warn' ? 1 : o.reach.tone === 'bad' ? 2 : o.reach.tone === 'quiet' ? 4 : 3);
  const order = (x, y) => rank(x) - rank(y) || y.reach.inPlace - x.reach.inPlace || x.title.localeCompare(y.title);
  objectives.sort(order);
  // When they do not all fit, the gaps are kept and the best covered folded
  // into "N more": hiding the objectives in place nowhere would hide the point.
  const shown = objectives.length <= MAX_OBJECTIVES ? objectives
    : [...objectives].sort((x, y) => -order(x, y)).slice(0, MAX_OBJECTIVES).sort(order);
  const more = objectives.length - shown.length;
  const unsolved = shown.filter((o) => !o.solutions.length);

  // The solutions, each placed level with the middle of the objectives it
  // delivers, so the lines cross as little as they can.
  const oRow = new Map();
  shown.forEach((o, k) => oRow.set(o.id, (more ? 1 : 0) + k));
  const sols = new Map();
  for (const o of shown) {
    for (const s of o.solutions) {
      if (!sols.has(s.id)) sols.set(s.id, { ...s, objectives: [] });
      sols.get(s.id).objectives.push(o.id);
    }
  }
  const centre = (s) => s.objectives.reduce((a, id) => a + oRow.get(id), 0) / s.objectives.length;
  const allSols = [...sols.values()].sort((x, y) => y.objectives.length - x.objectives.length || x.name.localeCompare(y.name));
  const shownSols = allSols.slice(0, allSols.length <= MAX_SOLUTIONS + 1 ? allSols.length : MAX_SOLUTIONS).sort((x, y) => centre(x) - centre(y) || x.name.localeCompare(y.name));
  const shownIds = new Set(shownSols.map((s) => s.id));
  const moreSols = allSols.length - shownSols.length;

  const oCount = shown.length + (more ? 1 : 0);
  const sCount = shownSols.length + (moreSols ? 1 : 0) + (unsolved.length ? 1 : 0);
  const stack = Math.max(oCount, sCount, 1);
  const oBase = (stack - oCount) / 2;
  const sBase = (stack - sCount) / 2;
  const mid = (stack - 1) / 2;
  const nodes = [];
  const links = [];
  const kind = `${word(SOURCE, threat.source)} · ${word(CATEGORY, threat.threat_category)}`;
  // A chosen objective lights its lines and the solutions delivering it (or the
  // No security solution box) in its colour; the other solutions and their
  // lines fade, so its way through the shared trunk can be followed.
  const chosen = shown.find((o) => active === `obj:${o.id}`) || null;
  const chosenSols = new Set((chosen?.solutions || []).map((s) => s.id));
  const litFor = (oid) => (chosen ? (oid === chosen.id ? { lit: OBJECTIVE_STRIPE } : { faded: true }) : {});
  const boxFor = (id) => (!chosen ? {} : (id === 'no-solution' ? !chosen.solutions.length : chosenSols.has(id))
    ? { lit: id === 'no-solution' ? NO_SOLUTION_STRIPE : OBJECTIVE_STRIPE } : { faded: true });

  nodes.push({ id: 'threat', col: 0, row: mid, kind: 'threat', stripe, selected: active === 'all',
    tag: `Threat · ${word(SOURCE, threat.source)}`, title: threat.name,
    detail: `${word(CATEGORY, threat.threat_category)} · ${plural(objectives.length, 'objective')}`,
    badge: own ? <RatingChip value={own} scale="probability" variant="number" /> : null,
    ariaLabel: `${threat.name}, ${kind.toLowerCase()}, likelihood ${own || 'not set'}: ${plural(objectives.length, 'control objective')}. List them all.`,
    onClick: () => onFilter('all') });

  if (more) {
    nodes.push({ id: 'o-more', col: 1, row: oBase, tone: 'quiet', tag: 'Objectives',
      title: `${more} more, better covered`, detail: 'list them all', onClick: () => onFilter('all') });
    links.push({ from: 'threat', to: 'o-more', arrow: false, dashed: true });
  }
  shown.forEach((o) => {
    const sel = active === `obj:${o.id}`;
    nodes.push({ id: `o-${o.id}`, col: 1, row: oBase + oRow.get(o.id), kind: 'control', tone: o.reach.tone,
      stripe: sel ? OBJECTIVE_STRIPE : undefined, selected: sel,
      tag: [shortRef(o.reference_code), o.reach.short].filter(Boolean).join(' · '), title: o.title,
      ariaLabel: `${o.title}: ${o.reach.words}, ${o.solutions.length ? plural(o.solutions.length, 'security solution') : 'no security solution'}. Show it on each system.`,
      onClick: () => onFilter(`obj:${o.id}`) });
    const lit = litFor(o.id);
    links.push({ from: 'threat', to: `o-${o.id}`, arrow: false, dashed: o.reach.inPlace === 0, ...(lit.lit ? lit : {}) });
    for (const s of o.solutions) if (shownIds.has(s.id)) links.push({ from: `o-${o.id}`, to: `s-${s.id}`, ...lit });
    if (o.solutions.some((s) => !shownIds.has(s.id))) links.push({ from: `o-${o.id}`, to: 's-more', dashed: true, ...lit });
    if (!o.solutions.length) {
      links.push({ from: `o-${o.id}`, to: 'no-solution', dashed: true, tone: 'bad',
        ...(lit.lit || active === 'none' ? { lit: NO_SOLUTION_STRIPE } : lit) });
    }
  });
  if (!objectives.length) {
    nodes.push({ id: 'o-none', col: 1, row: mid, tone: 'bad', tag: 'Objectives', title: 'None linked yet',
      detail: 'nothing is known to counter it', onClick: () => onFilter('all') });
    links.push({ from: 'threat', to: 'o-none', arrow: false, dashed: true });
  }

  shownSols.forEach((s, k) => {
    nodes.push({ id: `s-${s.id}`, col: 2, row: sBase + k, kind: 'control', ...boxFor(s.id),
      tag: `Solution${s.solution_pattern ? ` · ${s.solution_pattern}` : ''}`, title: s.name,
      detail: s.kind === 'supplier' ? 'provided by the supplier'
        : s.objectives.length > 1 ? `delivers ${s.objectives.length} of these` : null,
      ariaLabel: `Security solution ${s.name}: delivers ${plural(s.objectives.length, 'objective')} against this threat. Open it.`,
      onClick: () => onSolution(s.id) });
  });
  if (moreSols) {
    nodes.push({ id: 's-more', col: 2, row: sBase + shownSols.length, tone: 'quiet', ...(chosen ? { faded: true } : {}), tag: 'Solutions',
      title: `${moreSols} more`, detail: 'on each objective’s page' });
  }
  if (unsolved.length) {
    nodes.push({ id: 'no-solution', col: 2, row: sBase + shownSols.length + (moreSols ? 1 : 0), tone: 'bad', ...boxFor('no-solution'),
      stripe: NO_SOLUTION_STRIPE, selected: active === 'none',
      tag: 'No security solution', title: plural(unsolved.length, 'objective'),
      detail: 'nothing can put it in place', onClick: () => onFilter('none') });
  }

  const label = `${threat.name}, ${kind.toLowerCase()}. ${plural(objectives.length, 'control objective')} against it: `
    + objectives.map((o) => `${o.title} (${o.reach.words}; ${o.solutions.length ? o.solutions.map((s) => s.name).join(', ') : 'no security solution'})`).join(', ')
    + '.';
  return { nodes, links, label, objectives, unsolved };
}

export function ThreatControlsDiagram({ threat, controls, active, onFilter, onSolution }) {
  const { nodes, links, label } = threatControlsNodes(threat, controls, { active, onFilter, onSolution });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
