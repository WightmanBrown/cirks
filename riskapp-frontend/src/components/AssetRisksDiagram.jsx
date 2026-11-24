// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RatingChip } from './RatingChip';
import { bandStripe } from './SystemRisksDiagram';
import { departmentColour } from '../utils/departmentColour';
import { riskWord } from '../utils/ratingScale';

// "Risks to this information asset" as a picture (owner, 2026-11-19;
// docs/relation-diagrams.md), the folded view of an asset's Risks tab:
//
//                         ┌─▶ System ●──┬─▶ Risk [chip]
//   Information asset ────┼─▶ System    ├─▶ Risk [chip]
//                         └─▶ System    └─▶ Risk [chip]
//
// An asset has no risks of its own: it is harmed by the risks of the systems
// holding it. The asset wears its department's colour, each system its own
// department's, so information held in another department's system stands
// out. The systems are a selector, worst risk first, each a layer: the chosen
// one draws its risks (worst first, in its band's colour), each named by its
// threat. (A threat column was tried and dropped, owner 2026-11-19: it only
// repeated the risks' names.)
//
//   asset  GET /assets/:id (name, department_id/name, is_shared, C/I/A,
//          linked_systems, risk_paths: one row per active risk on its systems)

const MAX_RISKS = 8;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// A box title wraps to two lines past about this many characters, leaving no
// room for a detail line.
const fitsOneLine = (t) => (t || '').length <= 24;
const chip = (v, scale) => (v ? <RatingChip value={v} scale={scale} variant="number" /> : null);

// The asset's systems, worst risk first, each with its risks worst first.
// A system holding it with no active risk is still one of them.
export function assetSystemsOf(asset) {
  const paths = asset.risk_paths || [];
  const by = new Map((asset.linked_systems || []).map((s) => [s.id, { ...s, risks: [] }]));
  for (const p of paths) {
    if (!by.has(p.system_id)) {
      by.set(p.system_id, { id: p.system_id, name: p.system_name, department_id: p.system_department_id, risks: [] });
    }
    const s = by.get(p.system_id);
    if (!s.risks.some((r) => r.risk_id === p.risk_id)) s.risks.push(p);
  }
  return [...by.values()].map((s) => {
    const risks = [...s.risks].sort((x, y) => (y.risk_score ?? 0) - (x.risk_score ?? 0) || x.threat_name.localeCompare(y.threat_name));
    return { ...s, risks, worst: risks[0]?.risk_score ?? null };
  }).sort((x, y) => (y.worst ?? -1) - (x.worst ?? -1) || x.name.localeCompare(y.name));
}

export function assetRisksNodes(asset, selectedId, { onSelect = () => {}, onAsset = () => {}, onRisk = () => {} } = {}) {
  const systems = assetSystemsOf(asset);
  const sel = Math.max(0, systems.findIndex((s) => s.id === selectedId));
  const chosen = systems[sel];
  const impact = Math.max(asset.confidentiality ?? 0, asset.integrity ?? 0, asset.availability ?? 0);
  const nodes = [];
  const links = [];

  const risks = chosen ? chosen.risks.slice(0, MAX_RISKS) : [];
  const more = chosen ? chosen.risks.length - risks.length : 0;
  const count = Math.max(risks.length + (more ? 1 : 0), 1);
  // The chosen system's layer, lined up with it where it can be.
  const base = Math.max(0, sel - (count - 1) / 2);
  const mid = base + (count - 1) / 2;

  nodes.push({ id: 'asset', col: 0, row: Math.max(0, (systems.length - 1) / 2), kind: 'asset',
    stripe: departmentColour(asset.department_id),
    tag: asset.is_shared ? 'Information asset · shared' : 'Information asset', title: asset.name,
    detail: fitsOneLine(asset.name) ? asset.department_name : null, badge: chip(impact, 'impact'),
    ariaLabel: `${asset.name}, ${asset.department_name || 'no department'}: held in ${plural(systems.length, 'system')}. List all its risks.`,
    onClick: onAsset });

  systems.forEach((s, k) => {
    nodes.push({ id: `s-${s.id}`, col: 1, row: k, kind: 'asset', stripe: departmentColour(s.department_id),
      selected: k === sel, tone: s.risks.length ? null : 'quiet',
      tag: `System · ${plural(s.risks.length, 'risk')}`, title: s.name,
      // Another department's system names its department where the title leaves
      // room (one line); its colour says so either way.
      detail: s.department_id !== asset.department_id && fitsOneLine(s.name) ? s.department_name : null,
      badge: chip(s.worst, 'risk'),
      ariaLabel: `${s.name}, ${s.department_name || 'another department'}: ${plural(s.risks.length, 'risk')}${s.worst != null ? `, worst ${s.worst}` : ''}. Show them.`,
      onClick: () => onSelect(s.id) });
    links.push({ from: 'asset', to: `s-${s.id}`, arrow: false, strong: k === sel });
  });
  if (!systems.length) {
    nodes.push({ id: 's-none', col: 1, row: 0, tone: 'bad', tag: 'Systems', title: 'Held in none',
      detail: 'link it to the systems holding it' });
    links.push({ from: 'asset', to: 's-none', dashed: true });
    return { nodes, links, label: `${asset.name} is held in no system yet, so no risk reaches it.`, systems };
  }

  risks.forEach((r, k) => {
    const w = riskWord(r.risk_score);
    nodes.push({ id: `r-${r.risk_id}`, col: 2, row: base + k, kind: 'threat', stripe: bandStripe(r.risk_score),
      // A risk is named by its threat, as everywhere else; its band is the chip's
      // colour and, where the title leaves room, a word beneath.
      tag: 'Risk', title: r.threat_name, detail: w && fitsOneLine(r.threat_name) ? `${w} risk` : null,
      badge: chip(r.risk_score, 'risk'),
      ariaLabel: `${r.threat_name} on ${chosen.name}: risk ${r.risk_score}. Open it.`,
      onClick: () => onRisk(r.risk_id) });
    links.push({ from: `s-${chosen.id}`, to: `r-${r.risk_id}` });
  });
  if (more) {
    nodes.push({ id: 'r-more', col: 2, row: base + risks.length, tone: 'quiet', tag: 'Risks',
      title: `${more} more`, detail: 'list them below', onClick: () => onSelect(chosen.id, true) });
    links.push({ from: `s-${chosen.id}`, to: 'r-more', dashed: true });
  }
  if (!chosen.risks.length) {
    nodes.push({ id: 'r-none', col: 2, row: mid, tone: 'good', tag: 'Risks', title: 'None active',
      detail: 'no threat assessed against it' });
    links.push({ from: `s-${chosen.id}`, to: 'r-none', dashed: true });
  }

  const label = `${asset.name}, ${asset.department_name || 'no department'}, is held in ${plural(systems.length, 'system')}: `
    + systems.map((s) => `${s.name} (${plural(s.risks.length, 'risk')}${s.worst != null ? `, worst ${s.worst}` : ''})`).join(', ')
    + `. Showing ${chosen.name}: ${chosen.risks.map((r) => `${r.threat_name} ${r.risk_score}`).join(', ') || 'no active risks'}.`;
  return { nodes, links, label, systems, chosen };
}

export function AssetRisksDiagram({ asset, selected, onSelect, onAsset, onRisk }) {
  const { nodes, links, label } = assetRisksNodes(asset, selected, { onSelect, onAsset, onRisk });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
