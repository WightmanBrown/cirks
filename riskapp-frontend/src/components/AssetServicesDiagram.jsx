// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RatingChip } from './RatingChip';
import { departmentColour } from '../utils/departmentColour';

// An information asset's linked services as a picture (owner, 2026-11-19;
// docs/relation-diagrams.md), at the head of its Linked services tab:
//
//                         ┌─▶ System ──┬─▶ Business service
//   Information asset ────┼─▶ System ──┴─▶ Business service
//                         └─▶ System     (no service)
//
// A service is never linked to an asset by hand (v104): it touches the asset
// when one of its systems holds it and the asset is the service's department's
// (or shared). The picture shows that path: the systems holding the asset, and
// the services each delivers that count it. Each service wears its owning
// department's colour; a system holding the asset for no service is drawn
// quiet. A chosen service lights its lines and systems and fades the rest, so
// its way through the shared trunk can be followed.
//
//   asset  GET /assets/:id (name, department_id, C/I/A, linked_systems,
//          linked_services with system_ids)

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fitsOneLine = (t) => (t || '').length <= 24;
const top = (x) => Math.max(x.confidentiality ?? 0, x.integrity ?? 0, x.availability ?? 0);
const chip = (v) => (v ? <RatingChip value={v} scale="impact" variant="number" /> : null);
export const ownerOf = (s) => s.owner_department_id || s.department_id;

export function assetServicesNodes(asset, { active = null, onService = () => {}, onSystem = () => {}, onAsset = () => {} } = {}) {
  const services = asset.linked_services || [];
  const serving = (sysId) => services.filter((s) => (s.system_ids || []).includes(sysId));
  // Systems delivering the most of its services first; those delivering none last.
  const systems = [...(asset.linked_systems || [])].sort((x, y) => serving(y.id).length - serving(x.id).length
    || x.name.localeCompare(y.name));
  const sysRow = new Map(systems.map((s, k) => [s.id, k]));
  const centre = (s) => {
    const rows = (s.system_ids || []).filter((id) => sysRow.has(id)).map((id) => sysRow.get(id));
    return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : systems.length;
  };
  const ordered = [...services].sort((x, y) => centre(x) - centre(y) || x.name.localeCompare(y.name));
  const stack = Math.max(systems.length, ordered.length, 1);
  const yBase = (stack - systems.length) / 2;
  const vBase = (stack - ordered.length) / 2;
  const chosen = ordered.find((s) => active === `svc:${s.id}`) || null;
  const lit = chosen ? departmentColour(ownerOf(chosen)) : null;
  const nodes = [];
  const links = [];

  nodes.push({ id: 'asset', col: 0, row: (stack - 1) / 2, kind: 'asset', stripe: departmentColour(asset.department_id),
    selected: active === 'all',
    tag: asset.is_shared ? 'Information asset · shared' : 'Information asset', title: asset.name,
    detail: fitsOneLine(asset.name) ? asset.department_name : null, badge: chip(top(asset)),
    ariaLabel: `${asset.name}: held in ${plural(systems.length, 'system')}, touched by ${plural(services.length, 'business service')}. List them all.`,
    onClick: onAsset });

  systems.forEach((y, k) => {
    const n = serving(y.id).length;
    const on = chosen && (chosen.system_ids || []).includes(y.id);
    nodes.push({ id: `y-${y.id}`, col: 1, row: yBase + k, kind: 'asset', stripe: departmentColour(y.department_id),
      tone: n ? null : 'quiet', ...(chosen ? (on ? { lit } : { faded: true }) : {}),
      tag: n ? `System · ${plural(n, 'service')}` : 'System · no service', title: y.name,
      detail: y.department_id !== asset.department_id && fitsOneLine(y.name) ? y.department_name : null,
      ariaLabel: `${y.name}, ${y.department_name || 'no department'}: holds it for ${plural(n, 'of these services')}. Open it.`,
      onClick: () => onSystem(y.id) });
    links.push({ from: 'asset', to: `y-${y.id}`, arrow: false, dashed: !n, ...(chosen ? (on ? { lit } : { faded: true }) : {}) });
  });

  ordered.forEach((s, k) => {
    const via = (s.system_ids || []).filter((id) => sysRow.has(id));
    nodes.push({ id: `v-${s.id}`, col: 2, row: vBase + k, stripe: departmentColour(ownerOf(s)),
      selected: chosen?.id === s.id, ...(chosen && chosen.id !== s.id ? { faded: true } : {}),
      tag: 'Business service', title: s.name, badge: chip(top(s)),
      detail: fitsOneLine(s.name) ? `via ${plural(via.length, 'system')}` : null,
      ariaLabel: `${s.name}, ${s.owner_department_name || s.department_name || 'no department'}: touches it through ${plural(via.length, 'system')}. Show them.`,
      onClick: () => onService(s.id) });
    for (const id of via) {
      links.push({ from: `y-${id}`, to: `v-${s.id}`, ...(chosen ? (chosen.id === s.id ? { lit } : { faded: true }) : {}) });
    }
  });

  if (!systems.length) {
    nodes.push({ id: 'y-none', col: 1, row: 0, tone: 'bad', tag: 'Systems', title: 'Held in none',
      detail: 'so no service touches it' });
    links.push({ from: 'asset', to: 'y-none', dashed: true });
  } else if (!services.length) {
    nodes.push({ id: 'v-none', col: 2, row: (stack - 1) / 2, tone: 'quiet', tag: 'Business services', title: 'None',
      detail: 'its systems deliver none of its department’s' });
  }

  const label = `${asset.name} is held in ${plural(systems.length, 'system')} and touched by ${plural(services.length, 'business service')}: `
    + ordered.map((s) => `${s.name} (through ${(s.system_ids || []).map((id) => systems.find((y) => y.id === id)?.name).filter(Boolean).join(', ')})`).join('; ')
    + '.';
  return { nodes, links, label, chosen };
}

export function AssetServicesDiagram({ asset, active, onService, onSystem, onAsset }) {
  const { nodes, links, label } = assetServicesNodes(asset, { active, onService, onSystem, onAsset });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
