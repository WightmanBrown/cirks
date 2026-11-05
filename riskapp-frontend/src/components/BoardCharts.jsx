// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { RiskGrid } from './RiskGrid';
import styles from './BoardCharts.module.css';

// Small charts for the board summary (docs/reporting-siro.md, report 9). Plain
// SVG and HTML on the colour tokens; every chart also says its numbers in words
// (labels, legend or tooltip), so colour is never the only signal.

// ── Heat map: the shared grid (RiskGrid) over the board's counts ─────────────
// `grid[impact - 1][probability - 1]` is a count of risks.
export function HeatMap({ grid, label }) {
  return <RiskGrid countAt={(i, p) => grid[i - 1][p - 1]} caption={label} ariaLabel={label} />;
}

// ── Stacked bar: one bar of parts with a legend in words ──────────────────────
// parts: [{ label, value, tone: 'good' | 'warn' | 'bad' | 'neutral' }]
export function StackedBar({ parts, of }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const summary = parts.filter((p) => p.value > 0).map((p) => `${p.value} ${p.label}`).join(', ');
  return (
    <div className={styles.stacked}>
      <div className={styles.bar} role="img" aria-label={total ? `${summary}${of ? ` of ${total} ${of}` : ''}` : 'Nothing to show'}>
        {total === 0 && <span className={`${styles.seg} ${styles.neutral}`} style={{ flexGrow: 1 }} />}
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.label} className={`${styles.seg} ${styles[p.tone]}`} style={{ flexGrow: p.value }}
                title={`${p.value} ${p.label}`} />
        ))}
      </div>
      <ul className={styles.legend} aria-hidden="true">
        {parts.map((p) => (
          <li key={p.label}><span className={`${styles.dot} ${styles[p.tone]}`} />{p.value} {p.label}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Trend: lines over the monthly captures ────────────────────────────────────
// series: [{ key, label, tone: 'series1' | 'series2', points: [{ period, value }] }]
export function TrendLine({ series, height = 140 }) {
  const periods = [...new Set(series.flatMap((s) => s.points.map((p) => p.period)))].sort();
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const W = 520, H = height, L = 34, R = 110, T = 10, B = 24;
  const x = (i) => L + (periods.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (periods.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const month = (p) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const ticks = [0, Math.round(max / 2), max];
  return (
    <svg className={styles.trend} viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={series.map((s) => `${s.label}: ${s.points.map((p) => `${month(p.period)} ${p.value}`).join(', ')}`).join('. ')}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={styles.grid} />
          <text x={L - 6} y={y(t)} className={styles.axis} textAnchor="end" dominantBaseline="middle">{t}</text>
        </g>
      ))}
      {periods.map((p, i) => (
        <text key={p} x={x(i)} y={H - 6} className={styles.axis} textAnchor="middle">{month(p)}</text>
      ))}
      {series.map((s) => {
        const pts = periods.map((p, i) => {
          const pt = s.points.find((q) => q.period === p);
          return pt ? { x: x(i), y: y(pt.value), v: pt.value, p } : null;
        }).filter(Boolean);
        const last = pts[pts.length - 1];
        return (
          <g key={s.key} className={styles[s.tone]}>
            {pts.length > 1 && <polyline points={pts.map((q) => `${q.x},${q.y}`).join(' ')} className={styles.line} />}
            {pts.map((q) => (
              <circle key={q.p} cx={q.x} cy={q.y} r={4} className={styles.marker}>
                <title>{`${s.label}, ${month(q.p)}: ${q.v}`}</title>
              </circle>
            ))}
            {last && <text x={last.x + 8} y={last.y} className={styles.seriesLabel} dominantBaseline="middle">{last.v} {s.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── Scatter: effort against what it removes ───────────────────────────────────
// points: [{ key, x, y, label, named }] (named ones carry their label); the top-left quarter (little effort, much
// removed) is named, so the eye goes there first.
export function Scatter({ points, xLabel, yLabel, height = 220, corner }) {
  const W = 520, H = height, L = 40, R = 16, T = 12, B = 34;
  const maxX = Math.max(1, ...points.map((p) => p.x));
  const maxY = Math.max(1, ...points.map((p) => p.y));
  const x = (v) => L + ((W - L - R) * v) / maxX;
  const y = (v) => T + (H - T - B) * (1 - v / maxY);
  return (
    <svg className={styles.scatter} viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={`${yLabel} against ${xLabel}: ${points.map((p) => `${p.label}, ${p.x} and ${p.y}`).join('; ')}`}>
      <rect x={L} y={T} width={(W - L - R) / 2} height={(H - T - B) / 2} className={styles.corner} />
      {corner && <text x={L + 6} y={T + 14} className={styles.axis}>{corner}</text>}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className={styles.grid} />
      <line x1={L} x2={L} y1={T} y2={H - B} className={styles.grid} />
      <text x={L} y={H - B + 14} className={styles.axis} textAnchor="middle">0</text>
      <text x={W - R} y={H - B + 14} className={styles.axis} textAnchor="end">{maxX}</text>
      <text x={L - 6} y={y(maxY)} className={styles.axis} textAnchor="end" dominantBaseline="middle">{maxY}</text>
      <text x={(L + W - R) / 2} y={H - 4} className={styles.axis} textAnchor="middle">{xLabel}</text>
      <text x={12} y={(T + H - B) / 2} className={styles.axis} textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel}</text>
      {points.map((p) => (
        <g key={p.key}>
          <circle cx={x(p.x)} cy={y(p.y)} r={5} className={styles.point}>
            <title>{`${p.label}: ${p.y} ${yLabel}, ${p.x} ${xLabel}`}</title>
          </circle>
          {p.named && <text x={x(p.x) + 8} y={y(p.y)} className={styles.seriesLabel} dominantBaseline="middle">{p.label}</text>}
        </g>
      ))}
    </svg>
  );
}
