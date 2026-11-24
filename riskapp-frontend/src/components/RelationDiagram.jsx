// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef, useState } from 'react';
import styles from './RelationDiagram.module.css';

// THE box-and-stick diagram (owner, 2026-11-19; docs/relation-diagrams.md): boxes
// placed on a grid of columns and rows, joined by lines that run horizontally and
// vertically with rounded corners. Lines into the same box share their last
// stretch, so a fan-out (one threat to its controls) and a fan-in (the controls
// to one probability) read as a trunk with branches, not a tangle.
//
// It is the FOLDED view of a section: a picture of the record. A box with
// `onClick` is a button that opens the section beneath and goes to that record,
// where it is read in full and edited. Every box also says what it is in words,
// so colour is never the only signal, and `label` gives the whole picture to a
// screen reader.
//
//   nodes  [{ id, col, row, tag, title, detail, detailLines, tone, kind, onClick, w, h, render, ariaLabel }]
//          detailLines: 2 lets the detail wrap (for a box whose title is one line).
//          badge: a chip drawn at the end of the tag line (a risk's score chip).
//          framed: draws a custom box (render) with a visible frame, so a picture
//          screenshot on its own still says what it is (the grid named for its system).
//          stripe: a colour token (var(--…)) for the box's left trim, overriding
//          its kind: the colour a list filtered by this box wears too.
//          selected: true/false makes the box a toggle (aria-pressed), drawn
//          heavier when chosen: one of a list whose picture is shown.
//          col/row place the box (row may be fractional, to centre a box on a
//          stack); w/h override the box size; render() draws custom content
//          (the probability-impact grid) in place of tag/title/detail.
//          tone: good | warn | bad | quiet; kind: threat | asset | risk | control
//          | technology | people | process | information | facility (a stripe).
//          lit: a colour token: the box is outlined and tinted in it, one of
//          those a chosen box leads to (the solutions of a chosen objective).
//          faded: drawn faint, not one of them.
//   links  [{ from, to, into: 'left' | 'top' | 'bottom', strong, dashed, tone, label, lit, faded }]
//          lit: a colour token the line is drawn in, heavy and on top, so the
//          chosen box's lines can be followed through a shared trunk; faded: faint.
//          label: words written beside the link's last stretch (the value it
//          carries into the box, e.g. "likelihood 5"); labelAt: 'start' writes it
//          beside the first stretch, for lines that converge and share the last.
//
// Fixed geometry, scaled to fit its column (never below MIN_SCALE; under that it
// scrolls sideways, as the pattern diagrams do on a phone).

export const BOX_W = 196;
export const BOX_H = 80;
const COL_GAP = 64;
const ROW_PITCH = 90;
const PAD = 12;
const RADIUS = 8;
const MIN_SCALE = 0.55;

const boxOf = (n) => {
  const w = n.w ?? BOX_W;
  const h = n.h ?? BOX_H;
  const x = PAD + n.col * (BOX_W + COL_GAP);
  // A box sits centred on its row's line, so boxes of different heights on the
  // same row share a centre line and a link between them runs straight.
  const cy = PAD + BOX_H / 2 + n.row * ROW_PITCH;
  return { x, y: cy - h / 2, w, h, cy, cx: x + w / 2 };
};

// The corner points of a link: out of the right side of `a`, into the left of
// `b` (turning in the gutter just before `b`, which is what makes links into one
// box share a trunk), down into the top of `b` or up into its bottom.
export function routeOf(a, b, into = 'left') {
  const start = [a.x + a.w, a.cy];
  if (into === 'top') return [start, [b.cx, a.cy], [b.cx, b.y]];
  if (into === 'bottom') return [start, [b.cx, a.cy], [b.cx, b.y + b.h]];
  const end = [b.x, b.cy];
  if (Math.abs(start[1] - end[1]) < 0.5) return [start, end];
  const mid = b.x - COL_GAP / 2;
  return [start, [mid, start[1]], [mid, end[1]], end];
}

