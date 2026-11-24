// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RiskGrid } from './RiskGrid';
import { RatingChip } from './RatingChip';

// A system's threats as a picture (owner, 2026-11-19; docs/relation-diagrams.md),
// the folded view of its Threats tab, drawn as How bad is it? is:
//
//   External · Deliberate ●──┬─ Threat L5 ─┐   ┌─ objective ─┐
//   External · Accidental    ├─ Threat L4 ─┼───┼─ objective ─┼──▶ Likelihood now ──╮
//   Internal · Deliberate    │             │   └─ objective ─┘                    ▼
//   …                        │                       Information asset ─────▶ the grid
//
// Down the left, every combination of where a threat comes from (external,
// internal, natural) and its category (deliberate, accidental, environmental)
// found on the system: a selector, one chosen at a time, each a layer. The
// chosen one draws its threats (each with its likelihood now, or its own when
// not yet assessed), the control objectives against them with their state here
// (those in place feeding the likelihood), the highest likelihood among them,
// and the grid on the right counting their risks square by square, with the
// information asset rated highest running in from the side as the impact.
//
//   system    GET /systems/:id (threats with threat_source, threat_category,
//             threat_likelihood, grid_likelihood, grid_impact; information_assets; name)
//   security  GET /systems/:id/security (objectives with the threats calling for them)
//   controls  GET /systems/:id/controls (each objective's state on the system)

export const SOURCE = { external: 'External', internal: 'Internal', natural: 'Natural' };
export const CATEGORY = { deliberate: 'Deliberate', accidental: 'Accidental', environmental: 'Environmental' };
export const STRIPE = { external: 'var(--graph-threat)', internal: 'var(--amber)', natural: 'var(--ppitf-facility)' };
const ORDER_S = ['external', 'internal', 'natural'];
const ORDER_C = ['deliberate', 'accidental', 'environmental'];
const MAX_OBJECTIVES = 6;
export const STATE = { operational: 'in place', degraded: 'degraded', missing: 'missing', unknown: 'not checked',
  not_applicable: 'not applicable', not_recorded: 'not recorded' };
export const IN_PLACE = new Set(['operational', 'degraded']);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const word = (map, k) => map[k] || (k ? k[0].toUpperCase() + k.slice(1) : 'Not stated');
const likelihoodOf = (t) => (t.assessed ? t.grid_likelihood : t.threat_likelihood);
const top = (a) => Math.max(a.confidentiality ?? 0, a.integrity ?? 0, a.availability ?? 0);
export const shortRef = (ref) => (ref ? ref.replace(/^CIRKS1\./, '') : null);

// The combinations of source and category the system's threats fall in, in a
// fixed order, each with its threats most likely first.
export function combinationsOf(threats) {
  const by = new Map();
  for (const t of threats) {
    const key = `${t.threat_source || 'none'}/${t.threat_category || 'none'}`;
    if (!by.has(key)) by.set(key, { key, source: t.threat_source || null, category: t.threat_category || null, threats: [] });
    by.get(key).threats.push(t);
  }
  const rank = (list, k) => (list.includes(k) ? list.indexOf(k) : list.length);
  return [...by.values()]
    .sort((x, y) => rank(ORDER_S, x.source) - rank(ORDER_S, y.source) || rank(ORDER_C, x.category) - rank(ORDER_C, y.category))
    .map((c) => ({
      ...c,
      word: `${word(SOURCE, c.source)} · ${word(CATEGORY, c.category)}`,
      stripe: STRIPE[c.source] || 'var(--ppitf-people)',
      threats: [...c.threats].sort((x, y) => Number(y.assessed) - Number(x.assessed)
        || (likelihoodOf(y) ?? 0) - (likelihoodOf(x) ?? 0) || x.name.localeCompare(y.name)),
    }));
}

