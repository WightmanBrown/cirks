// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { scoreLevel } from '../utils/riskColors';
import { HelpDot } from './HelpDot';
import styles from './RiskGrid.module.css';

// THE probability-impact grid (owner, 2026-11-03: the board summary's version,
// used everywhere a grid appears). Impact runs up the side (5 at the top),
// likelihood along the bottom. Every square is coloured by the risk band of its
// likelihood × impact, as everywhere in CIRKS; an empty square is faded, so the
// shape of the bands always shows.
//
//   countAt(impact, likelihood)  how many risks sit in that square (a count grid)
//   marked { likelihood, impact } one risk's position instead (shows its score)
//   selected { likelihood, impact } the square a list is filtered to
//   onCellClick(likelihood, impact) makes each square a button
//   onClick                      makes the whole grid one button (a widget link)
//   label, helpKey, caption      above (with its help dot) and below the grid
//   size                         'small' | 'normal' | 'large'

const plural = (n) => `${n} ${n === 1 ? 'risk' : 'risks'}`;

export function RiskGrid({
  countAt, marked, selected, onCellClick, onClick, label, helpKey, caption, size = 'normal', ariaLabel,
}) {
  const isMarked = (i, p) => marked && marked.impact === i && marked.likelihood === p;
  const isSelected = (i, p) => selected && selected.impact === i && selected.likelihood === p;
  const total = countAt ? [1, 2, 3, 4, 5].reduce((a, i) => a + [1, 2, 3, 4, 5].reduce((b, p) => b + (countAt(i, p) || 0), 0), 0) : null;

  const body = (
    <div className={styles.body}>
      <span className={styles.yAxis}>Impact</span>
      <div className={styles.grid} role="table">
        {[5, 4, 3, 2, 1].map((impact) => (
          <div key={impact} className={styles.row} role="row">
            <span className={styles.tick} role="rowheader">{impact}</span>
            {[1, 2, 3, 4, 5].map((p) => {
              const n = countAt ? countAt(impact, p) || 0 : 0;
              const here = isMarked(impact, p);
              const filled = countAt ? n > 0 : here;
              const score = impact * p;
              const title = countAt
                ? `Impact ${impact}, likelihood ${p} (score ${score}): ${plural(n)}`
                : here ? `Impact ${impact} × likelihood ${p} = ${score}` : `Impact ${impact}, likelihood ${p} (score ${score})`;
              const cls = [styles.cell, styles[`band_${scoreLevel(score)}`], filled ? '' : styles.empty,
                           isSelected(impact, p) ? styles.selected : '', here ? styles.marked : ''].join(' ');
              const text = countAt ? (n > 0 ? n : '') : (here ? score : '');
              return onCellClick ? (
                <button key={p} type="button" role="cell" className={cls} title={title}
                        aria-pressed={isSelected(impact, p)} onClick={() => onCellClick(p, impact)}>{text}</button>
              ) : (
                <span key={p} role="cell" className={cls} title={title}>{text}</span>
              );
            })}
          </div>
        ))}
        <div className={styles.row} aria-hidden="true">
          <span className={styles.tick} />
          {[1, 2, 3, 4, 5].map((p) => <span key={p} className={styles.tick}>{p}</span>)}
        </div>
      </div>
    </div>
  );

  const name = ariaLabel || [label, total != null ? plural(total) : null].filter(Boolean).join(': ');
  const content = <>
    {label && <span className={styles.label}>{label}{helpKey && <> <HelpDot k={helpKey} placement="bottom" /></>}</span>}
    {body}
    <span className={styles.caption}>Likelihood →{caption ? ` · ${caption}` : ''}</span>
  </>;

  return onClick ? (
    <button type="button" className={`${styles.wrap} ${styles[size]} ${styles.clickable}`} onClick={onClick} aria-label={name}>{content}</button>
  ) : (
    <figure className={`${styles.wrap} ${styles[size]}`} aria-label={name}>{content}</figure>
  );
}
