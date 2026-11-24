// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useNavigate }     from 'react-router-dom';
import { getSiroCycles }   from '../api';
import { Shell }           from '../components/Shell';
import styles              from './ActionsPage.module.css';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import thStyles from '../components/Th.module.css';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { useUrlSortState } from '../hooks/useUrlState';
import { HelpDot } from '../components/HelpDot';

// Column key → value, for sorting the cycles by a header (useTableSort). Period
// sorts by its start; Changes by how many changes the cycle carries in all.
export const SIRO_CYCLE_ACCESSORS = {
  cycle:    (c) => c.name,
  period:   (c) => c.start_date,
  meeting:  (c) => c.meeting_date,
  frozenAt: (c) => c.frozen_at,
  frozenBy: (c) => c.frozen_by_name,
  changes:  (c) => ['new_risks', 'increased_risks', 'reduced_risks', 'new_actions', 'closed_actions']
    .reduce((n, k) => n + (Number(c[k]) || 0), 0),
};

export function SiroCyclesPage() {
  const [cycles,  setCycles]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const navigate = useNavigate();

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSiroCycles();
      setCycles(data.cycles);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load cycles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  // Sorted by a header, the sort kept in the address so Back returns to it.
  const sortState = useUrlSortState();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(cycles, { accessors: SIRO_CYCLE_ACCESSORS, state: sortState });
  const sortProps = { sortKey, sortDir, onSort: toggleSort, className: thStyles.th };

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Cycle Approval <HelpDot k="siro_cycles.title" placement="bottom" /></h1>
            <p className={styles.pageDesc}>
              Review cycles frozen by the CISO and awaiting SIRO sign-off. Click a row to review and approve.
            </p>
          </div>
          <button className={styles.refreshBtn} onClick={fetchCycles} disabled={loading}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
            <button onClick={fetchCycles} className={styles.retryBtn}>Retry</button>
          </div>
        )}

        {!error && (
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.emptyState}>
                <Spinner />
                <span>Loading cycles…</span>
              </div>
            ) : cycles.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>✓</span>
                <span>No cycles are awaiting your approval.</span>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortableTh column="cycle" {...sortProps} helpKey="siro_cycles.col.cycle">Cycle</SortableTh>
                    <SortableTh column="period" {...sortProps} helpKey="siro_cycles.col.period">Period</SortableTh>
                    <SortableTh column="meeting" {...sortProps} helpKey="siro_cycles.col.meeting_date">Meeting Date</SortableTh>
                    <SortableTh column="frozenAt" {...sortProps} helpKey="siro_cycles.col.frozen_at">Frozen At</SortableTh>
                    <SortableTh column="frozenBy" {...sortProps} helpKey="siro_cycles.col.frozen_by">Frozen By</SortableTh>
                    <SortableTh column="changes" {...sortProps} helpKey="siro_cycles.col.changes">Changes</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((cycle) => (
                    <CycleRow
                      key={cycle.id}
                      cycle={cycle}
                      onClick={() => navigate(`/siro/cycles/${cycle.id}`)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function CycleRow({ cycle, onClick }) {
  const period = [cycle.start_date, cycle.end_date]
    .filter(Boolean)
    .map(fmtDate)
    .join(' – ');

  return (
    <tr className={`${styles.row} ${styles.rowClickable}`} onClick={onClick}>
      <td className={`${styles.td} ${styles.tdTitle}`}>{cycle.name}</td>
      <td className={`${styles.td} ${styles.tdMono}`}>{period || '—'}</td>
      <td className={`${styles.td} ${styles.tdMono}`}>{fmtDate(cycle.meeting_date)}</td>
      <td className={`${styles.td} ${styles.tdMono}`}>{fmtDate(cycle.frozen_at)}</td>
      <td className={styles.td}>{cycle.frozen_by_name ?? '—'}</td>
      <td className={styles.td}>
        <ChangesCell cycle={cycle} />
      </td>
    </tr>
  );
}

function ChangesCell({ cycle }) {
  return (
    <div className={styles.changesCell}>
      <div className={styles.chipsRow}>
        {cycle.new_risks > 0 && (
          <span className={`${styles.chip} ${styles.chipNew}`}>+{cycle.new_risks} risks</span>
        )}
        {cycle.increased_risks > 0 && (
          <span className={`${styles.chip} ${styles.chipUp}`}>↑{cycle.increased_risks}</span>
        )}
        {cycle.reduced_risks > 0 && (
          <span className={`${styles.chip} ${styles.chipDown}`}>↓{cycle.reduced_risks}</span>
        )}
        {cycle.new_risks === 0 && cycle.increased_risks === 0 && cycle.reduced_risks === 0 && (
          <span className={`${styles.chip} ${styles.chipNew}`}>—</span>
        )}
      </div>
      <div className={styles.chipsRow}>
        {cycle.new_actions > 0 && (
          <span className={`${styles.chip} ${styles.chipAction}`}>+{cycle.new_actions} actions</span>
        )}
        {cycle.closed_actions > 0 && (
          <span className={`${styles.chip} ${styles.chipClosed}`}>✓{cycle.closed_actions} closed</span>
        )}
      </div>
    </div>
  );
}

