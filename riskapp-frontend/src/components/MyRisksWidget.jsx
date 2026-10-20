// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo }                   from 'react';
import { useNavigate }                                    from 'react-router-dom';
import { getCurrentRisks, getFutureRisks, getMyRiskTrends } from '../api';
import { buildCurrentRiskMatrix, severityKey }            from '../utils/heatmapUtils';
import { RatingChip }                                     from './RatingChip';
import { useAuth }                                        from '../context/AuthContext';
import { inDepartment, departmentsIn }                    from '../utils/departmentScope';

import grid       from './RiskHeatmapWidget.module.css';
import listStyles from './WidgetShared.module.css';
import styles     from './MyRisksWidget.module.css';
import { HelpDot } from './HelpDot';

// ── Department display filter ───────────────────────────────────────────────
// This is a PRESENTATION filter, not an access control. When
// org_config.department_isolation is off ("spreadsheet mode" — a legitimate
// deployment choice for orgs that do not want departmental walls), the backend
// deliberately returns every risk to a dept-scoped role: see the short-circuit
// in riskHeatmapDetailController.js, where `!isDepartmentIsolationEnabled()`
// bypasses the IAM/IAO scoping branch entirely.
//
// That is correct for authorisation and wrong for a widget called "My Risks" —
// an IAM for one department was being shown the whole organisation's register
// under a heading claiming it was theirs. So the widget defaults to the
// caller's own department and lets them widen deliberately.
//
// The control is derived from the DATA, not from the isolation flag: it appears
// only when the rows actually span more than one department. With isolation ON
// the backend has already scoped them, one department comes back, and no
// control renders — no branch on config needed.

// Thin wrappers over utils/departmentScope so the widget shares one predicate
// with the four list pages. Originally these matched on department NAME because
// the heatmap endpoint returned no id; it now returns department_id, so the
// widget matches on the identifier like everything else.
export function departmentsOf(risks) {
  return departmentsIn(risks).map(d => d.name);
}

export function filterByDepartment(risks, departmentId) {
  return (risks ?? []).filter(r => inDepartment(r, departmentId));
}

function riskScore(r) {
  return Math.max(
    (r.prob_c ?? 0) * (r.residual_impact_c ?? r.impact_c ?? 0),
    (r.prob_i ?? 0) * (r.residual_impact_i ?? r.impact_i ?? 0),
    (r.prob_a ?? 0) * (r.residual_impact_a ?? r.impact_a ?? 0),
  );
}

function MiniGrid({ matrix, onClick, ariaLabel }) {
  return (
    <button className={grid.gridWrapper} onClick={onClick} aria-label={ariaLabel}>
      <span className={grid.axisLabelY}>PROBABILITY →</span>
      <div className={grid.gridArea}>
        <div className={grid.grid}>
          {[5, 4, 3, 2, 1].map(p =>
            [1, 2, 3, 4, 5].map(i => {
              const count = matrix[p]?.[i] ?? 0;
              const key   = severityKey(i, p, count);
              return (
                <div
                  key={`${p}-${i}`}
                  className={`${grid.cell} ${grid[key]}`}
                  title={`Impact ${i}, Probability ${p}: ${count} risk${count !== 1 ? 's' : ''}`}
                >
                  {count > 0 && <span className={grid.cellCount}>{count}</span>}
                </div>
              );
            })
          )}
        </div>
        <div className={grid.xAxis}>
          {[1, 2, 3, 4, 5].map(i => (
            <span key={i} className={grid.axisTickX}>{i}</span>
          ))}
        </div>
      </div>
      <span className={grid.axisLabelX}>IMPACT →</span>
    </button>
  );
}

