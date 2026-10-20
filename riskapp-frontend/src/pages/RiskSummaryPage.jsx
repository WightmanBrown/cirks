// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// riskapp-frontend/src/pages/RiskSummaryPage.jsx

/**
 * Shared page for /risks/current and /risks/future.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  ← Back   CURRENT RISK SUMMARY  (or FUTURE…)           │
 *   ├──────────┬──────────┬──────────┬───────────────────────┤
 *   │  MAX     │  CONF    │  INT     │  AVAIL                │
 *   │  grid    │  grid    │  grid    │  grid                 │
 *   ├──────────┴──────────┴──────────┴───────────────────────┤
 *   │  Risks list — sortable by system / asset / mitigation   │
 *   │  Clicking a grid cell filters the list to that band     │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Props:
 *   view  'current' | 'future'
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams }  from 'react-router-dom';
import { useAuth }                       from '../context/AuthContext';
import { getCurrentRisks, getFutureRisks, getRisk } from '../api';
import { RiskCreateModal }               from '../components/RiskCreateModal';
import {
  buildCurrentRiskMatrix, buildConfMatrix, buildIntMatrix, buildAvailMatrix,
  currentProb, currentImpact, severityKey, filterByCell,
} from '../utils/heatmapUtils';
import { Shell }  from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { RatingChip } from '../components/RatingChip';
import { InfoTip } from '../components/InfoTip';
import { useViewMode } from '../hooks/useViewMode';
import { DepartmentScopeFilter, useDepartmentScope } from '../components/DepartmentScopeFilter';
import { applyDepartmentScope, CROSS_DEPT_ROLES }    from '../utils/departmentScope';
import styles from './RiskSummaryPage.module.css';

// ── mini grid (interactive — cells are individually clickable) ────────────────

function MiniGrid({ label, matrix, selectedP, selectedI, onCellClick }) {
  return (
    <div className={styles.gridCard}>
      <span className={styles.gridLabel}>{label}</span>
      <div className={styles.gridWrapper}>
        <span className={styles.axisLabelY}>PROB →</span>
        <div className={styles.gridArea}>
          <div className={styles.grid}>
            {[5, 4, 3, 2, 1].map(p =>
              [1, 2, 3, 4, 5].map(i => {
                const count    = matrix[p]?.[i] ?? 0;
                const sk       = severityKey(i, p, count);
                const selected = selectedP === p && selectedI === i;
                return (
                  <button
                    key={`${p}-${i}`}
                    className={[
                      styles.cell,
                      styles[sk],
                      selected ? styles.cellSelected : '',
                    ].join(' ')}
                    title={`Impact ${i}, Probability ${p}: ${count} risk${count !== 1 ? 's' : ''}`}
                    onClick={() => onCellClick(p, i)}
                    aria-pressed={selected}
                  >
                    {count > 0 && <span className={styles.cellCount}>{count}</span>}
                  </button>
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
      </div>
    </div>
  );
}

// ── score helpers ─────────────────────────────────────────────────────────────

// Inherent IMPACT (1–5), not a risk score — the worst-case business impact of
// the system, independent of likelihood. (There is no "inherent risk": a
// controls-free likelihood is a fiction; only inherent impact is meaningful.)
function inhImpact(risk, dim) {
  return risk[`impact_${dim}`] ?? 0;
}
function resScore(risk, dim) {
  return (risk[`prob_${dim}`] ?? 0) * (risk[`residual_impact_${dim}`] ?? risk[`impact_${dim}`] ?? 0);
}
function tgtScore(risk, dim) {
  if (risk[`tgt_p_${dim}`] == null) return null;
  return risk[`tgt_p_${dim}`] * (risk[`tgt_imp_${dim}`] ?? 0);
}
function inhImpactMax(risk) { return Math.max(inhImpact(risk,'c'), inhImpact(risk,'i'), inhImpact(risk,'a')); }
function resMax(risk) { return Math.max(resScore(risk,'c'), resScore(risk,'i'), resScore(risk,'a')); }
// Why the target reads as it does (v154: derived from the components being
// fixed). The case worth saying is work planned whose effect nobody has judged.
export function targetWhy(risk) {
  const n = risk.tgt_objectives || 0, judged = risk.tgt_objectives_judged || 0;
  if (n === 0) return 'No target: no open security action on this risk will bring a control objective into place.';
  const objs = `${n} control objective${n === 1 ? '' : 's'}`;
  if (judged === 0) {
    return `Work is planned that will bring ${objs} into place, but nobody has judged what ${n === 1 ? 'it achieves' : 'they achieve'} on this risk. Judge ${n === 1 ? 'it' : 'them'} on the risk page to see a target.`;
  }
  return `Derived from the open security actions on this risk: ${objs} will come into place, ${judged} of them judged.`;
}

function tgtMax(risk) {
  const s = ['c','i','a'].map(d => tgtScore(risk, d));
  if (s.every(v => v == null)) return null;
  return Math.max(...s.map(v => v ?? 0));
}

// ── sort helpers ──────────────────────────────────────────────────────────────

function sortRisks(risks, key, dir) {
  return [...risks].sort((a, b) => {
    let va, vb;
    if (key === 'name') {
      va = (a.system_name || '') + '\0' + (a.threat_name || '');
      vb = (b.system_name || '') + '\0' + (b.threat_name || '');
      const cmp = va.localeCompare(vb);
      return dir === 'asc' ? cmp : -cmp;
    }
    if (key === 'owner') {
      const cmp = (a.owner_name || '').localeCompare(b.owner_name || '');
      return dir === 'asc' ? cmp : -cmp;
    }
    if (key === 'dept') {
      const cmp = (a.department || '').localeCompare(b.department || '');
      return dir === 'asc' ? cmp : -cmp;
    }
    const [type, dim] = key.split('_'); // 'inh'|'res'|'tgt', 'c'|'i'|'a'|'max'
    if (type === 'tgt') {
      // Risks without a target sort to the bottom regardless of direction.
      va = dim === 'max' ? tgtMax(a) : tgtScore(a, dim);
      vb = dim === 'max' ? tgtMax(b) : tgtScore(b, dim);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
    } else if (dim === 'max') {
      va = type === 'inh' ? inhImpactMax(a) : resMax(a);
      vb = type === 'inh' ? inhImpactMax(b) : resMax(b);
    } else {
      va = type === 'inh' ? inhImpact(a, dim) : resScore(a, dim);
      vb = type === 'inh' ? inhImpact(b, dim) : resScore(b, dim);
    }
    return dir === 'asc' ? (va ?? 0) - (vb ?? 0) : (vb ?? 0) - (va ?? 0);
  });
}

// ── risk table row ────────────────────────────────────────────────────────────

function RiskTableRow({ risk, expertView, showStatus, isSelected, onToggle, summaryRowRef, detail }) {
  const navigate = useNavigate();
  const imp = { c: inhImpact(risk,'c'), i: inhImpact(risk,'i'), a: inhImpact(risk,'a') };
  imp.max = inhImpactMax(risk);
  const res = { c: resScore(risk,'c'), i: resScore(risk,'i'), a: resScore(risk,'a') };
  res.max = Math.max(res.c, res.i, res.a);
  const tgt = { c: tgtScore(risk,'c'), i: tgtScore(risk,'i'), a: tgtScore(risk,'a') };
  tgt.max = tgtMax(risk);
  const variant = expertView ? 'number' : 'word';
  const dims = expertView ? ['c','i','a','max'] : ['max'];
  // Name + department + owner + three score groups (inherent / current / target).
  // Risk, Department, then three score groups. There is no Owner column: the
  // owner follows from the department (v108) and is named in the unfolded row.
  const colCount = 2 + dims.length * 3;

  return (
    <>
      <tr
        className={`${styles.riskTr} ${isSelected ? styles.riskTrSelected : ''}`}
        onClick={onToggle}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
      >
        <td className={styles.tdName}>
          <span className={styles.systemName}>{risk.system_name || '—'}</span>
          <span className={styles.threatName}>{risk.threat_name}</span>
          {showStatus && risk.validation_status === 'returned' && (
            <span className={`${styles.statusChip} ${styles.statusReturned}`}
                  title={risk.validation_notes || 'Returned by the CISO — needs rework'}>
              Returned — needs rework
            </span>
          )}
          {showStatus && risk.validation_status === 'pending' && (
            <span className={`${styles.statusChip} ${styles.statusPending}`}>
              Awaiting validation
            </span>
          )}
        </td>
        <td className={styles.tdOwner}>{risk.department || <span className={styles.muted}>—</span>}</td>
        {dims.map(dim => (
          <td key={`inh_${dim}`} className={`${styles.tdScore} ${dim === 'max' ? styles.tdGroupEnd : ''}`}>
            <RatingChip value={imp[dim]} scale="impact" variant={variant} />
          </td>
        ))}
        {dims.map(dim => (
          <td key={`res_${dim}`} className={`${styles.tdScore} ${dim === 'max' ? styles.tdGroupEnd : ''}`}>
            <RatingChip value={res[dim]} scale="risk" variant={variant} />
          </td>
        ))}
        {dims.map(dim => (
          <td key={`tgt_${dim}`} className={`${styles.tdScore} ${styles.tdTgt}`} title={targetWhy(risk)}>
            <RatingChip value={tgt[dim]} scale="risk" variant={variant} />
          </td>
        ))}
      </tr>
      {isSelected && (
        <tr className={styles.summaryRow} ref={summaryRowRef}>
          <td colSpan={colCount} className={styles.summaryCell}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryField}>
                <span className={styles.summaryLabel}>Department</span>
                <span className={styles.summaryValue}>{risk.department || '—'}</span>
              </div>
              <div className={styles.summaryField}>
                <span className={styles.summaryLabel}>Risk owner</span>
                <span className={styles.summaryValue}>{detail?.owner_name || risk.owner_name || '—'}</span>
              </div>
              <div className={styles.summaryField}>
                <span className={styles.summaryLabel}>Treatment</span>
                <span className={detail?.treatment_decision ? styles.summaryValue : styles.summaryValueMuted}>
                  {detail?.treatment_decision ?? 'not set'}
                </span>
              </div>
              {detail?.rationale && (
                <div className={styles.summaryField}>
                  <span className={styles.summaryLabel}>Rationale</span>
                  <span className={styles.summaryRationale}>
                    {detail.rationale.length > 160
                      ? detail.rationale.slice(0, 160) + '…'
                      : detail.rationale}
                  </span>
                </div>
              )}
              <div className={styles.summaryActions}>
                <button
                  className={styles.summaryOpenBtn}
                  onClick={e => { e.stopPropagation(); navigate(`/risks/${risk.risk_id}`); }}
                >
                  Open full risk →
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── grid definitions ──────────────────────────────────────────────────────────

// The grids follow the same business/expert split as the table columns:
// expert breaks the risk down per dimension, business shows the single figure
// the table's "Current risk" column reports.
const EXPERT_GRID_DEFS = [
  { key: 'conf',  label: 'CONFIDENTIALITY' },
  { key: 'int',   label: 'INTEGRITY' },
  { key: 'avail', label: 'AVAILABILITY' },
];
const BUSINESS_GRID_DEFS = [
  { key: 'current', label: 'CURRENT RISK' },
];

// Accessor pairs — must mirror heatmapUtils builders so filterByCell and the
// grids agree on which cell each risk belongs to.
const ACCESSORS = {
  current: { probFn: currentProb, impactFn: currentImpact },
  conf:  { probFn: r => r.prob_c, impactFn: r => r.residual_impact_c ?? r.impact_c },
  int:   { probFn: r => r.prob_i, impactFn: r => r.residual_impact_i ?? r.impact_i },
  avail: { probFn: r => r.prob_a, impactFn: r => r.residual_impact_a ?? r.impact_a },
};

// ── page ──────────────────────────────────────────────────────────────────────

export function RiskSummaryPage({ view }) {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const systemFilterId = searchParams.get('system');
  const isCurrent = view === 'current';

  const selectedId   = searchParams.get('selected');
  const summaryRowRef = useRef(null);

  const [risks,       setRisks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [detailCache, setDetailCache] = useState({});

  // { gridKey: 'max'|'conf'|'int'|'avail', p: number, i: number } | null
  const [activeFilter, setActiveFilter] = useState(null);
  const [sortKey,      setSortKey]      = useState('res_max');
  const [sortDir,      setSortDir]      = useState('desc');

  // Display mode (account-wide default + per-session override) drives the
  // C/I/A-vs-MAX breakdown and whether values render as numbers or word chips.
  const viewMode   = useViewMode();
  const expertView = viewMode.isExpert;

  // In business mode only the MAX column of each group is shown, so a sort on a
  // C/I/A breakdown column is no longer reachable — fall back to current-risk max.
  useEffect(() => {
    if (!expertView && /_(c|i|a)$/.test(sortKey)) {
      setSortKey('res_max');
      setSortDir('desc');
    }
  }, [expertView, sortKey]);

  const gridDefs = expertView ? EXPERT_GRID_DEFS : BUSINESS_GRID_DEFS;

  // The two modes offer different grids, so a cell filter set in one can name a
  // grid the other does not render — leaving the list filtered with no lit cell
  // and no obvious way back. Drop it when the mode no longer offers that grid.
  useEffect(() => {
    if (activeFilter && !gridDefs.some(g => g.key === activeFilter.gridKey)) {
      setActiveFilter(null);
    }
  }, [expertView, activeFilter, gridDefs]);

  const canCreate = ['ciso', 'risk_analyst', 'admin'].includes(user?.role);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const fetcher = isCurrent ? getCurrentRisks : getFutureRisks;
        const { risks: data } = await fetcher();
        if (!cancelled) setRisks(data);
      } catch {
        if (!cancelled) setError('Could not load risk data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isCurrent]);

  // Lazy-fetch full risk detail when a row is expanded.
  useEffect(() => {
    if (!selectedId || detailCache[selectedId]) return;
    let cancelled = false;
    getRisk(selectedId)
      .then(d => { if (!cancelled) setDetailCache(prev => ({ ...prev, [selectedId]: d })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, detailCache]);

  // Scroll selected row into view after render.
  useEffect(() => {
    if (!selectedId || loading) return;
    if (summaryRowRef.current) {
      summaryRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedId, loading]);

  function toggleSelect(id) {
    if (selectedId === id) {
      searchParams.delete('selected');
    } else {
      searchParams.set('selected', id);
    }
    setSearchParams(searchParams, { replace: true });
  }

  // Scope to one system if ?system=<id> is present in the URL — heatmap
  // matrices and the table both narrow to that system's risks.
  const scopeCtl = useDepartmentScope({
    rows: risks,
    userDeptId: user?.department_id,
    defaultToOwnDept: !CROSS_DEPT_ROLES.has(user?.role),
  });

  // Department scope is applied FIRST, so the heatmap matrices are built from
  // the same rows as the table. Filtering only the list would leave the grids
  // showing the whole organisation while the table showed one department.
  const scopedRisks = useMemo(() => {
    const byDept = applyDepartmentScope(risks, {
      scope: scopeCtl.scope, userDeptId: user?.department_id, deptId: scopeCtl.deptId,
    });
    return systemFilterId ? byDept.filter(r => r.system_id === systemFilterId) : byDept;
  }, [risks, systemFilterId, scopeCtl.scope, scopeCtl.deptId, user?.department_id]);

  // When the system filter narrows to zero, fetch the OTHER view so we can
  // tell the user the risks exist but live in the other place. (Avoids the
  // "tab says 1, page shows 0" confusion.)
  const [otherViewCount, setOtherViewCount] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!systemFilterId) { setOtherViewCount(null); return; }
    const otherFetcher = isCurrent ? getFutureRisks : getCurrentRisks;
    otherFetcher()
      .then(({ risks: data }) => {
        if (cancelled) return;
        const n = data.filter(r => r.system_id === systemFilterId).length;
        setOtherViewCount(n);
      })
      .catch(() => { if (!cancelled) setOtherViewCount(null); });
    return () => { cancelled = true; };
  }, [systemFilterId, isCurrent]);

  const systemFilterName = useMemo(
    () => (systemFilterId
      ? (scopedRisks[0]?.system_name || risks.find(r => r.system_id === systemFilterId)?.system_name)
      : null),
    [systemFilterId, scopedRisks, risks]
  );

  // Build every matrix from the (possibly system-scoped) risks array. Cheap
  // enough to keep all four regardless of mode, so toggling view is instant.
  const matrices = useMemo(() => ({
    current: buildCurrentRiskMatrix(scopedRisks),
    conf:    buildConfMatrix(scopedRisks),
    int:     buildIntMatrix(scopedRisks),
    avail:   buildAvailMatrix(scopedRisks),
  }), [scopedRisks]);

  // Filtered then sorted list — recomputed only when dependencies change
  const displayedRisks = useMemo(() => {
    let filtered = scopedRisks;
    if (activeFilter) {
      const { gridKey, p, i } = activeFilter;
      const { probFn, impactFn } = ACCESSORS[gridKey];
      filtered = filterByCell(scopedRisks, p, i, probFn, impactFn);
    }
    return sortRisks(filtered, sortKey, sortDir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRisks, activeFilter, sortKey, sortDir]);

  function clearSystemFilter() {
    searchParams.delete('system');
    setSearchParams(searchParams, { replace: true });
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'owner' ? 'asc' : 'desc');
    }
  }

  function sortArrow(key) {
    if (sortKey !== key) return <span className={styles.sortNeutral}>⇅</span>;
    return <span className={styles.sortActive}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function handleCellClick(gridKey, p, i) {
    setActiveFilter(prev =>
      // Clicking the same cell again clears the filter
      prev && prev.gridKey === gridKey && prev.p === p && prev.i === i
        ? null
        : { gridKey, p, i }
    );
  }

  return (
    <Shell>
      <div className={styles.page}>

        {/* ── page header ── */}
        <div className={styles.pageHeader}>
          <BackButton fallback="/dashboard" />
          <div className={styles.headingGroup}>
            <h1 className={styles.heading}>
              {isCurrent ? 'Current Risk Summary' : 'New Risk Summary'}
            </h1>
            <span className={styles.headingTag}>
              {isCurrent ? 'VALIDATED' : 'PENDING VALIDATION'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
            {!loading && !error && (
              <span className={styles.totalCount}>{scopedRisks.length} risks</span>
            )}
            {canCreate && (
              <button className={styles.registerBtn} onClick={() => setShowCreate(true)}>
                + Register Risk
              </button>
            )}
          </div>
        </div>

        {loading && <div className={styles.loadingBar} aria-label="Loading…" />}
        {!loading && error && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && systemFilterId && (
          <div className={styles.systemFilterBanner}>
            <span>
              Showing risks for system:{' '}
              <strong>{systemFilterName || systemFilterId}</strong>
              {' '}({scopedRisks.length} {isCurrent ? 'validated' : 'pending'})
              {otherViewCount > 0 && (
                <>
                  {' — '}
                  <button
                    className={styles.systemFilterClear}
                    onClick={() => navigate(`/risks/${isCurrent ? 'future' : 'current'}?system=${systemFilterId}`)}
                  >
                    {otherViewCount} {isCurrent ? 'pending' : 'validated'} for this system →
                  </button>
                </>
              )}
            </span>
            <button
              className={styles.systemFilterClear}
              onClick={clearSystemFilter}
            >
              Show all risks ×
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── grids: three C/I/A in expert, one current-risk in business ── */}
            <div className={expertView ? styles.gridRow : styles.gridRowSingle}>
              {gridDefs.map(({ key, label }) => (
                <MiniGrid
                  key={key}
                  label={label}
                  matrix={matrices[key]}
                  selectedP={activeFilter?.gridKey === key ? activeFilter.p : null}
                  selectedI={activeFilter?.gridKey === key ? activeFilter.i : null}
                  onCellClick={(p, i) => handleCellClick(key, p, i)}
                />
              ))}
            </div>

            {/* ── filter bar ── */}
            <div className={styles.listBar}>
              <div className={styles.filterInfo}>
                {activeFilter ? (
                  <>
                    <span className={styles.filterActive}>
                      Filtered — {gridDefs.find(g => g.key === activeFilter.gridKey)?.label},
                      {' '}Impact {activeFilter.i}, Probability {activeFilter.p}
                      {' '}· {displayedRisks.length} of {scopedRisks.length}
                    </span>
                    <button className={styles.clearFilter} onClick={() => setActiveFilter(null)}>
                      Clear filter
                    </button>
                  </>
                ) : (
                  <span className={styles.filterNone}>All risks — {displayedRisks.length} shown</span>
                )}
              </div>
              <div className={styles.deptScope}>
                <DepartmentScopeFilter {...scopeCtl} showShared={false} />
              </div>
              <ViewModeToggle {...viewMode} />
            </div>

            {/* ── risk table ── */}
            {displayedRisks.length === 0 ? (
              <div className={styles.emptyState}>No risks in this band.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={`${styles.riskTable} ${expertView ? styles.riskTableExpert : ''}`}>
                  <thead>
                    <tr>
                      <th
                        rowSpan={2}
                        className={`${styles.th} ${styles.thName}`}
                        onClick={() => handleSort('name')}
                      >
                        Risk {sortArrow('name')}
                      </th>
                      <th
                        rowSpan={2}
                        className={`${styles.th} ${styles.thOwner}`}
                        onClick={() => handleSort('dept')}
                      >
                        Department {sortArrow('dept')}
                      </th>
                      <th colSpan={expertView ? 4 : 1} className={`${styles.th} ${styles.thGroup} ${styles.thGroupInh}`}>
                        Inherent impact<InfoTip term="inherentImpact" />
                      </th>
                      <th colSpan={expertView ? 4 : 1} className={`${styles.th} ${styles.thGroup} ${styles.thGroupRes}`}>
                        Current risk<InfoTip term="currentRisk" />
                      </th>
                      <th colSpan={expertView ? 4 : 1} className={`${styles.th} ${styles.thGroup} ${styles.thGroupTgt}`}>
                        Target risk<InfoTip term="targetRisk" />
                      </th>
                    </tr>
                    <tr>
                      {(expertView ? ['c','i','a','max'] : ['max']).map(dim => (
                        <th
                          key={`inh_${dim}`}
                          className={`${styles.th} ${styles.thScore} ${sortKey === `inh_${dim}` ? styles.thScoreActive : ''}`}
                          onClick={() => handleSort(`inh_${dim}`)}
                        >
                          {dim.toUpperCase()} {sortArrow(`inh_${dim}`)}
                        </th>
                      ))}
                      {(expertView ? ['c','i','a','max'] : ['max']).map(dim => (
                        <th
                          key={`res_${dim}`}
                          className={`${styles.th} ${styles.thScore} ${sortKey === `res_${dim}` ? styles.thScoreActive : ''}`}
                          onClick={() => handleSort(`res_${dim}`)}
                        >
                          {dim.toUpperCase()} {sortArrow(`res_${dim}`)}
                        </th>
                      ))}
                      {(expertView ? ['c','i','a','max'] : ['max']).map(dim => (
                        <th
                          key={`tgt_${dim}`}
                          className={`${styles.th} ${styles.thScore} ${styles.thScoreTgt} ${sortKey === `tgt_${dim}` ? styles.thScoreActive : ''}`}
                          onClick={() => handleSort(`tgt_${dim}`)}
                        >
                          {dim.toUpperCase()} {sortArrow(`tgt_${dim}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRisks.map(risk => (
                      <RiskTableRow
                        key={risk.risk_id}
                        risk={risk}
                        expertView={expertView}
                        showStatus={!isCurrent}
                        isSelected={selectedId === risk.risk_id}
                        onToggle={() => toggleSelect(risk.risk_id)}
                        summaryRowRef={selectedId === risk.risk_id ? summaryRowRef : null}
                        detail={detailCache[risk.risk_id]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <RiskCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); navigate(`/risks/${id}?panel=coverage`); }}
        />
      )}
    </Shell>
  );
}
