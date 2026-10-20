// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * pages/PendingRisksPage.jsx
 *
 * Lists all pending/returned risks awaiting CISO validation.
 * Clicking a row opens the ValidateModal.
 * After validate/return, removes or refreshes the row optimistically.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPendingRisks } from '../api';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import { Th } from '../components/Th';
import styles from './PendingRisksPage.module.css';

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

  const pendingCount  = risks.filter((r) => r.validation_status === 'pending').length;
  const returnedCount = risks.filter((r) => r.validation_status === 'returned').length;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Pending Validation</h1>
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
                    <Th>Status</Th>
                    <Th>Threat</Th>
                    <Th>Category</Th>
                    <Th>Asset</Th>
                    <Th>Department</Th>
                    <Th>Identified</Th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((risk) => (
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

