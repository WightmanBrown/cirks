// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useNavigate }     from 'react-router-dom';
import { getSiroCycles }   from '../api';
import { Shell }           from '../components/Shell';
import styles              from './ActionsPage.module.css';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import { Th } from '../components/Th';

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

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Cycle Approval</h1>
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
                    <Th>Cycle</Th>
                    <Th>Period</Th>
                    <Th>Meeting Date</Th>
                    <Th>Frozen At</Th>
                    <Th>Frozen By</Th>
                    <Th>Changes</Th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((cycle) => (
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

