// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef, useState } from 'react';
import styles from './PatternDiagram.module.css';

const TYPES = ['people', 'process', 'information', 'technology', 'facility'];

// A card's tag ("Technology · on the system · optional") with the type word in its
// PPITF colour (--ppitf-*), as a component's type reads everywhere else.
function TypeWord({ kind, text }) {
  const type = String(kind || '').split(/[\s·]/)[0].toLowerCase();
  const first = text.split(' · ')[0];
  if (!TYPES.includes(type) || first.toLowerCase() !== type) return text;
  return <><span style={{ color: `var(--ppitf-${type})` }}>{first}</span>{text.slice(first.length)}</>;
}

// THE diagram of a pattern: a security solution pattern (v176,
// src/lib/solutionPatterns.js on the server) or a system pattern (v177,
// src/lib/systemPatterns.js): its slots as cards around the centre one, joined
// by labelled arrows. Given only `pattern`, it draws the generic shape. Given `fit` too (a
// solution's pattern_fit), it draws that solution in the same shape: each card
// holds the solution's own parts and says, in words, whether the slot is in
// place, degraded or missing, so colour is never the only signal.
//
// Fixed geometry, scaled down to fit its column (never below MIN_SCALE; under
// that it scrolls sideways, as on a phone): the cards' places are what make one
// pattern look like itself wherever it is drawn. A pattern with no slot above
// (or below) the centre drops the empty band where it would be.

// Three rows of three: the centre card in the middle, slots around it.
const W = 1152, H = 568, CW = 240, CH = 104, BAND = 168, MIN_SCALE = 0.6;
const AT = {
  centre:       { left: 464, top: 232 },
  left:         { left: 64,  top: 232 },
  right:        { left: 864, top: 232 },
  top:          { left: 464, top: 64 },
  bottom:       { left: 464, top: 400 },
  top_left:     { left: 64,  top: 64 },
  top_right:    { left: 864, top: 64 },
  bottom_left:  { left: 64,  top: 400 },
  bottom_right: { left: 864, top: 400 },
};
const ABOVE = ['top', 'top_left', 'top_right'];
const BELOW = ['bottom', 'bottom_left', 'bottom_right'];
// Each arrow runs across the gap between the centre card and its slot, from the
// edge (or corner) of one to the facing edge (or corner) of the other; `in`
// points at the centre. The label sits beside the arrow.
const LINE = {
  left:         { centre: [464, 284], slot: [304, 284], label: { left: 314, top: 256, width: 140, align: 'center' } },
  right:        { centre: [704, 284], slot: [864, 284], label: { left: 714, top: 256, width: 140, align: 'center' } },
  top:          { centre: [584, 232], slot: [584, 168], label: { left: 596, top: 191, width: 200, align: 'left' } },
  bottom:       { centre: [584, 336], slot: [584, 400], label: { left: 596, top: 359, width: 200, align: 'left' } },
  top_left:     { centre: [464, 232], slot: [304, 168], label: { left: 244, top: 202, width: 150, align: 'right' } },
  top_right:    { centre: [704, 232], slot: [864, 168], label: { left: 794, top: 202, width: 150, align: 'left' } },
  bottom_left:  { centre: [464, 336], slot: [304, 400], label: { left: 244, top: 350, width: 150, align: 'right' } },
  bottom_right: { centre: [704, 336], slot: [864, 400], label: { left: 794, top: 350, width: 150, align: 'left' } },
};

const STATE_WORD = {
  complete: 'in place', recorded: 'recorded', degraded: 'degraded', not_in_place: 'not in place yet',
  missing: 'missing', not_recorded: 'optional, not recorded', not_needed: 'not needed here',
};

function Arrow({ position, dir, tone }) {
  const s = LINE[position];
  const [from, to] = dir === 'in' ? [s.slot, s.centre] : [s.centre, s.slot];
  // Unit vector along the arrow; both ends stop just short of their cards.
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ux = (to[0] - from[0]) / len, uy = (to[1] - from[1]) / len;
  const tail = [from[0] + ux * 2, from[1] + uy * 2];
  const tip = [to[0] - ux * 2, to[1] - uy * 2];
  const back = [tip[0] - ux * 9, tip[1] - uy * 9];
  const n = [-uy * 5, ux * 5];
  const head = `${tip[0]},${tip[1]} ${back[0] + n[0]},${back[1] + n[1]} ${back[0] - n[0]},${back[1] - n[1]}`;
  return (
    <g className={`${styles.arrow} ${styles[`tone_${tone}`] || ''}`}>
      <line x1={tail[0]} y1={tail[1]} x2={back[0]} y2={back[1]} />
      <polygon points={head} />
    </g>
  );
}

// Every name, never "A, B +2": with more than one the card wraps them over up to
// three lines (owner, 2026-11-17: the detail was lost in the small box), and the
// whole list is the card's tooltip.
function partsText(slot) {
  if (!slot.parts.length) return null;
  return slot.parts.map(p => p.name).join(', ');
}

function instanceDetail(def, slot) {
  if (slot.state === 'missing') return `required: nothing recorded as ${def.label.toLowerCase()}`;
  if (slot.state === 'not_recorded') return def.hint;
  if (slot.state === 'not_needed') return 'not needed for this solution';
  const degraded = slot.parts.filter(p => p.degraded_on > 0);
  if (degraded.length) {
    const n = Math.max(...degraded.map(p => p.degraded_on));
    return `degraded on ${n} system${n === 1 ? '' : 's'}`;
  }
  if (slot.state === 'not_in_place') return 'recorded, not yet in place';
  return def.label;
}

