// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RatingChip } from './RatingChip';
import { bandStripe } from './SystemRisksDiagram';
import { departmentColour } from '../utils/departmentColour';
import { riskWord } from '../utils/ratingScale';

// A component's risks as a picture (owner, 2026-11-19; docs/relation-diagrams.md),
// at the head of its Risks tab:
//
//                  ┌─▶ System [risk]   ●──┬─▶ Risk [chip]  named here
//   Component [I] ─┼─▶ System [impact]    ├ ─▶ Risk [chip]  not named (faded)
//                  └─▶ N more             └ ─▶ Risk [chip]  not named (faded)
//
// A component has no risks of its own: it is exposed to the risks of the systems
// it is on. Some of those an analyst has NAMED it on, as part of why the threat
// succeeds (risk_components) — a judgement about this component, stronger than
// sitting on the system. So a risk score is shown only where it is named; every
// other system shows its impact, how much the component matters there, and the
// component's own chip is its criticality: the highest impact of its systems, as
// a supplier's is (owner, 2026-11-19). Named systems come first, then highest
// impact. Each wears its department's colour and is a selector: the chosen one
// draws its risks, the named ones in red, the rest faded — on the system, not
// judged to involve the component, which is where to look before naming it.
//
//   component  GET /components/:id (name, component_type, systems with
//              department_id and risks, vulnerable_on)

const MAX_SYSTEMS = 10;
const MAX_RISKS = 8;
// A risk the component is named on is outlined in red, solid (a dashed red box
// means a gap elsewhere in these pictures).
export const NAMED = 'var(--red)';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fitsOneLine = (t) => (t || '').length <= 24;
const chip = (v, scale = 'risk') => (v ? <RatingChip value={v} scale={scale} variant="number" /> : null);
const TYPE = { people: 'People', process: 'Process', information: 'Policy or document', technology: 'Technology', facility: 'Facility' };

// The component's systems, those it is named on first, then worst risk first;
// each with its risks worst first and which of them name the component.
export function componentSystemsOf(component) {
  const named = new Set((component.vulnerable_on || []).map((v) => v.risk_id));
  return (component.systems || []).map((s) => {
    const risks = [...(s.risks || [])].map((r) => ({ ...r, named: named.has(r.id) }))
      .sort((x, y) => Number(y.named) - Number(x.named) || (y.risk_score ?? 0) - (x.risk_score ?? 0)
        || x.threat_name.localeCompare(y.threat_name));
    const worst = risks.reduce((m, r) => Math.max(m, r.risk_score ?? 0), 0) || null;
    const namedRisks = risks.filter((r) => r.named);
    const worstNamed = namedRisks.reduce((m, r) => Math.max(m, r.risk_score ?? 0), 0) || null;
    const impact = Math.max(s.impact_c ?? 0, s.impact_i ?? 0, s.impact_a ?? 0) || null;
    return { ...s, risks, worst, worstNamed, impact, namedCount: namedRisks.length };
  }).sort((x, y) => y.namedCount - x.namedCount || (y.worstNamed ?? -1) - (x.worstNamed ?? -1)
    || (y.impact ?? -1) - (x.impact ?? -1) || x.name.localeCompare(y.name));
}

// What the component is exposed to, read honestly: its criticality is the
// highest impact of the systems it is on (as a supplier's is); a risk score is
// shown only where an analyst named it on the risk (owner's idea, 2026-11-19).
export function componentCriticality(component) {
  const systems = componentSystemsOf(component);
  const impact = systems.reduce((m, s) => Math.max(m, s.impact ?? 0), 0) || null;
  const namedRisk = systems.reduce((m, s) => Math.max(m, s.worstNamed ?? 0), 0) || null;
  return { impact, namedRisk, from: systems.filter((s) => impact && s.impact === impact) };
}

