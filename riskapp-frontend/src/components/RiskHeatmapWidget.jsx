// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * RiskHeatmapWidget.jsx  (replaces previous single-grid version)
 *
 * Dashboard widget showing two side-by-side 5×5 heatmap grids:
 *   Left  — CURRENT  (validated risks)
 *   Right — FUTURE   (pending / returned risks)
 *
 * Clicking either grid navigates to /risks/current or /risks/future.
 * Reuses the existing CSS module (RiskHeatmapWidget.module.css) — the grid
 * and cell classes are unchanged. New layout classes (dual, panel, panelTitle)
 * are appended to the same module.
 */

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { getCurrentRisks, getFutureRisks } from '../api';
import { buildCurrentRiskMatrix, severityKey } from '../utils/heatmapUtils';
import styles from './RiskHeatmapWidget.module.css';
import { HelpDot } from './HelpDot';

// ── small reusable grid ───────────────────────────────────────────────────────

function MiniGrid({ matrix, onClick, ariaLabel }) {
  return (
    <button
      className={styles.gridWrapper}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <span className={styles.axisLabelY}>PROBABILITY →</span>
      <div className={styles.gridArea}>
        <div className={styles.grid}>
          {[5, 4, 3, 2, 1].map(p =>
            [1, 2, 3, 4, 5].map(i => {
              const count = matrix[p]?.[i] ?? 0;
              const key   = severityKey(i, p, count);
              return (
                <div
                  key={`${p}-${i}`}
                  className={`${styles.cell} ${styles[key]}`}
                  title={`Impact ${i}, Probability ${p}: ${count} risk${count !== 1 ? 's' : ''}`}
                >
                  {count > 0 && <span className={styles.cellCount}>{count}</span>}
                </div>
              );
            })
          )}
        </div>
        <div className={styles.xAxis}>
          {[1, 2, 3, 4, 5].map(i => (
            <span key={i} className={styles.axisTickX}>{i}</span>
          ))}
        </div>
      </div>
      <span className={styles.axisLabelX}>IMPACT →</span>
    </button>
  );
}

// ── main widget ───────────────────────────────────────────────────────────────

export function RiskHeatmapWidget() {
  const [currentRisks, setCurrentRisks] = useState([]);
  const [futureRisks,  setFutureRisks]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cur, fut] = await Promise.all([getCurrentRisks(), getFutureRisks()]);
        if (!cancelled) {
          setCurrentRisks(cur.risks);
          setFutureRisks(fut.risks);
        }
      } catch {
        if (!cancelled) setError('Could not load risk data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const currentMatrix = buildCurrentRiskMatrix(currentRisks);
  const futureMatrix  = buildCurrentRiskMatrix(futureRisks);

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>Risk Heat Map<HelpDot k="widget.risk_heatmap" placement="bottom" label="About Risk Heat Map" /></span>
        <span className={styles.badge}>
          {currentRisks.length + futureRisks.length} RISKS
        </span>
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.skeleton} aria-label="Loading…">
            <div className={styles.skeletonGrid} />
          </div>
        )}
        {!loading && error && <p className={styles.error}>{error}</p>}

        {!loading && !error && (
          <>
            <div className={styles.dual}>
              {/* ── current panel ── */}
              <div className={styles.panel}>
                <span className={styles.panelTitle}>
                  CURRENT<HelpDot k="widget.heatmap_current" placement="bottom" />
                  <span className={styles.panelCount}>{currentRisks.length}</span>
                </span>
                <MiniGrid
                  matrix={currentMatrix}
                  onClick={() => navigate('/risks/current')}
                  ariaLabel="Open current risk summary"
                />
              </div>

              <div className={styles.panelDivider} />

              {/* ── future panel ── */}
              <div className={styles.panel}>
                <span className={styles.panelTitle}>
                  FUTURE<HelpDot k="widget.heatmap_future" placement="bottom" />
                  <span className={styles.panelCount}>{futureRisks.length}</span>
                </span>
                <MiniGrid
                  matrix={futureMatrix}
                  onClick={() => navigate('/risks/future')}
                  ariaLabel="Open new risk summary"
                />
              </div>
            </div>

            {/* Legend — directly under the grids, not pinned to widget bottom */}
            <div className={styles.legend}>
              <span className={`${styles.legendDot} ${styles.cellLow}`} />
              <span className={styles.legendLabel}>Low</span>
              <span className={`${styles.legendDot} ${styles.cellMedium}`} />
              <span className={styles.legendLabel}>Medium</span>
              <span className={`${styles.legendDot} ${styles.cellHigh}`} />
              <span className={styles.legendLabel}>High</span>
              <span className={`${styles.legendDot} ${styles.cellCritical}`} />
              <span className={styles.legendLabel}>Critical</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
