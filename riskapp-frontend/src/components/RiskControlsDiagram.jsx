// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RelationDiagram, BOX_W } from './RelationDiagram';
import { TypeBadge } from './ComponentPill';
import { componentStatusLabel, COMPONENT_TYPE_LABEL } from '../utils/componentTypes';
import { solutionStateLabel } from '../utils/securitySolutions';
import { RatingChip } from './RatingChip';
import { collapse, isMixed } from '../utils/singleProbability';
import { coverageDrivers, effectiveContribution } from '../utils/coverageDriver';

// Why this score? as a picture (owner, 2026-11-23; docs/relation-diagrams.md):
// every control objective against the threat on this system, the security
// solutions that deliver it, and, when a solution is chosen, its parts in the
// slots of its pattern.
//
//   Current operational controls on this system
//   objective ─────▶ Solution (in use, complete) ─▶ part · slot   (on request)
//   Degraded controls which need improvement on this system
//   objective ─────▶ Solution (in use, degraded)
//              ─ ─ ▶ 2 other ways to deliver it                    (on request)
//   Controls which are missing from this system and could reduce the risk
//   objective ─ ─ ─▶ No security solution
//
// No objective is ever left out: the picture is compressed by what the reader
// chooses to open, not by dropping rows. Choosing an objective selects it (its
// detailed row is shown under the picture); choosing a solution unfolds its
// parts; "N other ways" unfolds the solutions not used here.
//
//   groups    [{ key, title, empty, rows }] in reading order (the panel's sections)
//   open      Set of unfolded keys: `sol:<objectiveId>:<solutionId>`,
//             `alt:<objectiveId>`, `flat:<objectiveId>`
//   selected  the chosen objective's id, or null
//   threat    { name, onClick } draws the threat first, fanning out to the
//             objectives, its own likelihood as a chip on its line
//   inherent  the threat's own likelihood { c, i, a }: the paths lowering the
//             risk below it (the best effect) are drawn heavy and green, and
//             each objective's line carries the likelihood it brings

const GROUP_TONE = { operational: 'good', impaired: 'warn', missing: 'bad', excluded: 'quiet' };
const GROUP_WORD = { operational: 'operational', impaired: 'needs improvement', missing: 'missing', excluded: 'not applicable here' };
const SOLUTION_TONE = { complete: 'good', degraded: 'warn', incomplete: 'bad' };
const HEAD_H = 28;
const HEAD_STEP = 0.75;   // a heading takes three quarters of a row
const ALT_H = 44;         // "N other ways" is a low box tucked under the solution
const ALT_STEP = 0.6;
// The fold-up cross: a small box sitting on the dashed trunk to the other
// ways, which runs half a column gap before the solutions' column.
const CROSS = 24;
const CROSS_COL = (BOX_W + 64 / 2 - CROSS / 2) / (BOX_W + 64);
const WIDE = 3 * BOX_W + 2 * 64;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const slotWord = (k) => (k ? k.replace(/_/g, ' ') : null);

export const solKey = (oid, sid) => `sol:${oid}:${sid}`;
export const altKey = (oid) => `alt:${oid}`;
export const flatKey = (oid) => `flat:${oid}`;

// A part's (or a flat component's) state here, as a tone and in words.
export function partState(p) {
  if (!p.on_system) {
    return { tone: 'bad', words: p.part_location === 'service' ? 'not recorded on the security system' : 'not recorded here' };
  }
  const s = p.system_status;
  const tone = s === 'operational' ? 'good' : s === 'degraded' ? 'warn' : 'bad';
  return { tone, words: componentStatusLabel(p.component_type, s || 'unknown').toLowerCase() };
}

function partWhere(p) {
  if (p.part_location === 'service' && p.security_system) return `on ${p.security_system.name}`;
  if (p.part_location === 'organisation' || p.delivered_via === 'organisation') return 'once for the organisation';
  return null;
}

