// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RatingChip } from './RatingChip';
import { departmentColour } from '../utils/departmentColour';
import { contractState } from './SystemSuppliersDiagram';
import { supplierTypeLabel } from '../utils/supplierTypes';

// A supplier's relationships as a picture (owner, 2026-11-19;
// docs/relation-diagrams.md), at the head of its Relationships tab:
//
//              ┌─ Relationship  met 11/18 ──▶ System ──┬─▶ Information asset
//   Supplier ──┼─ Relationship  met 18/18 ──▶ System ──┴─▶ Information asset
//              └─ Relationship (component) ─┬▶ System ───▶ Information asset
//                                           └▶ N more systems ─▶ N more
//
// What we have with the supplier, how well each relationship is assured, and
// which systems it reaches: the systems are what make the supplier critical.
// Each relationship wears the colour of the department contracting it, and is
// toned by its assurance (every objective met, some unmet, none evidenced).
// A relationship through a component (a product, contractors) reaches every
// system recording it; those setting its criticality are drawn, the rest
// counted. On the right, the information the supplier may reach: the assets
// held in those systems, highest rated first (owner, 2026-11-19). A chosen
// relationship lights its way to its systems and their information.
//
//   supplier  GET /suppliers/:id (name, relationships with system_id/name,
//             component_name, department, status, contract, max_impact,
//             systems_touched, criticality_systems, objectives,
//             assurance_finding; information_assets with system_ids and
//             relationship_ids)

const MAX_SYSTEMS = 4;
const MAX_ASSETS = 8;
const top = (a) => Math.max(a.confidentiality ?? 0, a.integrity ?? 0, a.availability ?? 0);
// Short type words for a box's tag: the full ones clip it.
const SHORT = { onshore: 'Onshore', contracted_service: 'Contracted', service_provider: 'SaaS', product: 'Product' };
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fitsOneLine = (t) => (t || '').length <= 24;
const chip = (v) => (v ? <RatingChip value={v} scale="impact" variant="number" /> : null);

// How well a relationship is assured: its objectives met, and the finding.
export function assuranceOf(r) {
  const objs = r.objectives || [];
  const met = objs.filter((o) => o.met).length;
  const f = r.assurance_finding;
  if (r.status && r.status !== 'active') return { tone: 'quiet', words: supplierStatusWord(r.status), short: null };
  if (!objs.length) return { tone: null, words: 'no objectives expected', short: null };
  if (f && f.accepted_until) return { tone: 'warn', words: `${met}/${objs.length} met, the rest accepted`, short: `met ${met}/${objs.length}` };
  if (!f && met === objs.length) return { tone: 'good', words: `all ${objs.length} objectives met`, short: `met ${met}/${objs.length}` };
  const tone = met === 0 || f?.reason === 'no_evidence' ? 'bad' : 'warn';
  return { tone, words: `${objs.length - met} of ${objs.length} objectives unmet`, short: `met ${met}/${objs.length}` };
}
const supplierStatusWord = (s) => (s === 'ended' ? 'ended' : s);

// The systems a relationship reaches, as far as the record says: its own
// system, or the systems setting a component's criticality.
function reached(r) {
  if (r.system_id) {
    const c = (r.criticality_systems || []).find((s) => s.id === r.system_id);
    return { systems: [{ id: r.system_id, name: r.system_name, impact: c?.impact ?? r.max_impact }], more: 0 };
  }
  const all = (r.criticality_systems || []).map((s) => ({ id: s.id, name: s.name, impact: s.impact }));
  return { systems: all, more: Math.max(0, (r.systems_touched || 0) - all.length) };
}

