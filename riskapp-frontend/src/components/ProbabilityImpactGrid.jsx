// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { severityKey } from '../utils/heatmapUtils';
import styles from './ProbabilityImpactGrid.module.css';

/**
 * Non-interactive 5×5 Probability-Impact Grid for a single risk position.
 * Mirrors the MiniGrid visual style from RiskSummaryPage but with no click
 * handling — just marks the cell at (prob, impact) with severity colour.
 *
 * @param {string}       label   — displayed above the grid (e.g. "MAX", "C")
 * @param {number|null}  prob    — probability 1–5
 * @param {number|null}  impact  — impact 1–5
 */
export function RiskPIG({ label, prob, impact, size }) {
  const hasData = prob != null && impact != null && prob > 0 && impact > 0;
  const p = hasData ? Math.min(5, Math.max(1, Math.round(prob)))   : null;
  const i = hasData ? Math.min(5, Math.max(1, Math.round(impact))) : null;

  return (
    <div className={`${styles.pigCard} ${size === 'large' ? styles.pigLarge : ''}`}>
      {label && <span className={styles.pigLabel}>{label}</span>}
      <div className={styles.pigWrapper}>
        <span className={styles.axisLabelY}>PROB →</span>
        <div className={styles.gridArea}>
          <div className={styles.grid}>
            {[5, 4, 3, 2, 1].map(row =>
              [1, 2, 3, 4, 5].map(col => {
                const active = row === p && col === i;
                const sk     = active ? severityKey(col, row, 1) : 'cellEmpty';
                return (
                  <div
                    key={`${row}-${col}`}
                    className={`${styles.cell} ${styles[sk]} ${active ? styles.cellActive : ''}`}
                    title={active ? `Impact ${col} × Prob ${row} = ${col * row}` : undefined}
                  >
                    {active && <span className={styles.cellScore}>{col * row}</span>}
                  </div>
                );
              })
            )}
          </div>
          <div className={styles.xAxis}>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} className={styles.axisTickX}>{n}</span>
            ))}
          </div>
        </div>
        <span className={styles.axisLabelX}>IMPACT →</span>
      </div>
    </div>
  );
}