export function systemThreatsNodes(system, security, controls, selectedKey,
  { onSelect = () => {}, onThreat = () => {}, onObjective = () => {}, onGrid = () => {}, onAsset = () => {} } = {}) {
  const combos = combinationsOf(system.threats || []);
  const sel = Math.max(0, combos.findIndex((c) => c.key === selectedKey));
  const chosen = combos[sel];
  const nodes = [];
  const links = [];

  combos.forEach((c, k) => {
    const top1 = Math.max(0, ...c.threats.map((t) => likelihoodOf(t) ?? 0));
    nodes.push({ id: `c-${c.key}`, col: 0, row: k, kind: 'threat', stripe: c.stripe, selected: k === sel,
      tag: plural(c.threats.length, 'threat'), title: c.word,
      badge: top1 ? <RatingChip value={top1} scale="probability" variant="number" /> : null,
      ariaLabel: `${c.word}: ${plural(c.threats.length, 'threat')}, likelihood up to ${top1 || 'not set'}. Show them.`,
      onClick: () => onSelect(c.key) });
  });
  if (!chosen) return { nodes, links, label: `No threats identified against ${system.name}.`, combos };

  // The chosen layer: its threats, lined up with it where they can be.
  const threats = chosen.threats;
  const names = new Set(threats.map((t) => t.name));
  const status = new Map((controls || []).map((c) => [c.id, c.status]));
  const objectives = (security?.objectives || [])
    .filter((o) => (o.threats || []).some((n) => names.has(n)))
    .map((o) => ({ ...o, status: status.get(o.control_id) || 'not_recorded' }));
  const rank = (o) => (o.status === 'operational' ? 0 : o.status === 'degraded' ? 1 : o.status === 'not_applicable' ? 3 : 2);
  objectives.sort((x, y) => rank(x) - rank(y) || x.title.localeCompare(y.title));
  const shown = objectives.slice(0, MAX_OBJECTIVES);
  const more = objectives.length - shown.length;
  const stack = Math.max(threats.length, shown.length + (more ? 1 : 0), 1);
  const base = Math.max(0, sel - (stack - 1) / 2);
  const mid = base + (stack - 1) / 2;
  const tBase = mid - (threats.length - 1) / 2;
  const oBase = mid - (shown.length + (more ? 1 : 0) - 1) / 2;

  threats.forEach((t, k) => {
    const l = likelihoodOf(t);
    nodes.push({ id: `t-${t.id}`, col: 1, row: tBase + k, kind: 'threat', stripe: chosen.stripe,
      tone: t.assessed ? null : 'warn', tag: t.assessed ? 'Threat' : 'Threat · not assessed', title: t.name,
      badge: l != null ? <RatingChip value={l} scale="probability" variant="number" /> : null,
      ariaLabel: `${t.name}: likelihood ${l ?? 'not set'}${t.assessed ? `, risk ${t.risk_score}` : ', not yet assessed'}. Open it.`,
      onClick: () => onThreat(t) });
    links.push({ from: `c-${chosen.key}`, to: `t-${t.id}`, arrow: false });
    // Each threat to the objectives against it.
    for (const o of shown) if ((o.threats || []).includes(t.name)) links.push({ from: `t-${t.id}`, to: `o-${o.control_id}`, arrow: false, dashed: !IN_PLACE.has(o.status) });
    if (more && objectives.slice(MAX_OBJECTIVES).some((o) => (o.threats || []).includes(t.name))) links.push({ from: `t-${t.id}`, to: 'o-more', arrow: false, dashed: true });
  });

  shown.forEach((o, k) => {
    const inPlace = IN_PLACE.has(o.status);
    nodes.push({ id: `o-${o.control_id}`, col: 2, row: oBase + k, kind: 'control',
      tone: o.status === 'operational' ? 'good' : o.status === 'degraded' ? 'warn' : o.status === 'not_applicable' ? 'quiet' : 'bad',
      tag: [shortRef(o.reference_code), STATE[o.status] || o.status].filter(Boolean).join(' · '), title: o.title,
      onClick: () => onObjective(o.control_id) });
    if (inPlace) links.push({ from: `o-${o.control_id}`, to: 'likelihood' });
  });
  if (more) {
    nodes.push({ id: 'o-more', col: 2, row: oBase + shown.length, tone: 'quiet', tag: 'Objectives',
      title: `${more} more`, detail: 'on the Control objectives tab', onClick: () => onObjective(null) });
  }
  if (!objectives.length) {
    nodes.push({ id: 'o-none', col: 2, row: mid, tone: 'bad', tag: 'Objectives', title: 'None against these threats',
      detail: 'nothing lowers their likelihood', onClick: () => onObjective(null) });
    for (const t of threats) links.push({ from: `t-${t.id}`, to: 'o-none', arrow: false, dashed: true });
  }

  const assessed = threats.filter((t) => t.assessed);
  const highest = Math.max(0, ...threats.map((t) => likelihoodOf(t) ?? 0));
  nodes.push({ id: 'likelihood', col: 3, row: mid, kind: 'risk',
    tag: 'Likelihood now', title: highest ? `Up to ${highest}` : 'Not set',
    detail: threats.length > 1 ? `across ${plural(threats.length, 'threat')}` : threats[0].name,
    badge: highest ? <RatingChip value={highest} scale="probability" variant="number" /> : null,
    onClick: onGrid });
  if (!objectives.some((o) => IN_PLACE.has(o.status))) {
    for (const t of threats) links.push({ from: `t-${t.id}`, to: 'likelihood', dashed: true });
  }

  // On the right, the grid: these threats' risks counted square by square, the
  // likelihood dropping in from above and the impact from the side.
  const lastRow = Math.max(combos.length - 1, base + stack - 1);
  const gridRow = Math.max(mid + 1.75, lastRow + 1.25);
  const count = (i, p) => assessed.filter((t) => t.grid_impact === i && t.grid_likelihood === p).length;
  nodes.push({ id: 'grid', col: 4, row: gridRow, w: 220, h: 212, framed: true,
    ariaLabel: `${system.name}: ${plural(assessed.length, 'risk')} from ${chosen.word.toLowerCase()} threats. Open the risk register.`,
    render: () => <RiskGrid size="small" countAt={count} label={system.name} named caption="risk count" ariaLabel={`${system.name}: risk count`} />,
    onClick: onGrid });
  links.push({ from: 'likelihood', to: 'grid', into: 'top', label: highest ? `likelihood ${highest}` : undefined });
  const assets = [...(system.information_assets || [])].sort((x, y) => top(y) - top(x) || x.name.localeCompare(y.name));
  const a = assets[0];
  nodes.push(a ? {
    id: 'asset', col: 2, row: gridRow, kind: 'asset',
    tag: `Asset · C${a.confidentiality ?? '–'} I${a.integrity ?? '–'} A${a.availability ?? '–'}`, title: a.name,
    detail: assets.length > 1 ? `and ${assets.length - 1} more held` : null, onClick: () => onAsset(a.id),
  } : {
    id: 'asset', col: 2, row: gridRow, kind: 'asset', tone: 'bad', tag: 'Information asset', title: 'None held',
    detail: 'so the impact is not rated',
  });
  links.push({ from: 'asset', to: 'grid', label: a ? `impact ${top(a)}` : undefined });

  const label = `${plural((system.threats || []).length, 'threat')} identified against ${system.name}, in `
    + `${plural(combos.length, 'combination')} of source and category: ${combos.map((c) => `${c.word} ${c.threats.length}`).join(', ')}. `
    + `Showing ${chosen.word}: ${threats.map((t) => `${t.name} (likelihood ${likelihoodOf(t) ?? 'not set'})`).join(', ')}; `
    + `${plural(objectives.length, 'control objective')} against them, ${objectives.filter((o) => IN_PLACE.has(o.status)).length} in place.`;
  return { nodes, links, label, combos, chosen };
}

export function SystemThreatsDiagram({ system, security, controls, selected, onSelect, onThreat, onObjective, onGrid, onAsset }) {
  const { nodes, links, label } = systemThreatsNodes(system, security, controls, selected,
    { onSelect, onThreat, onObjective, onGrid, onAsset });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
