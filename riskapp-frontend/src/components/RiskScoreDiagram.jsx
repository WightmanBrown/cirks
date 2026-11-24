// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RiskGrid } from './RiskGrid';
import { probabilityLabel, impactLabel } from '../utils/ratingScale';

// "How bad is it?" as a picture (owner, 2026-11-19; docs/relation-diagrams.md):
//
//   Threat ─┬─ objective ─┬─▶ Likelihood now ──╮
//           ├─ objective ─┤                    ▼
//           └─ objective ─┘              ┌───────────┐
//   Information asset ──────────────────▶│ the grid  │
//                                        └───────────┘
//
// The threat fans out to the objectives against it; those in place feed the
// likelihood (the one setting it drawn heavy); the likelihood drops into the
// grid's likelihood axis and the asset that sets the impact runs into its impact
// axis. Every box is a way into the record: `onGo(section, elementId)` opens the
// section beneath and scrolls to the row.
//
// `a` is GET /risks/:id/answer.

const DIM = { c: 'confidentiality', i: 'integrity', a: 'availability' };
const LETTER = { c: 'C', i: 'I', a: 'A' };
const MAX_SHOWN = 5;
const STATE = {
  operational: 'in place', degraded: 'degraded', missing: 'missing', unknown: 'not checked',
  not_recorded: 'not recorded', not_applicable: 'not applicable',
};
const IN_PLACE = new Set(['operational', 'degraded']);
const shortRef = (ref) => (ref ? ref.replace(/^CIRKS1\./, '') : null);

// Setting first, then in place, then the rest: the reader sees what holds the
// likelihood down before what does not.
function order(objectives) {
  const rank = (o) => (o.sets ? 0 : o.status === 'operational' ? 1 : o.status === 'degraded' ? 2
    : o.status === 'not_applicable' ? 4 : 3);
  return [...objectives].sort((x, y) => rank(x) - rank(y) || x.title.localeCompare(y.title));
}

export function riskScoreNodes(a, onGo = () => {}) {
  const s = a.score;
  const w = a.why;
  const d = s.driving[0];
  const objectives = order(w.objectives || []);
  const shown = objectives.slice(0, MAX_SHOWN);
  const more = objectives.length - shown.length;
  const stack = Math.max(1, shown.length + (more > 0 ? 1 : 0));
  const mid = (stack - 1) / 2;
  const gridRow = Math.max(mid + 1.75, stack);
  const nodes = [];
  const links = [];

  nodes.push({
    id: 'threat', col: 0, row: mid, kind: 'threat', tag: 'Threat', title: a.threat_name,
    detail: `likelihood ${s.threat_probability} on its own`,
    onClick: () => onGo('about', 'risk-threat'),
  });

  shown.forEach((o, i) => {
    const inPlace = IN_PLACE.has(o.status);
    nodes.push({
      id: `o-${o.control_id}`, col: 1, row: i, kind: 'control',
      tone: o.sets ? 'good' : o.status === 'operational' ? 'good' : o.status === 'degraded' ? 'warn'
        : o.status === 'not_applicable' ? 'quiet' : 'bad',
      tag: [shortRef(o.ref), o.sets ? 'sets it' : STATE[o.status] || o.status].filter(Boolean).join(' · '),
      title: o.title,
      detail: inPlace ? (o.judged ? `brings it to ${o.now}` : 'effect not judged') : null,
      onClick: () => onGo('why', `risk-objective-${o.control_id}`),
    });
    links.push({ from: 'threat', to: `o-${o.control_id}`, arrow: false, dashed: !inPlace });
    if (inPlace) links.push({ from: `o-${o.control_id}`, to: 'likelihood', strong: o.sets });
  });
  if (more > 0) {
    nodes.push({
      id: 'more', col: 1, row: shown.length, tone: 'quiet', tag: 'Objectives', title: `${more} more`,
      detail: 'see them all', onClick: () => onGo('why', 'why'),
    });
    links.push({ from: 'threat', to: 'more', arrow: false, dashed: true });
  }
  if (!objectives.length) {
    nodes.push({
      id: 'none', col: 1, row: 0, tone: 'bad', tag: 'Objectives', title: 'None counters this threat',
      detail: 'nothing can lower it here', onClick: () => onGo('why', 'why'),
    });
    links.push({ from: 'threat', to: 'none', arrow: false, dashed: true });
  }

  const lowered = s.probability[d] < s.threat_probability;
  nodes.push({
    id: 'likelihood', col: 2, row: mid, kind: 'risk', tone: lowered ? 'good' : 'bad',
    tag: `Likelihood now · ${LETTER[d]}`, title: probabilityLabel(s.probability[d]),
    detail: lowered ? `down from ${s.threat_probability}` : 'nothing in place lowers it',
    onClick: () => onGo('score', 'score'),
  });
  // An objective in place but not lowering it still feeds the box; with none in
  // place the threat's own likelihood runs straight through.
  if (!objectives.some((o) => IN_PLACE.has(o.status))) links.push({ from: 'threat', to: 'likelihood', dashed: true });

  const assets = s.assets || [];
  const top = assets[0];
  nodes.push(top ? {
    id: 'asset', col: 0, row: gridRow, kind: 'asset', tag: `Asset · ${LETTER[d]} ${top[d] ?? "–"}`,
    title: top.name, detail: assets.length > 1 ? `and ${assets.length - 1} more held` : `${DIM[d]} impact ${impactLabel(s.impact[d])}`,
    onClick: () => onGo('about', `risk-asset-${top.id}`),
  } : {
    id: 'asset', col: 0, row: gridRow, kind: 'asset', tone: 'bad', tag: 'Information asset',
    title: 'None linked', detail: 'impact is not rated', onClick: () => onGo('about', 'risk-assets'),
  });

  const gridRowTarget = s.target != null && s.target < s.now;
  nodes.push({
    id: 'grid', col: 3, row: gridRow, w: 220, h: 212, framed: true,
    ariaLabel: `Score ${s.now}: likelihood ${s.probability[d]} by impact ${s.impact[d]} on ${DIM[d]}. Open the score.`,
    render: () => (
      <RiskGrid size="small" marked={{ impact: s.impact[d], likelihood: s.probability[d] }}
        label={a.system_name} named caption={DIM[d]} ariaLabel={`${a.system_name}: score ${s.now}`} />
    ),
    onClick: () => onGo('score', 'score'),
  });
  // The values written on the lines into the grid: what each axis is given.
  links.push({ from: 'likelihood', to: 'grid', into: 'top', label: `likelihood ${s.probability[d]}` });
  links.push({ from: 'asset', to: 'grid', label: `impact ${s.impact[d]}` });

  if (gridRowTarget) {
    nodes.push({
      id: 'target', col: 2, row: mid + 1, tone: 'quiet', tag: 'After committed work', title: `Score ${s.target}`,
      detail: 'what the open actions bring it to', onClick: () => onGo('work', 'work'),
    });
  }

  const label = `${a.threat_name} on ${a.system_name}: ${DIM[d]} likelihood ${s.probability[d]}`
    + `${lowered ? `, down from ${s.threat_probability}` : ', nothing in place lowers it'}; impact ${s.impact[d]}`
    + `${top ? ` from ${top.name}` : ''}; score ${s.now}.`;
  return { nodes, links, label };
}

export function RiskScoreDiagram({ answer, onGo }) {
  const { nodes, links, label } = riskScoreNodes(answer, onGo);
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
