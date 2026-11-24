// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RatingChip } from './RatingChip';
import { bandStripe } from './SystemRisksDiagram';
import { departmentColour } from '../utils/departmentColour';

// "Risks to this service" as a picture (owner, 2026-11-19;
// docs/relation-diagrams.md), the folded view of a business service's Risks tab:
//
//                      ┌─▶ System ●──┬─▶ Risk [chip] ─┬─▶ Information asset
//   Business service ──┼─▶ System    ├─▶ Risk [chip] ─┘
//                      └─▶ System    └─▶ Risk [chip]
//
// A service has no risks of its own: they are the risks of the systems that
// deliver it (v104). The service wears its owning department's colour, each
// system and asset its own department's, so a system another department runs
// stands out. The systems are a selector, worst risk first, each a layer: the
// chosen one draws its risks (worst first, each in its band's colour) and the
// information assets the service holds in it, which those risks would harm.
//
//   service  GET /services/:id (name, department_id, owner_department_id,
//            effective_c/i/a, linked_systems, linked_information_assets,
//            risk_paths: one row per risk × asset the service holds in its system)

const MAX_RISKS = 8;
const MAX_ASSETS = 6;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const top = (a) => Math.max(a.confidentiality ?? 0, a.integrity ?? 0, a.availability ?? 0);

// The service's systems, worst risk first, each with its risks and the
// service's assets in it.
export function serviceSystemsOf(service) {
  const paths = service.risk_paths || [];
  const assets = new Map((service.linked_information_assets || []).map((a) => [a.id, a]));
  return (service.linked_systems || []).map((s) => {
    const mine = paths.filter((p) => p.system_id === s.id);
    const risks = [...new Map(mine.map((p) => [p.risk_id, p])).values()]
      .sort((x, y) => (y.risk_score ?? 0) - (x.risk_score ?? 0) || x.threat_name.localeCompare(y.threat_name));
    const held = [...new Set(mine.map((p) => p.asset_id).filter(Boolean))].map((id) => assets.get(id)).filter(Boolean)
      .sort((x, y) => top(y) - top(x) || x.name.localeCompare(y.name));
    return { ...s, risks, assets: held, worst: risks[0]?.risk_score ?? null };
  }).sort((x, y) => (y.worst ?? -1) - (x.worst ?? -1) || x.name.localeCompare(y.name));
}

