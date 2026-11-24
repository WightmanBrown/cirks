// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { departmentColour } from '../utils/departmentColour';
import { RiskGrid } from './RiskGrid';
import { impactLabel, probabilityLabel } from '../utils/ratingScale';
import { RatingChip } from './RatingChip';

const impactChip = (v) => (v ? <RatingChip value={v} scale="impact" variant="number" /> : null);
const topOf = (a) => Math.max(a.confidentiality ?? 0, a.integrity ?? 0, a.availability ?? 0);

// A system's information assets as a picture (owner, 2026-11-19;
// docs/relation-diagrams.md), the folded view of its Information assets tab.
// The inverse of How bad is it?: there the likelihood is the fan and the
// impact one line; here the impact is the fan and the likelihood one line.
//
//   Department ──┬─▶ Asset ─┐
//                └─▶ Asset ═╪═▶ System impact ──╮ impact
//   Department ────▶ Asset ─┘                   ▼
//                    Likelihood now (worst risk) ─▶ grid
//
// The departments whose information the system holds fan out to their assets;
// each department has a colour its assets and its list wear. The assets feed
// the system's impact, the highest of them on each dimension
// (recompute_system_impact), those setting it drawn heavy. The impact drops
// into the grid; the worst risk's likelihood runs in from the side.
//
//   system  GET /systems/:id (information_assets, impact_c/i/a, name)
//   worst   GET /risks/:id/answer for the system's worst risk, or null

const DIM = { c: 'confidentiality', i: 'integrity', a: 'availability' };
const LETTER = { c: 'C', i: 'I', a: 'A' };
const MAX_ASSETS = 8;
export const SETS_STRIPE = 'var(--graph-asset)';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cia = (x) => `C${x.confidentiality ?? '–'} I${x.integrity ?? '–'} A${x.availability ?? '–'}`;

// The assets on each dimension at the system's impact: what sets it.
export function settingDims(asset, system) {
  return ['c', 'i', 'a'].filter((d) => {
    const v = { c: asset.confidentiality, i: asset.integrity, a: asset.availability }[d];
    const s = { c: system.impact_c, i: system.impact_i, a: system.impact_a }[d];
    return v != null && s != null && v === s;
  });
}

export function departmentsOf(system) {
  const by = new Map();
  for (const a of system.information_assets || []) {
    const key = a.department_id || 'none';
    if (!by.has(key)) by.set(key, { id: key, name: a.department_name || 'No department', assets: [] });
    by.get(key).assets.push(a);
  }
  return [...by.values()]
    .sort((x, y) => y.assets.length - x.assets.length || x.name.localeCompare(y.name))
    .map((d) => ({ ...d, stripe: departmentColour(d.id === 'none' ? null : d.id) }));
}