// The solutions drawn beside an objective; `others` are those not used here,
// folded into "N other ways" until it is opened (then `othersOpen`, and a red
// cross on their dashed line folds them up again).
export function solutionsShown(c, open) {
  const sols = c.solutions || [];
  const inUse = sols.filter((s) => s.in_use);
  if (!inUse.length) return { shown: sols, others: [], othersOpen: false };
  const others = sols.filter((s) => !s.in_use);
  if (!others.length) return { shown: inUse, others, othersOpen: false };
  const othersOpen = open.has(altKey(c.id));
  return { shown: othersOpen ? [...inUse, ...others] : inUse, others, othersOpen };
}

const DIMS = ['c', 'i', 'a'];
const tripleWords = (v) => DIMS.map((d) => `${d.toUpperCase()}${v[d]}`).join(' ');

/**
 * The objectives having the best effect on the risk: those setting the current
 * likelihood on a dimension where it is below the threat's own (so actually
 * lowering it), each with those dimensions. A tie at the threat's own level
 * lowers nothing and is not emphasised.
 */
export function bestEffect(controls, inherent) {
  const { floor, byDim } = coverageDrivers(controls, inherent);
  const best = new Map();
  for (const d of DIMS) {
    if (floor[d] == null || inherent?.[d] == null || floor[d] >= inherent[d]) continue;
    for (const id of byDim[d]) best.set(id, [...(best.get(id) || []), d]);
  }
  return best;
}

