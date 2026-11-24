// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RatingChip } from './RatingChip';
import { bandStripe } from './SystemRisksDiagram';
import { serviceSystemsOf } from './ServiceRisksDiagram';
import { departmentColour } from '../utils/departmentColour';

// A business service's systems as pictures (owner, 2026-11-19;
// docs/relation-diagrams.md), at the head of its Systems and Information
// assets tabs.
//
// Systems tab, one band per system:
//
//   Department ──┬─▶ System ──┬─▶ my information asset ─┬─▶ Worst risk [chip]
//                │            └─▶ my information asset ─┘
//                └─▶ System (dependency only) ─ ─ ─ ─ ─ ─▶ Worst risk [chip]
//
// Each department running one of the service's systems, in its colour, with
// its systems; each system with the information the service holds in it (its
// "stake"; a system the service only depends on holds none) and its worst risk.
//
// Information assets tab, the inverse:
//
//   my information asset ──┬─▶ System [worst risk]
//                          └─▶ System [worst risk]
//
//   service  GET /services/:id (department_id, linked_systems with asset_ids,
//            linked_information_assets, risk_paths)

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const top = (a) => Math.max(a.confidentiality ?? 0, a.integrity ?? 0, a.availability ?? 0);
const impactChip = (v) => (v ? <RatingChip value={v} scale="impact" variant="number" /> : null);
const riskChip = (v) => (v != null ? <RatingChip value={v} scale="risk" variant="number" /> : null);
// A box title wraps to two lines past about this many characters, leaving no
// room for a detail line.
const fitsOneLine = (t) => (t || '').length <= 24;

function systemsWithAssets(service) {
  const assets = new Map((service.linked_information_assets || []).map((a) => [a.id, a]));
  return serviceSystemsOf(service).map((s) => ({
    ...s,
    mine: (s.asset_ids || []).map((id) => assets.get(id)).filter(Boolean)
      .sort((x, y) => top(y) - top(x) || x.name.localeCompare(y.name)),
  }));
}

export function serviceSystemsNodes(service, { active = null, onDepartment = () => {}, onSystem = () => {}, onAsset = () => {}, onRisk = () => {} } = {}) {
  const owner = service.owner_department_id || service.department_id;
  const systems = systemsWithAssets(service);
  // Departments: the service's own first, then by how many systems they run.
  const by = new Map();
  for (const s of systems) {
    const key = s.department_id || 'none';
    if (!by.has(key)) by.set(key, { id: key, name: s.department_name || 'No department', systems: [] });
    by.get(key).systems.push(s);
  }
  const depts = [...by.values()].sort((x, y) => Number(y.id === owner) - Number(x.id === owner)
    || y.systems.length - x.systems.length || x.name.localeCompare(y.name));

  const nodes = [];
  const links = [];
  let row = 0;
  for (const d of depts) {
    const dFirst = row;
    const stripe = departmentColour(d.id === 'none' ? null : d.id);
    for (const s of d.systems) {
      const span = Math.max(1, s.mine.length);
      const centre = row + (span - 1) / 2;
      nodes.push({ id: `s-${s.id}`, col: 1, row: centre, kind: 'asset', stripe,
        tone: s.mine.length ? null : 'quiet',
        tag: s.mine.length ? `System · ${plural(s.mine.length, 'asset')}` : 'Dependency only', title: s.name,
        ariaLabel: `${s.name}, ${d.name}: ${s.mine.length ? `holds ${plural(s.mine.length, 'of the service’s information assets')}` : 'holds none of the service’s information, a dependency only'}. Open it.`,
        onClick: () => onSystem(s.id) });
      links.push({ from: `d-${d.id}`, to: `s-${s.id}`, arrow: false });
      s.mine.forEach((a, k) => {
        const id = `a-${s.id}-${a.id}`;
        nodes.push({ id, col: 2, row: row + k, kind: 'asset', stripe: departmentColour(a.department_id),
          tag: a.is_shared ? 'Information asset · shared' : 'Information asset', title: a.name, badge: impactChip(top(a)),
          onClick: () => onAsset(a.id) });
        links.push({ from: `s-${s.id}`, to: id, arrow: false });
        links.push({ from: id, to: `w-${s.id}` });
      });
      const w = s.risks[0];
      nodes.push(w ? {
        id: `w-${s.id}`, col: 3, row: centre, kind: 'threat', stripe: bandStripe(w.risk_score),
        tag: 'Worst risk', title: w.threat_name, badge: riskChip(w.risk_score),
        detail: s.risks.length > 1 && fitsOneLine(w.threat_name) ? `of ${plural(s.risks.length, 'risk')}` : null,
        ariaLabel: `Worst risk on ${s.name}: ${w.threat_name}, ${w.risk_score}. Open it.`, onClick: () => onRisk(w.risk_id),
      } : {
        id: `w-${s.id}`, col: 3, row: centre, tone: 'good', tag: 'Worst risk', title: 'None active',
        detail: 'no threat assessed against it',
      });
      if (!s.mine.length) links.push({ from: `s-${s.id}`, to: `w-${s.id}`, dashed: true });
      row += span;
    }
    nodes.push({ id: `d-${d.id}`, col: 0, row: dFirst + (row - 1 - dFirst) / 2, kind: 'people', stripe,
      selected: active === `dept:${d.id}`, tag: d.id === owner ? 'Department · owner' : 'Department', title: d.name,
      detail: fitsOneLine(d.name) ? plural(d.systems.length, 'system') : null,
      ariaLabel: `${d.name}${d.id === owner ? ', the service’s owner' : ''}: runs ${plural(d.systems.length, 'of its systems')}. List them.`,
      onClick: () => onDepartment(`dept:${d.id}`) });
  }
  if (!systems.length) {
    nodes.push({ id: 's-none', col: 0, row: 0, tone: 'bad', tag: 'Systems', title: 'None linked', detail: 'link them below' });
  }

  const label = `${service.name} is delivered by ${plural(systems.length, 'system')} run by ${plural(depts.length, 'department')}: `
    + depts.map((d) => `${d.name} (${d.systems.map((s) => `${s.name}: ${s.mine.length ? s.mine.map((a) => a.name).join(', ') : 'dependency only'}; worst risk ${s.worst ?? 'none'}`).join('. ')})`).join('; ')
    + '.';
  return { nodes, links, label, depts };
}

