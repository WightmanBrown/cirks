// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';

// "About this risk" as a picture (owner, 2026-11-19; docs/relation-diagrams.md):
//
//   Information asset ─┐
//   Information asset ─┼─▶ System ──▶ This risk ─┬─▶ Risk owner
//   Information asset ─┘                ▲        └─▶ Review by
//   Threat ─────────────────────────────┘
//
// What the risk concerns: the assets the system holds (which give it its impact),
// the threat against it, and from the risk the person who owns it and when it is
// next reviewed. Every box opens About this risk at that record, where it is read
// in full and, where it can be, edited.
//
// `risk` is GET /risks/:id.

const MAX_ASSETS = 4;
const cia = (c, i, a) => `C${c ?? '–'} I${i ?? '–'} A${a ?? '–'}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const clip = (t, n) => (t && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

export function aboutRiskNodes(risk, onGo = () => {}, today = new Date()) {
  const go = (id) => () => onGo('about', id);
  const assets = [...(risk.system_assets || [])]
    .sort((x, y) => Math.max(y.c ?? 0, y.i ?? 0, y.a ?? 0) - Math.max(x.c ?? 0, x.i ?? 0, x.a ?? 0) || x.name.localeCompare(y.name));
  const shown = assets.slice(0, MAX_ASSETS);
  const more = assets.length - shown.length;
  const stack = Math.max(1, shown.length + (more > 0 ? 1 : 0));
  const mid = (stack - 1) / 2;
  const nodes = [];
  const links = [];

  shown.forEach((a, k) => {
    nodes.push({ id: `a-${a.id}`, col: 0, row: k, kind: 'asset', tag: `Asset · ${cia(a.c, a.i, a.a)}`,
      title: a.name, onClick: go(`risk-asset-${a.id}`) });
    links.push({ from: `a-${a.id}`, to: 'system' });
  });
  if (more > 0) {
    nodes.push({ id: 'a-more', col: 0, row: shown.length, kind: 'asset', tone: 'quiet', tag: 'Information assets',
      title: `${more} more`, detail: 'see them all', onClick: go('risk-assets') });
    links.push({ from: 'a-more', to: 'system' });
  }
  if (!assets.length) {
    nodes.push({ id: 'a-none', col: 0, row: 0, kind: 'asset', tone: 'bad', tag: 'Information assets',
      title: 'None held', detail: 'so the impact is not rated', onClick: go('risk-assets') });
    links.push({ from: 'a-none', to: 'system', dashed: true });
  }

  nodes.push({ id: 'system', col: 1, row: mid, tag: `System · ${cia(risk.impact_c, risk.impact_i, risk.impact_a)}`,
    title: risk.system_name || 'No system', detail: risk.department_name, onClick: go('risk-system') });

  const threatRow = stack + 0.25;
  nodes.push({ id: 'threat', col: 0, row: threatRow, kind: 'threat', tag: `Threat${risk.threat_category ? ` · ${risk.threat_category}` : ''}`,
    title: risk.threat_name, onClick: go('risk-threat') });

  nodes.push({ id: 'risk', col: 2, row: mid, kind: 'risk',
    tone: risk.validation_status === 'validated' ? null : 'warn',
    tag: `This risk · ${risk.validation_status || 'not validated'}`,
    title: clip(risk.rationale, 70) || 'No rationale written',
    detail: risk.identified_by_name ? `identified by ${risk.identified_by_name}` : null,
    onClick: go('risk-rationale') });
  links.push({ from: 'system', to: 'risk', label: 'on' });
  links.push({ from: 'threat', to: 'risk', into: 'bottom', label: 'against' });

  nodes.push({ id: 'owner', col: 3, row: mid - 0.6, tag: 'Risk owner', title: risk.owner_name || 'Nobody',
    tone: risk.owner_name ? null : 'bad',
    detail: risk.owner_is_siro_fallback ? `the SIRO: ${risk.department_name || 'the department'} has no owner` : risk.department_name,
    onClick: go('risk-owner') });
  const overdue = risk.review_date && new Date(risk.review_date) < today;
  nodes.push({ id: 'review', col: 3, row: mid + 0.6, tag: 'Review', tone: !risk.review_date ? 'quiet' : overdue ? 'bad' : null,
    title: day(risk.review_date) || 'No date set', detail: overdue ? 'overdue' : risk.created_at ? `created ${day(risk.created_at)}` : null,
    onClick: go('risk-review') });
  links.push({ from: 'risk', to: 'owner' });
  links.push({ from: 'risk', to: 'review' });

  const label = `${risk.threat_name} against ${risk.system_name} (${cia(risk.impact_c, risk.impact_i, risk.impact_a)}), `
    + `which holds ${assets.length ? assets.map((a) => a.name).join(', ') : 'no information assets'}. `
    + `Risk owner ${risk.owner_name || 'nobody'}; review ${day(risk.review_date) || 'not set'}${overdue ? ' (overdue)' : ''}.`;
  return { nodes, links, label };
}

export function AboutRiskDiagram({ risk, onGo }) {
  const { nodes, links, label } = aboutRiskNodes(risk, onGo);
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
