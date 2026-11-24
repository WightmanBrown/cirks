// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * pages/PendingRisksPage.jsx
 *
 * Lists all pending/returned risks awaiting CISO validation.
 * Clicking a row opens the risk, where the CISO validates or returns it.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPendingRisks } from '../api';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import thStyles from '../components/Th.module.css';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { useUrlSortState } from '../hooks/useUrlState';
import { HelpDot } from '../components/HelpDot';
import styles from './PendingRisksPage.module.css';

// Column key → value, for sorting the queue by a header (useTableSort). The
// asset column sorts by the asset's name, then by the system it sits on.
export const PENDING_RISK_ACCESSORS = {
  status:     (r) => r.validation_status,
  threat:     (r) => r.threat_name,
  category:   (r) => r.threat_category,
  asset:      (r) => [r.asset_name, r.system_name].filter(Boolean).join(' ') || null,
  department: (r) => r.department,
  identified: (r) => r.identified_at,
};

export function PendingRisksPage() {
  const navigate = useNavigate();
  const [risks,      setRisks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [statusFilter, setStatusFilter] = useState('');  // '' | 'pending' | 'returned'

  const fetchRisks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPendingRisks(statusFilter ? { status: statusFilter } : {});
      setRisks(data.risks);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load risks.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRisks(); }, [fetchRisks]);

  // Sorted by a header, the sort kept in the address so Back returns to it.
  const sortState = useUrlSortState();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(risks, { accessors: PENDING_RISK_ACCESSORS, state: sortState });
  const sortProps = { sortKey, sortDir, onSort: toggleSort, className: thStyles.th };

  const pendingCount  = risks.filter((r) => r.validation_status === 'pending').length;
  const returnedCount = risks.filter((r) => r.validation_status === 'returned').length;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Pending Validation <HelpDot k="pending_risks.title" placement="bottom" /></h1>
            <p className={styles.pageDesc}>
              Risks awaiting CISO review. Click a row to open the risk detail and validate.
            </p>
          </div>
          <button className={styles.refreshBtn} onClick={fetchRisks} disabled={loading}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>

        {/* Stats row */}
        <div className={styles.statsRow}>
          <Stat label="Pending"  value={pendingCount}  color="var(--amber)" />
          <Stat label="Returned" value={returnedCount} color="var(--red)" />
          <Stat label="Total"    value={risks.length}  color="var(--text-secondary)" />
        </div>

        {/* Filter tabs */}
        <div className={styles.filterRow}>
          {['', 'pending', 'returned'].map((s) => (
            <button
              key={s || 'all'}
              className={`${styles.filterTab} ${statusFilter === s ? styles.filterActive : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className={styles.errorBanner} role="alert">
            ⚠ {error}
            <button onClick={fetchRisks} className={styles.retryBtn}>Retry</button>
          </div>
        )}

        {/* Table */}
        {!error && (
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.emptyState}>
                <Spinner />
                <span>Loading risks…</span>
              </div>
            ) : risks.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>✓</span>
                <span>No risks match this filter.</span>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortableTh column="status" {...sortProps} helpKey="pending_risks.col.status">Status</SortableTh>
                    <SortableTh column="threat" {...sortProps} helpKey="col.threat">Threat</SortableTh>
                    <SortableTh column="category" {...sortProps} helpKey="pending_risks.col.category">Category</SortableTh>
                    <SortableTh column="asset" {...sortProps} helpKey="pending_risks.col.asset">Asset</SortableTh>
                    <SortableTh column="department" {...sortProps} helpKey="col.department">Department</SortableTh>
                    <SortableTh column="identified" {...sortProps} helpKey="pending_risks.col.identified">Identified</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((risk) => (
                    <RiskRow
                      key={risk.risk_id}
                      risk={risk}
                      onClick={() => navigate('/risks/' + risk.risk_id)}
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stat({ label, value, color }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue} style={{ color }}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}


function RiskRow({ risk, onClick }) {
  const statusClass = risk.validation_status === 'returned'
    ? styles.statusReturned
    : styles.statusPending;

  const date = risk.identified_at
    ? new Date(risk.identified_at).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—';

  return (
    <tr className={styles.row} onClick={onClick} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <td className={styles.td}>
        <span className={`${styles.statusPill} ${statusClass}`}>
          {risk.validation_status}
        </span>
      </td>
      <td className={`${styles.td} ${styles.tdThreat}`}>{risk.threat_name}</td>
      <td className={styles.td}>
        <span className={styles.category}>{risk.threat_category}</span>
      </td>
      <td className={`${styles.td} ${styles.tdAsset}`}>
        <span>{risk.asset_name}</span>
        <span className={styles.systemName}>{risk.system_name}</span>
      </td>
      <td className={styles.td}>{risk.department}</td>
      <td className={`${styles.td} ${styles.tdMono}`}>{date}</td>
    </tr>
  );
}