export function serviceRisksNodes(service, selectedId, { onSelect = () => {}, onService = () => {}, onRisk = () => {}, onAsset = () => {} } = {}) {
  const systems = serviceSystemsOf(service);
  const owner = service.owner_department_id || service.department_id;
  const ownerName = service.owner_department_name || service.department_name;
  // Numbers in the boxes, whatever the view: a band word does not leave the
  // tag room (the chip still wears the band's colour). The list says the word.
  const variant = 'number';
  const sel = Math.max(0, systems.findIndex((s) => s.id === selectedId));
  const chosen = systems[sel];
  const impact = Math.max(service.effective_c ?? 0, service.effective_i ?? 0, service.effective_a ?? 0);
  const nodes = [];
  const links = [];

  const risks = chosen ? chosen.risks.slice(0, MAX_RISKS) : [];
  const moreRisks = chosen ? chosen.risks.length - risks.length : 0;
  const assets = chosen ? chosen.assets.slice(0, MAX_ASSETS) : [];
  const moreAssets = chosen ? chosen.assets.length - assets.length : 0;
  const rCount = Math.max(risks.length + (moreRisks ? 1 : 0), 1);
  const aCount = Math.max(assets.length + (moreAssets ? 1 : 0), 1);
  // The chosen system's layer, lined up with it where it can be.
  const stack = Math.max(rCount, aCount);
  const base = Math.max(0, sel - (stack - 1) / 2);
  const mid = base + (stack - 1) / 2;
  const rBase = mid - (rCount - 1) / 2;
  const aBase = mid - (aCount - 1) / 2;

  nodes.push({ id: 'service', col: 0, row: Math.max(0, (systems.length - 1) / 2), stripe: departmentColour(owner),
    tag: 'Service', title: service.name, detail: service.name.length <= 24 ? ownerName : null,
    badge: impact ? <RatingChip value={impact} scale="impact" variant={variant} /> : null,
    ariaLabel: `${service.name}, owned by ${ownerName || 'no department'}: delivered by ${plural(systems.length, 'system')}. List all its risks.`,
    onClick: onService });

  systems.forEach((s, k) => {
    nodes.push({ id: `s-${s.id}`, col: 1, row: k, kind: 'asset', stripe: departmentColour(s.department_id),
      selected: k === sel, tone: s.risks.length ? null : 'quiet',
      // Another department's system names its department where the title leaves
      // room (one line); its colour says so either way.
      tag: `System · ${plural(s.risks.length, 'risk')}`, title: s.name,
      detail: s.department_id !== owner && s.name.length <= 24 ? s.department_name : null,
      badge: s.worst != null ? <RatingChip value={s.worst} scale="risk" variant={variant} /> : null,
      ariaLabel: `${s.name}, ${s.department_name || 'no department'}: ${plural(s.risks.length, 'risk')}${s.worst != null ? `, worst ${s.worst}` : ''}. Show them.`,
      onClick: () => onSelect(s.id) });
    links.push({ from: 'service', to: `s-${s.id}`, arrow: false, strong: k === sel });
  });
  if (!systems.length) {
    nodes.push({ id: 's-none', col: 1, row: 0, tone: 'bad', tag: 'Systems', title: 'None linked',
      detail: 'link the systems that deliver it' });
    links.push({ from: 'service', to: 's-none', dashed: true });
  }
  if (!chosen) return { nodes, links, label: `${service.name} is delivered by no system yet, so it has no risks.`, systems };

  risks.forEach((r, k) => {
    nodes.push({ id: `r-${r.risk_id}`, col: 2, row: rBase + k, kind: 'threat', stripe: bandStripe(r.risk_score),
      tag: 'Risk', title: r.threat_name,
      badge: <RatingChip value={r.risk_score} scale="risk" variant={variant} />,
      ariaLabel: `${r.threat_name} on ${chosen.name}: risk ${r.risk_score}. Open it.`,
      onClick: () => onRisk(r.risk_id) });
    links.push({ from: `s-${chosen.id}`, to: `r-${r.risk_id}` });
    for (const a of assets) links.push({ from: `r-${r.risk_id}`, to: `a-${a.id}` });
    if (!assets.length) links.push({ from: `r-${r.risk_id}`, to: 'a-none', dashed: true });
  });
  if (moreRisks) {
    nodes.push({ id: 'r-more', col: 2, row: rBase + risks.length, tone: 'quiet', tag: 'Risks',
      title: `${moreRisks} more`, detail: 'list them below', onClick: () => onSelect(chosen.id, true) });
    links.push({ from: `s-${chosen.id}`, to: 'r-more', dashed: true });
  }
  if (!chosen.risks.length) {
    nodes.push({ id: 'r-none', col: 2, row: mid, tone: 'good', tag: 'Risks', title: 'None active',
      detail: 'no threat assessed against it' });
    links.push({ from: `s-${chosen.id}`, to: 'r-none', dashed: true });
  }

  if (chosen.risks.length) {
    assets.forEach((a, k) => {
      nodes.push({ id: `a-${a.id}`, col: 3, row: aBase + k, kind: 'asset', stripe: departmentColour(a.department_id),
        tag: a.is_shared ? 'Information asset · shared' : 'Information asset',
        title: a.name, detail: a.department_name,
        badge: top(a) ? <RatingChip value={top(a)} scale="impact" variant={variant} /> : null,
        onClick: () => onAsset(a.id) });
    });
    if (moreAssets) {
      nodes.push({ id: 'a-more', col: 3, row: aBase + assets.length, tone: 'quiet', tag: 'Information assets',
        title: `${moreAssets} more`, detail: 'on the Systems tab' });
      for (const r of risks) links.push({ from: `r-${r.risk_id}`, to: 'a-more', dashed: true });
    }
    if (!assets.length) {
      nodes.push({ id: 'a-none', col: 3, row: mid, tone: 'quiet', tag: 'Information assets',
        title: 'None of the service’s', detail: 'a system it depends on' });
    }
  }

  const label = `${service.name}, owned by ${ownerName || 'no department'}, is delivered by ${plural(systems.length, 'system')}: `
    + systems.map((s) => `${s.name} (${plural(s.risks.length, 'risk')}${s.worst != null ? `, worst ${s.worst}` : ''})`).join(', ')
    + `. Showing ${chosen.name}: ${chosen.risks.map((r) => `${r.threat_name} ${r.risk_score}`).join(', ') || 'no active risks'}`
    + (chosen.assets.length ? `; harming ${chosen.assets.map((a) => a.name).join(', ')}.` : '.');
  return { nodes, links, label, systems, chosen };
}

export function ServiceRisksDiagram({ service, selected, onSelect, onService, onRisk, onAsset }) {
  const { nodes, links, label } = serviceRisksNodes(service, selected, { onSelect, onService, onRisk, onAsset });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