export function riskControlsNodes(groups, { open = new Set(), selected = null, inherent = { c: 5, i: 5, a: 5 }, threat = null, onSelect = () => {}, onToggle = () => {} } = {}) {
  const best = bestEffect(groups.flatMap((g) => g.rows), inherent);
  // With the threat, the picture reads as How bad is it? does: the threat on the
  // left fans out to its objectives, its own likelihood on its line.
  const off = threat ? 1 : 0;
  const own = Math.max(inherent.c ?? 0, inherent.i ?? 0, inherent.a ?? 0) || null;
  let threatRow = null;
  // Where each best-effect objective's path leaves its block on the right (its
  // solution, or that solution's first part when unfolded), to run on into the
  // Best likelihood box without crossing anything.
  const exits = [];
  const nodes = [];
  const links = [];
  let row = 0;
  const sayAll = [];

  groups.forEach((g, gi) => {
    if (!g.rows.length && g.key !== 'operational') return;
    if (gi > 0 && nodes.length) row += 0.25;
    nodes.push({ id: `h-${g.key}`, col: off, row, w: WIDE, h: HEAD_H,
      render: () => <span style={{ fontWeight: 600, color: 'var(--text-secondary)', width: '100%' }}>{g.title} · {g.rows.length}</span> });
    row += HEAD_STEP;
    if (!g.rows.length) {
      nodes.push({ id: `e-${g.key}`, col: off, row, w: WIDE, tone: 'bad', tag: 'None', title: g.empty, detailLines: 2 });
      row += 1;
      return;
    }

    for (const c of g.rows) {
      const tone = GROUP_TONE[g.key];
      const { shown, others, othersOpen } = solutionsShown(c, open);
      const flat = !(c.solutions || []).length;
      // Each solution takes one row, or one per part when unfolded.
      const heights = shown.map((s) => (open.has(solKey(c.id, s.id)) ? Math.max(1, (s.parts || []).length) : 1));
      const flatOpen = flat && open.has(flatKey(c.id));
      const flatH = flat ? (flatOpen ? Math.max(1, c.components.length) : 1) : 0;
      // "N other ways" (or the box folding them up) sits straight under the last
      // solution box, beside any parts unfolded from it.
      const solRows = heights.reduce((a, b) => a + b, 0);
      const lastBoxEnd = shown.length ? solRows - heights[heights.length - 1] + 1 : 0;
      const block = Math.max(1, others.length && !othersOpen ? Math.max(solRows, lastBoxEnd + ALT_STEP) : solRows + flatH);
      const sel = selected === c.id;
      const lit = selected ? (sel ? { lit: 'var(--accent)' } : { faded: true }) : {};
      // The value it carries: what it counts as now (a degraded one a rung
      // worse), or what it would bring the likelihood to once in place.
      const eff = effectiveContribution(c, inherent);
      const counts = eff !== null;
      const value = counts ? eff : { c: c.probability_c, i: c.probability_i, a: c.probability_a };
      const p = counts ? Math.max(eff.c, eff.i, eff.a) : collapse(c);
      const mixed = counts ? new Set(DIMS.map((d) => eff[d])).size > 1 : isMixed(c);
      const bestDims = best.get(c.id);
      const isBest = !!bestDims && g.key !== 'excluded';
      const detail = g.key === 'excluded' ? (c.exclusion_reason ? `“${c.exclusion_reason}”` : 'excluded with a reason')
        : isBest ? `best effect · ${bestDims.map((d) => `${d.toUpperCase()}${eff[d]}`).join(' ')}`
        : counts ? (mixed ? `counts now · ${tripleWords(value)}` : 'counts now')
        : c.probability_judged ? `would bring it to ${mixed ? tripleWords(value) : p}` : 'what it would buy is not judged';
      // The chip on its line: the likelihood it carries (the worst of C, I, A).
      const chip = g.key === 'excluded' || p == null ? undefined
        : <span title={`${counts ? 'Counts as' : 'Would bring it to'} ${tripleWords(value)}`}><RatingChip value={p} scale="probability" variant="number" /></span>;
      const strong = isBest ? { strong: true, tone: 'good' } : {};
      // The best paths' boxes are framed in green too: the lines alone are
      // short stretches behind their value chips. A chosen objective's own
      // colour takes over while one is chosen.
      const bestBox = isBest && !selected ? { lit: 'var(--green)' } : {};

      const oid = `o-${c.id}`;
      nodes.push({ id: oid, col: off, row, kind: 'control', tone, selected: sel, ...bestBox, ...(selected && !sel ? { faded: true } : {}),
        // The heading above says which group it is in; the tag keeps the room.
        tag: [c.framework_ref, c.has_open_action ? 'planned' : null].filter(Boolean).join(' · ') || null,
        title: c.title, detail,
        ariaLabel: `${c.title}: ${GROUP_WORD[g.key]} on this system; likelihood ${p}; ${detail}. ${sel ? 'Hide its details.' : 'Show its details.'}`,
        onClick: () => onSelect(sel ? null : c.id) });

      if (threat) {
        // The first objective is level with the threat, so its line runs
        // straight and carries the threat's own likelihood; the others branch off.
        const first = threatRow === null;
        if (first) threatRow = row;
        links.push({ from: 'threat', to: oid, arrow: false, dashed: !counts, ...(g.key === 'excluded' ? { faded: true } : {}),
          ...strong, ...lit,
          ...(first && own ? { label: <span title={`The threat on its own: ${tripleWords(inherent)}`}><RatingChip value={own} scale="probability" variant="number" /></span> } : {}) });
      }

      let r = row;
      let lastBox = row;
      shown.forEach((s, k) => {
        lastBox = r;
        const id = `s-${c.id}-${s.id}`;
        const key = solKey(c.id, s.id);
        const parts = s.parts || [];
        const unfolded = open.has(key);
        const state = s.kind === 'supplier' ? 'provided by the supplier' : solutionStateLabel(s.state);
        const canOpen = s.kind === 'parts' && parts.length > 0;
        nodes.push({ id, col: off + 1, row: r, kind: 'control', tone: s.in_use ? SOLUTION_TONE[s.state] || 'quiet' : 'quiet',
          ...(selected && !sel ? { faded: true } : sel ? { lit: 'var(--accent)' } : s.in_use ? bestBox : {}),
          // One not used here, beside the one in use, is "another way".
          tag: [s.in_use || !c.solutions.some((x) => x.in_use) ? 'Solution' : 'Other way', s.solution_pattern, s.in_use ? 'in use' : null].filter(Boolean).join(' · '),
          title: s.name,
          detail: canOpen ? `${state} · ${unfolded ? 'hide' : 'show'} ${plural(parts.length, 'part')}` : state,
          selected: canOpen ? unfolded : undefined,
          ariaLabel: `Security solution ${s.name} for ${c.title}: ${state}.${canOpen ? ` ${unfolded ? 'Hide' : 'Show'} its ${plural(parts.length, 'part')}.` : ''}`,
          onClick: canOpen ? () => onToggle(key) : undefined });
        const path = s.in_use ? strong : {};
        if (k === 0 && isBest) exits.push({ id: unfolded && parts.length ? `p-${c.id}-${s.id}-${parts[0].id}` : id, row: r, lit, chip });
        links.push({ from: oid, to: id, dashed: !s.in_use, ...path, ...lit, ...(k === 0 ? { label: chip } : {}) });
        if (unfolded) {
          parts.forEach((pt, j) => {
            const st = partState(pt);
            const where = partWhere(pt);
            const pid = `p-${c.id}-${s.id}-${pt.id}`;
            nodes.push({ id: pid, col: off + 2, row: r + j, kind: pt.component_type, tone: st.tone,
              ...(selected && !sel ? { faded: true } : {}),
              tag: <><TypeBadge type={pt.component_type} variant="text" />{pt.slot_key ? ` · ${slotWord(pt.slot_key)}` : ''}</>,
              title: pt.name, detail: [st.words, where].filter(Boolean).join(' · '),
              ariaLabel: `${COMPONENT_TYPE_LABEL[pt.component_type] || pt.component_type} ${pt.name}${pt.slot_key ? `, ${slotWord(pt.slot_key)}` : ''}: ${st.words}${where ? `, ${where}` : ''}` });
            links.push({ from: id, to: pid, dashed: st.tone === 'bad', ...path, ...lit });
          });
        }
        r += heights[k];
      });

      if (others.length && !othersOpen) {
        const id = `alt-${c.id}`;
        nodes.push({ id, col: off + 1, row: lastBox + 0.8, h: ALT_H, tone: 'quiet', ...(selected && !sel ? { faded: true } : {}),
          title: `+ ${plural(others.length, 'other way')} to deliver it`,
          detail: 'not used here',
          ariaLabel: `${plural(others.length, 'other security solution')} for ${c.title}: ${others.map((s) => s.name).join(', ')}. Show them.`,
          onClick: () => onToggle(altKey(c.id)) });
        links.push({ from: oid, to: id, dashed: true, ...lit });
      }
      if (othersOpen) {
        // Unfolded: a red cross on the dashed trunk, between the solution in use
        // and the first other way, folds them up again.
        const inUseRows = heights.slice(0, shown.length - others.length).reduce((a, b) => a + b, 0);
        nodes.push({ id: `fold-${c.id}`, col: off + CROSS_COL, row: row + inUseRows / 2, w: CROSS, h: CROSS, framed: true,
          ...(selected && !sel ? { faded: true } : {}),
          render: () => <span aria-hidden="true" style={{ color: 'var(--red)', fontWeight: 700, fontSize: 18, lineHeight: 1, width: '100%', textAlign: 'center' }}>×</span>,
          ariaLabel: `Fold up the ${plural(others.length, 'other security solution')} for ${c.title}.`,
          onClick: () => onToggle(altKey(c.id)) });
      }

      if (flat) {
        const id = `n-${c.id}`;
        const comps = c.components || [];
        nodes.push({ id, col: off + 1, row: r, tone: 'bad', stripe: 'var(--red)', ...(selected && !sel ? { faded: true } : {}),
          tag: 'No security solution',
          title: c.delivery === 'organisation' || c.delivery === 'group' ? 'Delivered once, no solution named' : 'Nothing can put it in place',
          detail: comps.length ? `${flatOpen ? 'hide' : 'show'} ${plural(comps.length, 'component')}` : 'give it a security solution',
          selected: comps.length ? flatOpen : undefined,
          ariaLabel: `${c.title} has no security solution.${comps.length ? ` ${flatOpen ? 'Hide' : 'Show'} its ${plural(comps.length, 'component')}.` : ''}`,
          onClick: comps.length ? () => onToggle(flatKey(c.id)) : undefined });
        links.push({ from: oid, to: id, dashed: true, tone: 'bad', ...lit, label: chip });
        if (isBest) exits.push({ id: flatOpen && comps.length ? `f-${c.id}-${comps[0].id}` : id, row: r, lit, chip });
        if (flatOpen) {
          comps.forEach((cc, j) => {
            const st = partState(cc);
            const pid = `f-${c.id}-${cc.id}`;
            nodes.push({ id: pid, col: off + 2, row: r + j, kind: cc.component_type, tone: st.tone,
              ...(selected && !sel ? { faded: true } : {}),
              tag: <TypeBadge type={cc.component_type} variant="text" />, title: cc.name, detail: st.words,
              ariaLabel: `${COMPONENT_TYPE_LABEL[cc.component_type] || cc.component_type} ${cc.name}: ${st.words}` });
            links.push({ from: id, to: pid, dashed: st.tone === 'bad', ...lit });
          });
        }
      }

      sayAll.push(`${c.title} (${GROUP_WORD[g.key]}; ${flat ? 'no security solution'
        : (c.solutions || []).map((s) => `${s.name}${s.in_use ? ', in use' : ''}`).join('; ')})`);
      row += block;
    }
  });

  if (threat) {
    nodes.push({ id: 'threat', col: 0, row: threatRow ?? HEAD_STEP, kind: 'threat', tag: 'Threat', title: threat.name,
      // C, I and A are on its chip's tooltip; the box keeps to one line.
      detail: own ? `likelihood ${own} on its own` : null,
      ariaLabel: `Threat ${threat.name}: likelihood ${own ?? 'not set'} on its own.${threat.onClick ? ' Open it.' : ''}`,
      onClick: threat.onClick });
  }
  // On the right, what the best of them bring the likelihood to: the lowest
  // judged figure among the objectives in place, on each of C, I and A (the
  // risk's current likelihood), joined to the objectives setting it.
  const all = groups.flatMap((g) => g.rows);
  const { floor, deployedCount } = coverageDrivers(all, inherent);
  const bestValue = deployedCount ? Math.max(...DIMS.map((d) => floor[d])) : own;
  const lowered = deployedCount > 0 && DIMS.some((d) => floor[d] < inherent[d]);
  if (nodes.some((n) => n.id.startsWith('o-'))) {
    const bestRow = exits.length ? exits.reduce((a, x) => a + x.row, 0) / exits.length : (threatRow ?? HEAD_STEP);
    const words = deployedCount ? tripleWords(floor) : null;
    nodes.push({ id: 'best', col: off + 3, row: bestRow, tone: lowered ? 'good' : 'bad', ...(lowered && !selected ? { lit: 'var(--green)' } : {}),
      tag: 'Now', title: `Best likelihood = ${bestValue ?? '—'}`,
      badge: bestValue ? <span title={words ? `Now ${words}` : undefined}><RatingChip value={bestValue} scale="probability" variant="number" /></span> : null,
      detail: lowered ? `${words} · from ${plural(best.size, 'objective')}`
        : deployedCount ? `${words} · nothing lowers it` : 'no objective in place here',
      ariaLabel: `Best likelihood ${bestValue ?? 'not set'}${words ? ` (${words})` : ''}: `
        + (lowered ? `set by ${plural(best.size, 'control objective')}.` : 'no control objective lowers it below the threat\u2019s own.') });
    // Each line carries the likelihood its objective brings, as on its own line;
    // they converge, so the chip sits where each leaves its block.
    for (const x of exits) links.push({ from: x.id, to: 'best', strong: true, tone: 'good', ...x.lit, label: x.chip, labelAt: 'start' });
  }
  const label = `${threat ? `${threat.name}, likelihood ${own} on its own. ` : ''}Control objectives against this threat on this system: ${sayAll.join(', ') || 'none'}. `
    + `Best likelihood ${bestValue ?? 'not set'}${lowered ? `, set by ${plural(best.size, 'objective')}` : ''}.`;
  return { nodes, links, label };
}

export function RiskControlsDiagram(props) {
  const { groups, ...opts } = props;
  const { nodes, links, label } = riskControlsNodes(groups, opts);
  if (!nodes.length) return null;
  return <RelationDiagram nodes={nodes} links={links} label={label} />;
}