function TrendSection({ trends }) {
  if (!trends) return null;
  const { new_count, increased_count, reduced_count, eliminated_count, last_swg_date } = trends;

  const items = [
    { label: 'New risks',       count: new_count,        cls: styles.trendNew     },
    { label: 'Increased risks', count: increased_count,  cls: styles.trendWorse   },
    { label: 'Improved risks',  count: reduced_count,    cls: styles.trendBetter  },
    { label: 'Removed risks',   count: eliminated_count, cls: styles.trendNeutral },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        Since last SWG{last_swg_date ? ` · ${last_swg_date}` : ''}
      </div>
      <div className={styles.trendList}>
        {items.map(({ label, count, cls }) => (
          <div key={label} className={styles.trendRow}>
            <span className={styles.trendRowLabel}>{label}</span>
            <span className={`${styles.trendRowCount} ${cls}`}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Top5Risks({ risks }) {
  const navigate = useNavigate();
  if (!risks.length) return null;

  const top5 = [...risks]
    .map(r => ({ ...r, _score: riskScore(r) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score || a.system_name.localeCompare(b.system_name))
    .slice(0, 5);

  if (!top5.length) return null;

  function riskListHref(r) {
    const view = r.validation_status === 'validated' ? 'current' : 'future';
    return `/risks/${view}?selected=${r.risk_id}`;
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>Top risks</div>
      <div className={listStyles.list}>
        {top5.map(r => (
          <div
            key={r.risk_id}
            className={listStyles.row}
            onClick={() => navigate(riskListHref(r))}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && navigate(riskListHref(r))}
            aria-label={`${r.system_name}: ${r.threat_name}`}
          >
            <span className={listStyles.name}>
              {r.system_name} · {r.threat_name}
            </span>
            <RatingChip value={r._score} scale="risk" variant="word" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MyRisksWidget() {
  const [currentRisks, setCurrentRisks] = useState([]);
  const [futureRisks,  setFutureRisks]  = useState([]);
  const [trends,       setTrends]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [showAllDepts, setShowAllDepts] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const myDeptId = user?.department_id   || null;
  const myDept   = user?.department_name || null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cur, fut, trnd] = await Promise.all([
          getCurrentRisks(),
          getFutureRisks(),
          getMyRiskTrends(),
        ]);
        if (!cancelled) {
          setCurrentRisks(cur.risks);
          setFutureRisks(fut.risks);
          setTrends(trnd);
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

  // Offer the filter only when the payload genuinely spans several departments
  // AND we know which one is the caller's — otherwise there is nothing to
  // choose between and the control would be noise.
  const canFilter = useMemo(
    () => Boolean(myDeptId) && departmentsIn([...currentRisks, ...futureRisks]).length > 1,
    [currentRisks, futureRisks, myDeptId],
  );

  const activeDept    = canFilter && !showAllDepts ? myDeptId : null;
  const scopedCurrent = filterByDepartment(currentRisks, activeDept);
  const scopedFuture  = filterByDepartment(futureRisks,  activeDept);

  const currentMatrix = buildCurrentRiskMatrix(scopedCurrent);
  const futureMatrix  = buildCurrentRiskMatrix(scopedFuture);
  const allRisks      = [...scopedCurrent, ...scopedFuture];

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>My Risks<HelpDot k="widget.my_risks" placement="bottom" label="About My Risks" /></span>
        {!loading && !error && (
          <span className={styles.headerRight}>
            {canFilter && (
              <button
                type="button"
                className={styles.scopeToggle}
                onClick={() => setShowAllDepts(v => !v)}
                aria-pressed={showAllDepts}
                title={showAllDepts
                  ? `Showing every department — click to show only ${myDept}`
                  : `Showing only ${myDept} — click to show every department`}
              >
                {showAllDepts ? 'All departments' : myDept}
              </button>
            )}
            <span className={grid.badge}>{allRisks.length} RISKS</span>
          </span>
        )}
      </div>

      <div className={grid.body}>
        {loading && (
          <div className={grid.skeleton}>
            <div className={grid.skeletonGrid} />
          </div>
        )}
        {!loading && error && <p className={grid.error}>{error}</p>}

        {!loading && !error && (
          <>
            <div className={grid.dual}>
              <div className={grid.panel}>
                <span className={grid.panelTitle}>
                  CURRENT
                  <span className={grid.panelCount}>{scopedCurrent.length}</span>
                </span>
                <MiniGrid
                  matrix={currentMatrix}
                  onClick={() => navigate('/risks/current')}
                  ariaLabel="Open current risk summary"
                />
              </div>

              <div className={grid.panelDivider} />

              <div className={grid.panel}>
                <span className={grid.panelTitle}>
                  FUTURE
                  <span className={grid.panelCount}>{scopedFuture.length}</span>
                </span>
                <MiniGrid
                  matrix={futureMatrix}
                  onClick={() => navigate('/risks/future')}
                  ariaLabel="Open new risk summary"
                />
              </div>
            </div>

            <div className={grid.legend}>
              <span className={`${grid.legendDot} ${grid.cellLow}`}      />
              <span className={grid.legendLabel}>Low</span>
              <span className={`${grid.legendDot} ${grid.cellMedium}`}   />
              <span className={grid.legendLabel}>Medium</span>
              <span className={`${grid.legendDot} ${grid.cellHigh}`}     />
              <span className={grid.legendLabel}>High</span>
              <span className={`${grid.legendDot} ${grid.cellCritical}`} />
              <span className={grid.legendLabel}>Critical</span>
            </div>

            {activeDept && allRisks.length === 0 && (
              <p className={styles.emptyScope}>
                No risks recorded for {myDept}.{' '}
                <button type="button" className={styles.inlineLink}
                        onClick={() => setShowAllDepts(true)}>
                  Show every department
                </button>
              </p>
            )}

            <TrendSection trends={trends} />
            <Top5Risks risks={allRisks} />
          </>
        )}
      </div>
    </div>
  );
}
