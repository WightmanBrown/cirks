// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import styles from './CompletenessRing.module.css';

// A ring (torus pie) showing how complete something is: how many of a set are
// complete (green), partial (amber) and missing (red). The centre shows the
// share complete. Colour never carries the meaning alone: the counts are given
// in words beside the ring (unless `showCounts` is false, when the caller says
// them) and in the ring's accessible label and tooltip.
//
// `labels` names the three states for this use, e.g. { partial: 'expired' }.

const DEFAULT_LABELS = { complete: 'complete', partial: 'partial', missing: 'missing' };
const ORDER = ['complete', 'partial', 'missing'];
const TOKEN = { complete: 'var(--green)', partial: 'var(--amber)', missing: 'var(--red)' };

// A gap of the surface colour between segments, in degrees of arc.
const GAP_DEG = 6;

function arcPath(cx, cy, r, startDeg, endDeg) {
  const rad = (d) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function completenessSummary(counts, labels = DEFAULT_LABELS) {
  return ORDER
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${labels[k] ?? DEFAULT_LABELS[k]}`)
    .join(', ');
}

export function CompletenessRing({
  complete = 0, partial = 0, missing = 0,
  size = 40, labels: labelsIn, showCounts = true, of = '',
}) {
  const labels = { ...DEFAULT_LABELS, ...labelsIn };
  const counts = { complete, partial, missing };
  const total = complete + partial + missing;
  const stroke = Math.max(4, Math.round(size * 0.16));
  const r = (size - stroke) / 2;
  const c = size / 2;
  // Rounded down: 100% only when every one is complete.
  const pct = total ? Math.floor((complete / total) * 100) : null;
  const summary = total
    ? `${pct}% complete${of ? ` of ${total} ${of}` : ''}: ${completenessSummary(counts, labels)}`
    : `Nothing to measure${of ? ` (no ${of})` : ''}`;

  const segments = [];
  const present = ORDER.filter((k) => counts[k] > 0);
  if (present.length === 1) {
    segments.push({ key: present[0], full: true });
  } else {
    let at = 0;
    for (const k of present) {
      const sweep = (counts[k] / total) * 360;
      // Keep a sliver visible for a tiny share, and leave the gap.
      const start = at + GAP_DEG / 2;
      const end = Math.max(start + 1, at + sweep - GAP_DEG / 2);
      segments.push({ key: k, d: arcPath(c, c, r, start, end) });
      at += sweep;
    }
  }

  return (
    <span className={styles.wrap} title={summary}>
      <svg
        className={styles.ring}
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        role="img" aria-label={summary}
      >
        {total === 0 && (
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        )}
        {segments.map((s) => (s.full
          ? <circle key={s.key} data-state={s.key} cx={c} cy={c} r={r} fill="none" stroke={TOKEN[s.key]} strokeWidth={stroke} />
          : <path key={s.key} data-state={s.key} d={s.d} fill="none" stroke={TOKEN[s.key]} strokeWidth={stroke} strokeLinecap="butt" />
        ))}
        {size >= 32 && (
          <text x={c} y={c} className={styles.centre} textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: Math.max(8, Math.round(size * (pct === 100 ? 0.21 : 0.26))) }}>
            {total ? `${pct}%` : '—'}
          </text>
        )}
      </svg>
      {showCounts && total > 0 && (
        <span className={styles.counts} aria-hidden="true">
          {ORDER.filter((k) => counts[k] > 0).map((k) => (
            <span key={k} className={styles.count}>
              <span className={`${styles.dot} ${styles[k]}`} />
              {counts[k]} {labels[k]}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