// A polyline as an SVG path with each corner rounded (never more than half the
// shorter of its two stretches, so short jogs stay clean).
export function roundedPath(points, r = RADIUS) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const k = Math.min(r, inLen / 2, outLen / 2);
    const ax = x - ((x - px) / (inLen || 1)) * k;
    const ay = y - ((y - py) / (inLen || 1)) * k;
    const bx = x + ((nx - x) / (outLen || 1)) * k;
    const by = y + ((ny - y) / (outLen || 1)) * k;
    d += ` L${ax},${ay} Q${x},${y} ${bx},${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}

function useFitScale(width) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setScale(Math.min(1, Math.max(MIN_SCALE, w / width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return [ref, scale];
}

// Where a link's label sits: beside its last stretch, to the right of a vertical
// one, centred above a horizontal one.
// `start` puts it beside the first stretch instead: for lines converging on one
// box, whose last stretch they all share.
function labelAt(points, at) {
  const [x1, y1] = at === 'start' ? points[0] : points[points.length - 2];
  const [x2, y2] = at === 'start' ? points[1] : points[points.length - 1];
  if (Math.abs(x1 - x2) < 0.5) return { left: x2 + 8, top: (y1 + y2) / 2 - 9, transform: 'none' };
  return { left: (x1 + x2) / 2, top: y2 - 22, transform: 'translateX(-50%)' };
}

function Box({ node, box }) {
  const cls = [styles.box, node.tone ? styles[`tone_${node.tone}`] : '', node.kind ? styles[`kind_${node.kind}`] : '',
    node.render ? styles.custom : '', node.framed ? styles.framed : '', node.selected ? styles.selected : '',
    node.lit ? styles.lit : '', node.faded ? styles.faded : ''].join(' ');
  // A chosen box with its own colour is outlined and tinted in that colour, so it
  // and the list it filters read as a pair.
  const stripe = node.stripe ? (node.selected
    ? { borderColor: node.stripe, background: `color-mix(in srgb, ${node.stripe} 16%, var(--bg-elevated))` }
    : { borderLeftColor: node.stripe }) : {};
  const lit = node.lit ? { borderColor: node.lit, background: `color-mix(in srgb, ${node.lit} 12%, var(--bg-elevated))` } : {};
  const style = { left: box.x, top: box.y, width: box.w, height: box.h, ...stripe, ...lit };
  const content = node.render ? node.render() : (<>
    {(node.tag || node.badge) && (
      <span className={styles.tagRow}>
        {node.tag && <span className={styles.tag}>{node.tag}</span>}
        {node.badge && <span className={styles.badge}>{node.badge}</span>}
      </span>
    )}
    <b className={styles.title}>{node.title}</b>
    {node.detail && <span className={`${styles.detail} ${node.detailLines === 2 ? styles.detail2 : ''}`}>{node.detail}</span>}
  </>);
  const name = node.ariaLabel || [node.tag, node.title, node.detail].filter(Boolean).join(': ');
  return node.onClick ? (
    <button type="button" className={`${cls} ${styles.clickable}`} style={style} onClick={node.onClick}
      aria-label={name} title={name} data-node={node.id}
      aria-pressed={node.selected === undefined ? undefined : node.selected}>{content}</button>
  ) : (
    <div className={cls} style={style} title={node.render ? undefined : name} data-node={node.id}>{content}</div>
  );
}

export function RelationDiagram({ nodes, links = [], label }) {
  const boxes = Object.fromEntries(nodes.map((n) => [n.id, boxOf(n)]));
  const width = Math.max(...nodes.map((n) => boxes[n.id].x + boxes[n.id].w)) + PAD;
  const height = Math.max(...nodes.map((n) => boxes[n.id].y + boxes[n.id].h)) + PAD;
  const [ref, scale] = useFitScale(width);
  // Lit lines are drawn last, so they lie over the trunks they share; each
  // colour has its own arrowhead.
  const drawn = links.filter((l) => boxes[l.from] && boxes[l.to]);
  drawn.sort((a, b) => Number(!!a.lit) - Number(!!b.lit));
  const litColours = [...new Set(drawn.filter((l) => l.lit).map((l) => l.lit))];
  const headOf = (l) => (l.lit ? `url(#rd-head-${litColours.indexOf(l.lit)})` : 'url(#rd-head)');
  return (
    <div className={styles.scroll} ref={ref}>
      <figure className={styles.host} style={{ width: width * scale, height: height * scale }} aria-label={label}>
        <div className={styles.stage} style={{ width, height, transform: `scale(${scale})` }}>
          <svg className={styles.lines} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs>
              <marker id="rd-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className={styles.head} />
              </marker>
              {litColours.map((c, k) => (
                <marker key={c} id={`rd-head-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" style={{ fill: c }} />
                </marker>
              ))}
            </defs>
            {drawn.map((l) => (
              <path key={`${l.from}-${l.to}`} d={roundedPath(routeOf(boxes[l.from], boxes[l.to], l.into))}
                className={[styles.link, l.strong ? styles.strong : '', l.dashed ? styles.dashed : '',
                  l.tone ? styles[`link_${l.tone}`] : '', l.lit ? styles.litLink : '', l.faded ? styles.fadedLink : ''].join(' ')}
                style={l.lit ? { stroke: l.lit } : undefined}
                markerEnd={l.arrow === false ? undefined : headOf(l)} data-link={`${l.from}>${l.to}`} />
            ))}
          </svg>
          {nodes.map((n) => <Box key={n.id} node={n} box={boxes[n.id]} />)}
          {links.filter((l) => l.label && boxes[l.from] && boxes[l.to]).map((l) => (
            <span key={`label-${l.from}-${l.to}`} className={styles.linkLabel} aria-hidden="true"
              style={{ ...labelAt(routeOf(boxes[l.from], boxes[l.to], l.into), l.labelAt), ...(l.faded ? { opacity: 0.3 } : {}) }}>{l.label}</span>
          ))}
        </div>
      </figure>
    </div>
  );
}