// The scale at which W fits the element's width, between MIN_SCALE and 1.
function useFitScale() {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setScale(Math.min(1, Math.max(MIN_SCALE, w / W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, scale];
}

// `asQuestions` (a system against its pattern): an empty required slot is an
// unanswered question, named as one; `answerHint` says where it is answered.
// `marked` (a Set of component ids) rings each card holding one of them and says
// so in words (a risk's vulnerable components, 2026-11-19); `onSlot(key, parts)`
// makes each card a button, as the folded view of a section.
export function PatternDiagram({ pattern, fit = null, muted = false, label, asQuestions = false, answerHint = null,
  marked = null, markedWord = 'vulnerable', onSlot = null }) {
  const [ref, scale] = useFitScale();
  const dy = pattern.slots.some(s => ABOVE.includes(s.position)) ? 0 : BAND;
  const h = H - dy - (pattern.slots.some(s => BELOW.includes(s.position)) ? 0 : BAND);
  const byKey = Object.fromEntries((fit?.slots || []).map(s => [s.key, s]));
  const summary = label || (fit
    ? `${pattern.name}: ${fit.slots.map(s => `${s.label} ${STATE_WORD[s.state]}`).join('; ')}`
    : `${pattern.name}: ${pattern.slots.map(s => s.label).join(', ')}`);
  return (
    <div className={styles.scroll} ref={ref}>
      <figure className={`${styles.host} ${muted ? styles.muted : ''}`} style={{ width: W * scale, height: h * scale }} aria-label={summary}>
        <div className={styles.stage} style={{ width: W, height: H, top: -dy * scale, transform: `scale(${scale})` }}>
          <svg className={styles.lines} width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {pattern.slots.filter(s => s.position !== 'centre').map(s => {
              const state = byKey[s.key]?.state;
              const tone = !fit ? 'plain' : state === 'missing' ? 'missing' : state === 'degraded' ? 'degraded'
                : state === 'complete' || state === 'recorded' ? 'complete' : 'quiet';
              return <Arrow key={s.key} position={s.position} dir={s.arrow.dir} tone={tone} />;
            })}
          </svg>
          {pattern.slots.map(def => {
            const at = AT[def.position];
            const slot = byKey[def.key];
            const state = fit ? slot?.state : (def.required ? 'generic' : 'optional');
            // A required question with nothing recorded names the question, not the
            // kind of component: "Isolated network · not answered", never "Technology · missing".
            const unanswered = asQuestions && fit && state === 'missing';
            const tag = unanswered ? 'Not answered'
              : fit ? `${def.kind.split(' · ')[0]} · ${STATE_WORD[state]}`
              : `${def.kind}${def.required ? '' : ' · optional'}`;
            const title = unanswered ? def.label
              : fit ? (partsText(slot) || (state === 'not_needed' ? def.label : `No ${def.label.toLowerCase()}`)) : def.label;
            const many = fit && (slot?.parts?.length || 0) > 1;
            const hits = marked ? (slot?.parts || []).filter(p => marked.has(p.id)) : [];
            const detail = many ? null : unanswered ? (answerHint ? `Required. ${answerHint}` : 'Required: nothing recorded answers it.')
              : fit ? instanceDetail(def, slot) : def.hint;
            const markNote = hits.length ? `${markedWord}: ${hits.map(p => p.name).join(', ')}` : null;
            const cls = `${styles.card} ${styles[`state_${state}`] || ''} ${hits.length ? styles.marked : ''} ${onSlot ? styles.clickable : ''}`;
            const cardStyle = { left: at.left, top: at.top, width: CW, height: CH };
            const tip = [many ? `${def.label}: ${slot.parts.map(p => p.name).join(', ')}` : null, markNote].filter(Boolean).join('. ') || undefined;
            const inner = (<>
              <span className={styles.tag}><TypeWord kind={def.kind} text={many ? `${tag} · ${slot.parts.length}` : tag} /></span>
              <b className={`${styles.title} ${many ? styles.titleMany : ''}`}>{title}</b>
              {markNote ? <span className={styles.markNote}>{markNote}</span> : detail && <span className={styles.detail}>{detail}</span>}
            </>);
            return onSlot ? (
              <button type="button" key={def.key} className={cls} style={cardStyle} data-slot={def.key} data-state={state}
                title={tip} aria-label={`${def.label}: ${title}${markNote ? `. ${markNote}` : ''}`}
                onClick={() => onSlot(def.key, slot?.parts || [])}>{inner}</button>
            ) : (
              <div key={def.key} className={cls} style={cardStyle} data-slot={def.key} data-state={state} title={tip}>{inner}</div>
            );
          })}
          {pattern.slots.filter(s => s.position !== 'centre').map(s => {
            const l = LINE[s.position].label;
            const state = byKey[s.key]?.state;
            return (
              <span key={`l-${s.key}`} className={`${styles.label} ${fit && state === 'missing' ? styles.labelMissing : ''}`}
                style={{ left: l.left, top: l.top, width: l.width, textAlign: l.align }}>
                {s.arrow.label}
              </span>
            );
          })}
        </div>
      </figure>
    </div>
  );
}

export const PATTERN_STATE_WORD = STATE_WORD;