export function serviceAssetsNodes(service, { active = null, onAsset = () => {}, onSystem = () => {} } = {}) {
  const systems = systemsWithAssets(service);
  const assets = [...(service.linked_information_assets || [])].sort((x, y) => top(y) - top(x) || x.name.localeCompare(y.name));
  const row = new Map(assets.map((a, k) => [a.id, k]));
  const holding = systems.filter((s) => s.mine.length);
  const centre = (s) => s.mine.reduce((m, a) => m + row.get(a.id), 0) / s.mine.length;
  holding.sort((x, y) => centre(x) - centre(y) || x.name.localeCompare(y.name));
  const stack = Math.max(assets.length, holding.length, 1);
  const aBase = (stack - assets.length) / 2;
  const sBase = (stack - holding.length) / 2;
  const nodes = [];
  const links = [];
  // A chosen asset lights its lines and the systems holding it in its colour,
  // fading the rest, so its way through the shared trunk can be followed.
  const chosen = assets.find((a) => active === `asset:${a.id}`) || null;
  const lit = chosen ? departmentColour(chosen.department_id) : null;

  assets.forEach((a, k) => {
    const n = holding.filter((s) => s.mine.some((m) => m.id === a.id)).length;
    nodes.push({ id: `a-${a.id}`, col: 0, row: aBase + k, kind: 'asset', stripe: departmentColour(a.department_id),
      selected: chosen?.id === a.id,
      tag: a.is_shared ? 'Information asset · shared' : 'Information asset', title: a.name, badge: impactChip(top(a)),
      detail: fitsOneLine(a.name) ? `in ${plural(n, 'system')}` : null,
      ariaLabel: `${a.name}, ${a.department_name || 'no department'}, impact ${top(a) || 'not rated'}: held in ${plural(n, 'system')}. Show them.`,
      onClick: () => onAsset(a.id) });
  });
  holding.forEach((s, k) => {
    const holds = chosen && s.mine.some((m) => m.id === chosen.id);
    nodes.push({ id: `s-${s.id}`, col: 1, row: sBase + k, kind: 'asset', stripe: departmentColour(s.department_id),
      ...(chosen ? (holds ? { lit } : { faded: true }) : {}),
      tag: 'System', title: s.name, badge: riskChip(s.worst),
      detail: fitsOneLine(s.name) ? s.department_name : null,
      ariaLabel: `${s.name}, ${s.department_name || 'no department'}${s.worst != null ? `, worst risk ${s.worst}` : ''}. Open it.`,
      onClick: () => onSystem(s.id) });
    for (const a of s.mine) {
      links.push({ from: `a-${a.id}`, to: `s-${s.id}`, ...(chosen ? (a.id === chosen.id ? { lit } : { faded: true }) : {}) });
    }
  });
  if (!assets.length) {
    nodes.push({ id: 'a-none', col: 0, row: 0, tone: 'bad', tag: 'Information assets', title: 'None held',
      detail: 'its systems hold none of yours' });
  }

  const label = `${service.name} touches ${plural(assets.length, 'information asset')}: `
    + assets.map((a) => `${a.name} (in ${holding.filter((s) => s.mine.some((m) => m.id === a.id)).map((s) => s.name).join(', ') || 'no system'})`).join(', ')
    + '.';
  return { nodes, links, label };
}

export function ServiceSystemsDiagram({ service, active, onDepartment, onSystem, onAsset, onRisk }) {
  const { nodes, links, label } = serviceSystemsNodes(service, { active, onDepartment, onSystem, onAsset, onRisk });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}

export function ServiceAssetsDiagram({ service, active, onAsset, onSystem }) {
  const { nodes, links, label } = serviceAssetsNodes(service, { active, onAsset, onSystem });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
