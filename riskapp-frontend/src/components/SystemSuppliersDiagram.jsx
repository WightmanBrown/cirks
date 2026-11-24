// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { RatingChip } from './RatingChip';

// The highest of C, I and A, in its impact colour (owner: "just add the max").
const impactChip = (v) => (v ? <RatingChip value={v} scale="impact" variant="number" /> : null);

// A system's suppliers as a picture (owner, 2026-11-19; docs/relation-diagrams.md),
// the folded view of its Suppliers tab:
//
//   Supplier ─┬─ Contract ─┐
//             └─ Contract ─┼──▶ System ─┬─▶ Information asset
//   Supplier ─── Contract ─┘            └─▶ Information asset
//
// Who the system relies on, under what contract, and whose information is
// exposed through it. Each supplier has a colour its contracts and its list
// wear. A contract is a supplier relationship: its type, reference and end
// date, the department contracting it, and, where it reaches the system
// through one of its components, which one. The system's information assets,
// highest rated first, are what a supplier failure would expose.
//
//   system  GET /systems/:id (name, impact_c/i/a, information_assets)
//   rows    GET /suppliers/relationships?system_id=

const TYPE = { onshore: 'Onshore', contracted_service: 'Contracted service', service_provider: 'Service provider', product: 'Product' };
const PALETTE = ['var(--ppitf-people)', 'var(--ppitf-process)', 'var(--ppitf-information)', 'var(--ppitf-technology)', 'var(--ppitf-facility)'];
const MAX_ASSETS = 5;
const DAY = 86400000;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const top = (a) => Math.max(a.confidentiality ?? 0, a.integrity ?? 0, a.availability ?? 0);

export function suppliersOf(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.supplier_id)) by.set(r.supplier_id, { id: r.supplier_id, name: r.supplier_name, rows: [] });
    by.get(r.supplier_id).rows.push(r);
  }
  return [...by.values()]
    .sort((x, y) => y.rows.length - x.rows.length || x.name.localeCompare(y.name))
    .map((s, k) => ({ ...s, stripe: PALETTE[k % PALETTE.length] }));
}

// A contract's standing: ended, running out (90 days), current, or not recorded.
export function contractState(r, today = new Date()) {
  if (r.status && r.status !== 'active') return { tone: 'quiet', word: r.status };
  if (!r.contract_end) return { tone: null, word: r.contract_ref ? 'no end date' : 'no contract recorded' };
  const left = (new Date(r.contract_end) - today) / DAY;
  if (left < 0) return { tone: 'bad', word: `ended ${day(r.contract_end)}` };
  if (left <= 90) return { tone: 'warn', word: `ends ${day(r.contract_end)}` };
  return { tone: null, word: `ends ${day(r.contract_end)}` };
}

export function systemSuppliersNodes(system, rows, { active = null, onFilter = () => {}, onSupplier = () => {}, onAsset = () => {}, today = new Date() } = {}) {
  const suppliers = suppliersOf(rows || []);
  const nodes = [];
  const links = [];
  let row = 0;
  for (const s of suppliers) {
    const first = row;
    for (const r of s.rows) {
      const st = contractState(r, today);
      nodes.push({ id: `k-${r.id}`, col: 1, row, stripe: s.stripe, tone: st.tone,
        tag: `${TYPE[r.relationship_type] || 'Contract'}${r.contract_ref ? ` · ${r.contract_ref}` : ''}`,
        title: r.component_name ? `Through ${r.component_name}` : 'Directly to the system',
        detail: `${st.word}${r.department_name ? ` · ${r.department_name}` : ''}`,
        onClick: () => onSupplier(r.supplier_id) });
      links.push({ from: `s-${s.id}`, to: `k-${r.id}`, arrow: false });
      links.push({ from: `k-${r.id}`, to: 'system', dashed: st.tone === 'quiet' });
      row += 1;
    }
    nodes.push({ id: `s-${s.id}`, col: 0, row: first + (row - 1 - first) / 2, kind: 'people', stripe: s.stripe,
      selected: active === `sup:${s.id}`, tag: 'Supplier', title: s.name, detail: plural(s.rows.length, 'contract'),
      onClick: () => onFilter(`sup:${s.id}`) });
  }

  const assets = [...(system.information_assets || [])].sort((x, y) => top(y) - top(x) || x.name.localeCompare(y.name));
  const shown = assets.slice(0, MAX_ASSETS);
  const more = assets.length - shown.length;
  const stack = Math.max(row, shown.length + (more ? 1 : 0), 1);
  const mid = (stack - 1) / 2;
  // Recentre the left two columns on the stack when the assets outnumber them.
  const shift = mid - (row - 1) / 2;
  if (row && shift > 0) for (const n of nodes) n.row += shift;
  nodes.push({ id: 'system', col: 2, row: mid, kind: 'asset',
    tag: `System · C${system.impact_c ?? '–'} I${system.impact_i ?? '–'} A${system.impact_a ?? '–'}`, title: system.name,
    badge: impactChip(Math.max(system.impact_c ?? 0, system.impact_i ?? 0, system.impact_a ?? 0)),
    detail: plural(rows.length, 'supplier contract'), onClick: () => onFilter('all') });
  const aBase = mid - (shown.length + (more ? 1 : 0) - 1) / 2;
  shown.forEach((a, k) => {
    nodes.push({ id: `a-${a.id}`, col: 3, row: aBase + k, kind: 'asset',
      tag: `C${a.confidentiality ?? '–'} I${a.integrity ?? '–'} A${a.availability ?? '–'}`, title: a.name,
      badge: impactChip(top(a)), detail: a.department_name, onClick: () => onAsset(a.id) });
    links.push({ from: 'system', to: `a-${a.id}`, strong: top(a) === Math.max(...assets.map(top)) });
  });
  if (more) {
    nodes.push({ id: 'a-more', col: 3, row: aBase + shown.length, kind: 'asset', tone: 'quiet', tag: 'Information assets',
      title: `${more} more`, detail: 'on the Information assets tab' });
    links.push({ from: 'system', to: 'a-more', dashed: true });
  }
  if (!assets.length) {
    nodes.push({ id: 'a-none', col: 3, row: mid, kind: 'asset', tone: 'bad', tag: 'Information assets', title: 'None held',
      detail: 'nothing is exposed through it' });
    links.push({ from: 'system', to: 'a-none', dashed: true });
  }

  const label = `${system.name} relies on ${plural(suppliers.length, 'supplier')} under ${plural(rows.length, 'contract')}: `
    + suppliers.map((s) => `${s.name} (${s.rows.length})`).join(', ')
    + `. It holds ${plural(assets.length, 'information asset')}${assets.length ? `, the highest ${assets[0].name}` : ''}.`;
  return { nodes, links, label, suppliers };
}

export function SystemSuppliersDiagram({ system, rows, active, onFilter, onSupplier, onAsset }) {
  const { nodes, links, label } = systemSuppliersNodes(system, rows, { active, onFilter, onSupplier, onAsset });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