export function supplierRelationshipsNodes(supplier, { active = null, level = null, onRelationship = () => {}, onSystem = () => {}, onSupplier = () => {}, onAsset = () => {}, onAssets = () => {}, today = new Date() } = {}) {
  const rels = [...(supplier.relationships || [])].sort((x, y) => (y.max_impact ?? 0) - (x.max_impact ?? 0)
    || Number(x.status !== 'active') - Number(y.status !== 'active')
    || (x.system_name || x.component_name || '').localeCompare(y.system_name || y.component_name || ''));
  const chosen = rels.find((r) => active === `rel:${r.id}`) || null;
  // A chosen system (owner, 2026-11-19: "use this diagram to see what a supplier
  // has access to"): it lights the relationships reaching it and the asset
  // column shows what it holds. Opening the system is from the list below.
  const chosenSys = active?.startsWith('sys:') ? active.slice(4) : null;
  const nodes = [];
  const links = [];

  // The systems, each drawn once however many relationships reach it.
  const sysNodes = new Map();
  const sysOrder = [];
  const relSystems = new Map();
  let moreTotal = 0;
  for (const r of rels) {
    const { systems, more } = reached(r);
    const shown = systems.slice(0, MAX_SYSTEMS);
    const hidden = more + systems.length - shown.length;
    relSystems.set(r.id, { ids: shown.map((s) => s.id), hidden });
    for (const s of shown) {
      if (!sysNodes.has(s.id)) { sysNodes.set(s.id, { ...s, rels: [] }); sysOrder.push(s.id); }
      sysNodes.get(s.id).rels.push(r.id);
    }
    if (hidden) moreTotal += 1;
  }
  const relRow = new Map(rels.map((r, k) => [r.id, k]));
  const centre = (s) => s.rels.reduce((a, id) => a + relRow.get(id), 0) / s.rels.length;
  const systems = sysOrder.map((id) => sysNodes.get(id)).sort((x, y) => centre(x) - centre(y) || x.name.localeCompare(y.name));
  const yCount = systems.length + (moreTotal ? 1 : 0);
  // The information it may reach, through its live relationships only (an
  // ended one reaches nothing now), highest rated first.
  const live = new Set(rels.filter((r) => r.status === 'active').map((r) => r.id));
  const reachable = (supplier.information_assets || []).filter((a) => (a.relationship_ids || []).some((id) => live.has(id)))
    .sort((x, y) => top(y) - top(x) || x.name.localeCompare(y.name));
  // With a relationship or a system chosen, the column is what that one reaches,
  // so none of it hides behind the "N more" of the whole supplier.
  const inScope = chosen ? reachable.filter((a) => (a.relationship_ids || []).includes(chosen.id))
    : chosenSys ? reachable.filter((a) => (a.system_ids || []).includes(chosenSys)) : reachable;
  const picking = !!(chosen || chosenSys);
  const assets = inScope.length <= MAX_ASSETS + 1 ? inScope : inScope.slice(0, MAX_ASSETS);
  const moreAssets = inScope.length - assets.length;
  const aCount = assets.length + (moreAssets ? 1 : 0);
  const stack = Math.max(rels.length, yCount, aCount, 1);
  const aBase = (stack - aCount) / 2;
  const rBase = (stack - rels.length) / 2;
  const yBase = (stack - yCount) / 2;
  const sysRels = chosenSys ? new Set(sysNodes.get(chosenSys)?.rels || []) : null;
  const litFor = (rid) => (chosen ? (rid === chosen.id ? { lit: departmentColour(chosen.department_id) } : { faded: true })
    : sysRels ? (sysRels.has(rid) ? { lit: 'var(--accent)' } : { faded: true }) : {});

  nodes.push({ id: 'supplier', col: 0, row: (stack - 1) / 2, kind: 'people', stripe: 'var(--ppitf-people)',
    selected: active === 'all', tag: 'Supplier', title: supplier.name, badge: chip(level),
    detail: fitsOneLine(supplier.name) ? plural(rels.length, 'relationship') : null,
    ariaLabel: `${supplier.name}: ${plural(rels.length, 'relationship')}${level ? `, criticality ${level}` : ''}. List them all.`,
    onClick: onSupplier });

  rels.forEach((r, k) => {
    const a = assuranceOf(r);
    const c = contractState(r, today);
    const via = r.component_name ? `${r.component_name}` : r.system_name;
    // A relationship for one system is named by its contract (the system is
    // the next box); one through a component by the component, which the
    // systems do not name.
    const title = r.component_name ? `Through ${r.component_name}` : (r.contract_ref || cap(c.word));
    const hidden = relSystems.get(r.id).hidden;
    nodes.push({ id: `r-${r.id}`, col: 1, row: rBase + k, kind: r.component_name ? 'control' : 'asset',
      stripe: departmentColour(r.department_id), tone: c.tone === 'bad' ? 'bad' : a.tone,
      selected: chosen?.id === r.id, ...((chosen && chosen.id !== r.id) || (sysRels && !sysRels.has(r.id)) ? { faded: true } : {}),
      tag: [SHORT[r.relationship_type] || 'Relationship', a.short].filter(Boolean).join(' · '),
      title, detail: fitsOneLine(title) ? r.department_name : null,
      ariaLabel: `${supplierTypeLabel(r.relationship_type)} relationship, ${via}, contracted by ${r.department_name || 'no department'}: `
        + `${a.words}; contract ${c.word}; reaches ${plural(r.systems_touched || 0, 'system')}. Show it.`,
      onClick: () => onRelationship(r.id) });
    links.push({ from: 'supplier', to: `r-${r.id}`, arrow: false, dashed: r.status !== 'active', ...(litFor(r.id).lit ? litFor(r.id) : {}) });
    for (const id of relSystems.get(r.id).ids) {
      links.push({ from: `r-${r.id}`, to: `y-${id}`, dashed: r.status !== 'active',
        ...(chosenSys ? (id === chosenSys ? { lit: 'var(--accent)' } : { faded: true }) : litFor(r.id)) });
    }
    if (hidden) links.push({ from: `r-${r.id}`, to: 'y-more', dashed: true, ...(chosenSys ? { faded: true } : litFor(r.id)) });
  });

  systems.forEach((s, k) => {
    const on = chosen && s.rels.includes(chosen.id);
    const held = reachable.filter((a) => (a.system_ids || []).includes(s.id)).length;
    nodes.push({ id: `y-${s.id}`, col: 2, row: yBase + k, kind: 'asset',
      ...(chosen ? (on ? { lit: departmentColour(chosen.department_id) } : { faded: true })
        : chosenSys ? (s.id === chosenSys ? { selected: true } : { faded: true }) : {}),
      tag: s.impact === level && level ? 'Sets criticality' : 'System', title: s.name, badge: chip(s.impact),
      detail: fitsOneLine(s.name) ? (held ? `holds ${plural(held, 'asset')}` : 'holds none') : null,
      ariaLabel: `${s.name}${s.impact ? `, impact ${s.impact}` : ''}: holds ${plural(held, 'information asset')} the supplier may reach. Show them.`,
      onClick: () => onSystem(s.id) });
  });
  if (moreTotal) {
    const n = rels.reduce((m, r) => m + relSystems.get(r.id).hidden, 0);
    nodes.push({ id: 'y-more', col: 2, row: yBase + systems.length, tone: 'quiet', ...((chosen && !relSystems.get(chosen.id).hidden) || chosenSys ? { faded: true } : {}),
      tag: 'Systems', title: `${n} more`, detail: 'recording its components' });
  }
  const chosenLit = chosen ? departmentColour(chosen.department_id) : picking ? 'var(--accent)' : null;
  assets.forEach((a, k) => {
    nodes.push({ id: `a-${a.id}`, col: 3, row: aBase + k, kind: 'asset', stripe: departmentColour(a.department_id),
      ...(picking ? { lit: chosenLit } : {}),
      tag: a.is_shared ? 'Information asset · shared' : 'Information asset', title: a.name, badge: chip(top(a)),
      detail: fitsOneLine(a.name) ? a.department_name : null,
      ariaLabel: `${a.name}, ${a.department_name || 'no department'}, impact ${top(a) || 'not rated'}: held in ${plural((a.system_ids || []).length, 'system')} the supplier reaches. Open it.`,
      onClick: () => onAsset(a.id) });
    const drawn = (a.system_ids || []).filter((id) => sysNodes.has(id));
    const lineFor = (id) => (chosenSys ? (id === chosenSys ? { lit: chosenLit } : { faded: true })
      : chosen ? (sysNodes.get(id).rels.includes(chosen.id) ? { lit: chosenLit } : { faded: true }) : {});
    const lineLit = picking ? { lit: chosenLit } : {};
    for (const id of drawn) links.push({ from: `y-${id}`, to: `a-${a.id}`, arrow: false, ...lineFor(id) });
    if (!drawn.length && moreTotal) links.push({ from: 'y-more', to: `a-${a.id}`, arrow: false, dashed: true, ...lineLit });
  });
  if (moreAssets) {
    nodes.push({ id: 'a-more', col: 3, row: aBase + assets.length, tone: 'quiet',
      selected: active === 'assets',
      tag: 'Information assets', title: `${moreAssets} more`, detail: picking ? 'all listed below' : `list all ${inScope.length}`,
      ariaLabel: `${moreAssets} more information assets${picking ? ', all listed below the picture' : ` the supplier may reach. List all ${inScope.length}`}.`,
      ...(picking ? {} : { onClick: onAssets }) });
  }
  if (rels.length && !inScope.length) {
    nodes.push({ id: 'a-none', col: 3, row: (stack - 1) / 2, tone: 'good', tag: 'Information assets', title: 'None reached',
      detail: chosenSys ? 'this system holds none' : chosen && chosen.status !== 'active' ? 'not a live relationship' : 'its systems hold none' });
  }

  if (!rels.length) {
    nodes.push({ id: 'r-none', col: 1, row: 0, tone: 'quiet', tag: 'Relationships', title: 'None recorded',
      detail: 'record one below' });
    links.push({ from: 'supplier', to: 'r-none', dashed: true });
  }

  const label = `${supplier.name} has ${plural(rels.length, 'relationship')}: `
    + rels.map((r) => `${supplierTypeLabel(r.relationship_type)} ${r.component_name ? `through ${r.component_name}` : `for ${r.system_name}`}, `
      + `contracted by ${r.department_name || 'no department'}, ${assuranceOf(r).words}`).join('; ')
    + `. It may reach ${plural(reachable.length, 'information asset')}`
    + (reachable.length ? `: ${reachable.map((a) => a.name).join(', ')}.` : '.');
  return { nodes, links, label, chosen, chosenSys, reachable, inScope };
}

export function SupplierRelationshipsDiagram({ supplier, level, active, onRelationship, onSystem, onSupplier, onAsset, onAssets }) {
  const { nodes, links, label } = supplierRelationshipsNodes(supplier, { active, level, onRelationship, onSystem, onSupplier, onAsset, onAssets });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