export function componentRisksNodes(component, selectedId, { onSelect = () => {}, onComponent = () => {}, onRisk = () => {}, onMore = () => {} } = {}) {
  const all = componentSystemsOf(component);
  const chosenIdx = Math.max(0, all.findIndex((s) => s.id === selectedId));
  const chosen = all[chosenIdx];
  // The first systems, and the chosen one always among them.
  let systems = all.slice(0, MAX_SYSTEMS);
  if (chosen && !systems.includes(chosen)) systems = [...systems.slice(0, MAX_SYSTEMS - 1), chosen];
  const hidden = all.length - systems.length;
  const sel = systems.indexOf(chosen);
  const nodes = [];
  const links = [];
  const sysCount = systems.length + (hidden ? 1 : 0);

  const risks = chosen ? chosen.risks.slice(0, MAX_RISKS) : [];
  const more = chosen ? chosen.risks.length - risks.length : 0;
  const count = Math.max(risks.length + (more ? 1 : 0), 1);
  const base = Math.max(0, sel - (count - 1) / 2);
  const mid = base + (count - 1) / 2;
  const kind = component.component_type;

  nodes.push({ id: 'component', col: 0, row: Math.max(0, (sysCount - 1) / 2), kind,
    tag: TYPE[kind] || 'Component', title: component.name, badge: chip(componentCriticality(component).impact, 'impact'),
    detail: fitsOneLine(component.name) ? `on ${plural(all.length, 'system')}` : null,
    ariaLabel: `${component.name}: on ${plural(all.length, 'system')}. List all their risks.`,
    onClick: onComponent });

  systems.forEach((s, k) => {
    nodes.push({ id: `s-${s.id}`, col: 1, row: k, kind: 'asset', stripe: departmentColour(s.department_id),
      selected: k === sel,
      // Named on a risk here: that risk's score. Otherwise the system's impact,
      // which is how much the component matters here.
      tag: s.namedCount ? 'Named · risk' : 'System · impact',
      title: s.name, detail: fitsOneLine(s.name) ? s.department_name : null,
      badge: s.namedCount ? chip(s.worstNamed) : chip(s.impact, 'impact'),
      ariaLabel: `${s.name}, ${s.department_name || 'no department'}: `
        + (s.namedCount ? `the component is named on ${plural(s.namedCount, 'risk')} here, worst ${s.worstNamed}`
          : `impact ${s.impact ?? 'not rated'}; the component is named on none of its ${plural(s.risks.length, 'risk')}`) + '. Show them.',
      onClick: () => onSelect(s.id) });
    links.push({ from: 'component', to: `s-${s.id}`, arrow: false, strong: k === sel });
  });
  if (hidden) {
    nodes.push({ id: 's-more', col: 1, row: systems.length, tone: 'quiet', tag: 'Systems',
      title: `${hidden} more`, detail: 'list them all', onClick: onMore });
    links.push({ from: 'component', to: 's-more', arrow: false, dashed: true });
  }
  if (!all.length) {
    nodes.push({ id: 's-none', col: 1, row: 0, tone: 'quiet', tag: 'Systems', title: 'On none',
      detail: 'no system records it' });
    links.push({ from: 'component', to: 's-none', dashed: true });
    return { nodes, links, label: `${component.name} is on no system, so no risk reaches it.`, systems: all };
  }

  risks.forEach((r, k) => {
    const w = riskWord(r.risk_score);
    // A risk not named on the component is drawn faded: on the system, not
    // judged to involve the component — where to look before naming it.
    nodes.push({ id: `r-${r.id}`, col: 2, row: base + k, kind: 'threat', stripe: bandStripe(r.risk_score),
      ...(r.named ? { lit: NAMED } : { faded: true }),
      tag: r.named ? 'Named here' : 'Not named', title: r.threat_name,
      detail: w && fitsOneLine(r.threat_name) ? `${w} risk` : null, badge: chip(r.risk_score),
      ariaLabel: `${r.threat_name} on ${chosen.name}: risk ${r.risk_score}${r.named ? ', this component named as part of why it succeeds' : ''}. Open it.`,
      onClick: () => onRisk(r.id) });
    links.push({ from: `s-${chosen.id}`, to: `r-${r.id}`, ...(r.named ? { tone: 'bad', strong: true } : { dashed: true, faded: true }) });
  });
  if (more) {
    nodes.push({ id: 'r-more', col: 2, row: base + risks.length, tone: 'quiet', tag: 'Risks',
      title: `${more} more`, detail: 'listed below', onClick: () => onSelect(chosen.id, true) });
    links.push({ from: `s-${chosen.id}`, to: 'r-more', dashed: true });
  }
  if (!chosen.risks.length) {
    nodes.push({ id: 'r-none', col: 2, row: mid, tone: 'good', tag: 'Risks', title: 'None active',
      detail: 'no threat assessed against it' });
    links.push({ from: `s-${chosen.id}`, to: 'r-none', dashed: true });
  }

  const label = `${component.name} is on ${plural(all.length, 'system')}: `
    + all.map((s) => `${s.name} (${plural(s.risks.length, 'risk')}${s.namedCount ? `, named on ${s.namedCount}` : ''})`).join(', ')
    + `. Showing ${chosen.name}: ${chosen.risks.map((r) => `${r.threat_name} ${r.risk_score}${r.named ? ' (named here)' : ''}`).join(', ') || 'no active risks'}.`;
  return { nodes, links, label, systems: all, chosen };
}

export function ComponentRisksDiagram({ component, selected, onSelect, onComponent, onRisk, onMore }) {
  const { nodes, links, label } = componentRisksNodes(component, selected, { onSelect, onComponent, onRisk, onMore });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
