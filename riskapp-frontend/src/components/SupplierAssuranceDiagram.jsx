// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram } from './RelationDiagram';
import { departmentColour } from '../utils/departmentColour';
import { assuranceOf } from './SupplierRelationshipsDiagram';
import { contractState } from './SystemSuppliersDiagram';

// A supplier's assurance as a picture (owner, 2026-11-19;
// docs/relation-diagrams.md), at the head of its Assurance tab:
//
//                    ┌─ objective  met ──────┬──▶ Report (valid until …)
//   Relationship ●───┼─ objective  expired ──┴──▶ Contract terms (expired)
//   Relationship     └─ objective  not met ─ ─ ─▶ No evidence
//
// The relationships are a selector (worst assured first), each a layer: the
// chosen one draws the control objectives expected of the supplier (v143),
// coloured by how they stand — met by current evidence, covered only by
// expired evidence, or not evidenced at all — each running to the evidence
// covering it (v144); an objective nothing covers runs to the red No evidence
// box. Objectives that are ours (v160: met by our own control, never by the
// supplier's evidence) are one box. A chosen objective lights its evidence.
//
//   supplier  GET /suppliers/:id (relationships with objectives, evidence,
//             assurance_finding)

const MAX_OBJECTIVES = 12;
export const EVIDENCE_STRIPE = 'var(--accent)';
export const NO_EVIDENCE_STRIPE = 'var(--red)';
const SHORT = { onshore: 'Onshore', contracted_service: 'Contracted', service_provider: 'SaaS', product: 'Product' };
const KIND = { report: 'Report', contract_terms: 'Contract terms' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

// How a supplier-side objective stands: met, expired (only expired evidence
// covers it), or missing.
export function objectiveState(o) {
  if (o.met) return { key: 'met', tone: 'good', word: 'met' };
  if (o.expired_only) return { key: 'expired', tone: 'warn', word: 'expired' };
  return { key: 'missing', tone: 'bad', word: 'not met' };
}

// Counts across the live relationships, for the summary ring.
export function assuranceCounts(relationships) {
  const live = (relationships || []).filter((r) => ['active', 'exiting'].includes(r.status));
  const objs = live.flatMap((r) => (r.objectives || []).filter((o) => !o.ours));
  const ev = live.flatMap((r) => r.evidence || []);
  return {
    live: live.length,
    met: objs.filter((o) => o.met).length,
    expired: objs.filter((o) => !o.met && o.expired_only).length,
    missing: objs.filter((o) => !o.met && !o.expired_only).length,
    evidence: ev.length,
    current: ev.filter((e) => e.is_current).length,
    findings: live.filter((r) => r.assurance_finding && !r.assurance_finding.accepted_until).length,
  };
}

export function relationshipsByAssurance(relationships) {
  const unmet = (r) => (r.objectives || []).filter((o) => !o.ours && !o.met).length;
  return [...(relationships || [])].sort((x, y) => Number(x.status === 'ended') - Number(y.status === 'ended')
    || unmet(y) - unmet(x) || (x.system_name || x.component_name || '').localeCompare(y.system_name || y.component_name || ''));
}

export function supplierAssuranceNodes(supplier, selectedId, { active = null, onSelect = () => {}, onObjective = () => {}, today = new Date() } = {}) {
  const rels = relationshipsByAssurance(supplier.relationships);
  const sel = Math.max(0, rels.findIndex((r) => r.id === selectedId));
  const chosen = rels[sel];
  const nodes = [];
  const links = [];

  rels.forEach((r, k) => {
    const a = assuranceOf(r);
    const c = contractState(r, today);
    const title = r.component_name ? `Through ${r.component_name}` : (r.system_name || cap(c.word));
    nodes.push({ id: `r-${r.id}`, col: 0, row: k, kind: r.component_name ? 'control' : 'asset',
      stripe: departmentColour(r.department_id), tone: a.tone, selected: k === sel,
      tag: [SHORT[r.relationship_type] || 'Relationship', a.short].filter(Boolean).join(' · '), title,
      ariaLabel: `${title}, contracted by ${r.department_name || 'no department'}: ${a.words}. Show its assurance.`,
      onClick: () => onSelect(r.id) });
  });
  if (!chosen) {
    nodes.push({ id: 'r-none', col: 0, row: 0, tone: 'quiet', tag: 'Relationships', title: 'None recorded',
      detail: 'nothing to assure yet' });
    return { nodes, links, label: `${supplier.name} has no relationships, so no assurance is expected.`, rels };
  }

  const all = chosen.objectives || [];
  const ours = all.filter((o) => o.ours);
  const theirs = all.filter((o) => !o.ours).map((o) => ({ ...o, state: objectiveState(o) }));
  const rank = { missing: 0, expired: 1, met: 2 };
  theirs.sort((x, y) => rank[x.state.key] - rank[y.state.key] || (x.ref || '').localeCompare(y.ref || '') || x.title.localeCompare(y.title));
  // When they do not all fit, the gaps are kept and the met ones counted.
  const shown = theirs.slice(0, MAX_OBJECTIVES);
  const moreMet = theirs.length - shown.length;
  const missing = shown.filter((o) => o.state.key === 'missing');

  // The evidence, each level with the middle of the objectives it covers.
  const evidence = chosen.evidence || [];
  const oRow = new Map(shown.map((o, k) => [o.control_id, k]));
  const covering = (e) => (e.control_ids || []).filter((id) => oRow.has(id));
  const centre = (e) => { const ids = covering(e); return ids.length ? ids.reduce((s, id) => s + oRow.get(id), 0) / ids.length : shown.length; };
  const evs = [...evidence].sort((x, y) => centre(x) - centre(y) || x.title.localeCompare(y.title));

  const oCount = shown.length + (moreMet ? 1 : 0) + (ours.length ? 1 : 0);
  const eCount = evs.length + (missing.length ? 1 : 0);
  const stack = Math.max(oCount, eCount, 1);
  const base = Math.max(0, sel - (stack - 1) / 2);
  const oBase = base + (stack - oCount) / 2;
  const eBase = base + (stack - eCount) / 2;
  const picked = shown.find((o) => active === `obj:${o.control_id}`) || null;
  const lineFor = (id) => (picked ? (id === picked.control_id ? { lit: EVIDENCE_STRIPE } : { faded: true }) : {});

  shown.forEach((o, k) => {
    nodes.push({ id: `o-${o.control_id}`, col: 1, row: oBase + k, kind: 'control', tone: o.state.tone,
      selected: picked?.control_id === o.control_id, stripe: picked?.control_id === o.control_id ? EVIDENCE_STRIPE : undefined,
      tag: [o.ref, o.state.word].filter(Boolean).join(' · '), title: o.title,
      ariaLabel: `${o.title}${o.ref ? ` (${o.ref})` : ''}: ${o.state.word}${o.covered_until ? `, covered until ${day(o.covered_until)}` : ''}. Show the evidence covering it.`,
      onClick: () => onObjective(`obj:${o.control_id}`) });
    links.push({ from: `r-${chosen.id}`, to: `o-${o.control_id}`, arrow: false, dashed: o.state.key === 'missing',
      ...(lineFor(o.control_id).lit ? lineFor(o.control_id) : {}) });
    const evIds = evs.filter((e) => (e.control_ids || []).includes(o.control_id)).map((e) => e.id);
    for (const id of evIds) links.push({ from: `o-${o.control_id}`, to: `e-${id}`, ...lineFor(o.control_id) });
    if (o.state.key === 'missing') {
      links.push({ from: `o-${o.control_id}`, to: 'e-none', dashed: true, tone: 'bad',
        ...(picked?.control_id === o.control_id || active === 'none' ? { lit: NO_EVIDENCE_STRIPE } : lineFor(o.control_id)) });
    }
  });
  if (moreMet) {
    nodes.push({ id: 'o-more', col: 1, row: oBase + shown.length, tone: 'good', tag: 'Objectives',
      title: `${moreMet} more met`, detail: 'listed below' });
    links.push({ from: `r-${chosen.id}`, to: 'o-more', arrow: false });
  }
  if (ours.length) {
    const met = ours.filter((o) => o.met).length;
    nodes.push({ id: 'o-ours', col: 1, row: oBase + shown.length + (moreMet ? 1 : 0), kind: 'control',
      tone: met === ours.length ? 'good' : 'warn', ...(picked ? { faded: true } : {}),
      tag: `Ours · ${met}/${ours.length} in place`, title: plural(ours.length, 'objective'),
      detail: 'met by our own controls',
      ariaLabel: `${plural(ours.length, 'objective')} met by our own controls, not the supplier's evidence: ${met} in place.` });
    links.push({ from: `r-${chosen.id}`, to: 'o-ours', arrow: false, dashed: true });
  }
  if (!all.length) {
    nodes.push({ id: 'o-none', col: 1, row: base, tone: 'quiet', tag: 'Objectives', title: 'None expected',
      detail: 'see supplier control sets' });
    links.push({ from: `r-${chosen.id}`, to: 'o-none', arrow: false, dashed: true });
  }

  evs.forEach((e, k) => {
    const covers = covering(e);
    const on = picked && covers.includes(picked.control_id);
    nodes.push({ id: `e-${e.id}`, col: 2, row: eBase + k, kind: 'control', tone: e.is_current ? null : 'bad',
      ...(picked ? (on ? { lit: EVIDENCE_STRIPE } : { faded: true }) : {}),
      tag: KIND[e.kind] || 'Evidence', title: e.title,
      detail: e.effective_expiry ? `${e.is_current ? 'valid until' : 'expired'} ${day(e.effective_expiry)}` : 'while the contract runs',
      ariaLabel: `${KIND[e.kind] || 'Evidence'} ${e.title}, ${e.is_current ? 'current' : 'expired'}: covers ${plural(covers.length, 'of these objectives')}.` });
  });
  if (missing.length) {
    nodes.push({ id: 'e-none', col: 2, row: eBase + evs.length, tone: 'bad', stripe: NO_EVIDENCE_STRIPE,
      selected: active === 'none',
      ...(picked ? (picked.state.key === 'missing' ? { lit: NO_EVIDENCE_STRIPE } : { faded: true }) : {}),
      tag: 'No evidence', title: plural(missing.length, 'objective'), detail: 'nothing covers it',
      onClick: () => onObjective('none') });
  }

  const label = `${supplier.name}: ${rels.map((r) => `${r.component_name || r.system_name}, ${assuranceOf(r).words}`).join('; ')}. `
    + `Showing ${chosen.component_name || chosen.system_name}: `
    + theirs.map((o) => `${o.title} ${o.state.word}`).join(', ')
    + (evidence.length ? `; evidence ${evidence.map((e) => `${e.title} (${e.is_current ? 'current' : 'expired'})`).join(', ')}.` : '; no evidence recorded.');
  return { nodes, links, label, rels, chosen };
}

export function SupplierAssuranceDiagram({ supplier, selected, active, onSelect, onObjective }) {
  const { nodes, links, label } = supplierAssuranceNodes(supplier, selected, { active, onSelect, onObjective });
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