export function systemAssetsNodes(system, worst = null, { active = null, onFilter = () => {}, onAsset = () => {}, onRisk = () => {} } = {}) {
  const depts = departmentsOf(system);
  const nodes = [];
  const links = [];
  let row = 0;
  let shownAssets = 0;
  const assetRows = [];

  for (const d of depts) {
    const first = row;
    const ordered = [...d.assets].sort((x, y) => settingDims(y, system).length - settingDims(x, system).length || x.name.localeCompare(y.name));
    const room = Math.max(1, MAX_ASSETS - shownAssets);
    const shown = ordered.slice(0, room);
    for (const a of shown) {
      const sets = settingDims(a, system);
      nodes.push({ id: `a-${a.id}`, col: 1, row, kind: 'asset', stripe: d.stripe,
        tag: `${cia(a)}${a.is_shared ? ' · shared' : ''}`, title: a.name, badge: impactChip(topOf(a)),
        detail: sets.length ? `sets ${sets.map((x) => LETTER[x]).join(' ')}` : null,
        onClick: () => onAsset(a.id) });
      links.push({ from: `dept-${d.id}`, to: `a-${a.id}`, arrow: false });
      links.push({ from: `a-${a.id}`, to: 'system', strong: sets.length > 0 });
      assetRows.push(row);
      row += 1; shownAssets += 1;
    }
    if (ordered.length > shown.length) {
      nodes.push({ id: `more-${d.id}`, col: 1, row, tone: 'quiet', stripe: d.stripe, tag: d.name,
        title: `${ordered.length - shown.length} more`, detail: 'see them all', onClick: () => onFilter(`dept:${d.id}`) });
      links.push({ from: `dept-${d.id}`, to: `more-${d.id}`, arrow: false, dashed: true });
      row += 1;
    }
    nodes.push({ id: `dept-${d.id}`, col: 0, row: first + (row - 1 - first) / 2, kind: 'people', stripe: d.stripe,
      selected: active === `dept:${d.id}`, tag: 'Department', title: d.name, detail: plural(d.assets.length, 'asset'),
      onClick: () => onFilter(`dept:${d.id}`) });
  }

  const count = system.information_assets?.length || 0;
  const mid = count ? (row - 1) / 2 : 0;
  const impact = { c: system.impact_c, i: system.impact_i, a: system.impact_a };
  const top = Math.max(...Object.values(impact).map((v) => v ?? 0));
  const setters = (system.information_assets || []).filter((a) => settingDims(a, system).length).length;
  nodes.push(count ? {
    id: 'system', col: 2, row: mid, kind: 'asset', stripe: SETS_STRIPE, selected: active === 'sets',
    tag: `Impact · C${impact.c ?? '–'} I${impact.i ?? '–'} A${impact.a ?? '–'}`, title: system.name, badge: impactChip(top),
    detail: `set by ${plural(setters, 'asset')}`, onClick: () => onFilter('sets'),
  } : {
    id: 'system', col: 1, row: 0, tone: 'bad', tag: 'System impact', title: 'Not rated',
    detail: 'it holds no information asset', onClick: () => onFilter('all'),
  });

  // The worst risk: its likelihood, and where it sits on the grid.
  const sCol = count ? 3 : 2;
  const gridRow = Math.max(mid + 1.75, count ? row : 2);
  if (worst) {
    const d = worst.score.driving[0];
    nodes.push({ id: 'likelihood', col: Math.max(0, sCol - 2), row: gridRow, kind: 'threat',
      tag: `Likelihood now · ${LETTER[d]}`, title: probabilityLabel(worst.score.probability[d]),
      detail: `worst risk: ${worst.threat_name}`, onClick: () => onRisk('score') });
    nodes.push({ id: 'grid', col: sCol, row: gridRow, w: 220, h: 212, framed: true,
      ariaLabel: `Worst risk ${worst.score.now}: impact ${worst.score.impact[d]} by likelihood ${worst.score.probability[d]} on ${DIM[d]}. Open it.`,
      render: () => <RiskGrid size="small" marked={{ impact: worst.score.impact[d], likelihood: worst.score.probability[d] }}
        label={system.name} named caption={DIM[d]} ariaLabel={`${system.name}: worst risk ${worst.score.now}`} />,
      onClick: () => onRisk('score') });
    links.push({ from: 'system', to: 'grid', into: 'top', label: `impact ${worst.score.impact[d]}` });
    links.push({ from: 'likelihood', to: 'grid', label: `likelihood ${worst.score.probability[d]}` });
  }

  const label = `${system.name} holds ${plural(count, 'information asset')} from ${plural(depts.length, 'department')}: `
    + depts.map((d) => `${d.name} (${d.assets.length})`).join(', ')
    + `. Its impact is C${impact.c ?? '–'} I${impact.i ?? '–'} A${impact.a ?? '–'}, ${impactLabel(top || null)} at most, set by ${plural(setters, 'asset')}.`
    + (worst ? ` Its worst risk, ${worst.threat_name}, scores ${worst.score.now}.` : '');
  return { nodes, links, label, depts };
}

export function SystemAssetsDiagram({ system, worst, active, onFilter, onAsset, onRisk }) {
  const { nodes, links, label } = systemAssetsNodes(system, worst, { active, onFilter, onAsset, onRisk });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
