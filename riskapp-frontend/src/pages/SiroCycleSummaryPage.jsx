// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate }           from 'react-router-dom';
import { getSiroCycleDetail, approveSiroCycle } from '../api';
import { Shell }                                from '../components/Shell';
import { BackButton }                           from '../components/BackButton';
import { Spinner }                               from '../components/Spinner';
import { Th }                                    from '../components/Th';
import { StatusPill }                            from '../components/StatusPill';
import { scoreLevel }                            from '../utils/riskColors';
import styles                                   from './SiroCycleSummary.module.css';
import { HelpDot } from '../components/HelpDot';

export function SiroCycleSummaryPage() {
  const { id }    = useParams();
  const navigate  = useNavigate();

  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [approving, setApproving] = useState(false);
  const [approved,  setApproved]  = useState(false);
  const [approveError, setApproveError] = useState('');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const detail = await getSiroCycleDetail(id);
      setData(detail);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load cycle detail.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleApprove() {
    if (!window.confirm('Approve this cycle? This action cannot be undone.')) return;
    setApproving(true);
    setApproveError('');
    try {
      await approveSiroCycle(id);
      setApproved(true);
    } catch (err) {
      setApproveError(err.response?.data?.error || 'Approval failed.');
    } finally {
      setApproving(false);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/siro/cycles" />

        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-muted)' }}>
            <Spinner /> Loading…
          </div>
        )}

        {!loading && error && (
          <div className={styles.errorBanner} role="alert">{error}</div>
        )}

        {!loading && !error && data && (
          <>
            <CycleHeader cycle={data.cycle} />

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Risks Reviewed ({data.risks.length}) <HelpDot k="siro_cycle_summary.risks" placement="bottom" /></h2>
              <RisksTable risks={data.risks} />
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Security Actions ({data.actions.length}) <HelpDot k="siro_cycle_summary.actions" placement="bottom" /></h2>
              <ActionsTable actions={data.actions} />
            </section>

            <ApproveFooter
              canApprove={data.can_approve}
              unfinalisedCount={data.unfinalised_count}
              approved={approved}
              approving={approving}
              approveError={approveError}
              onApprove={handleApprove}
              onDone={() => navigate('/siro/cycles')}
            />
          </>
        )}
      </div>
    </Shell>
  );
}

function CycleHeader({ cycle }) {
  return (
    <div className={styles.headerCard}>
      <div className={styles.headerTop}>
        <span className={styles.cycleName}>{cycle.name} <HelpDot k="siro_cycle_summary.title" placement="bottom" /></span>
        <span className={styles.statusBadge}>awaiting approval</span>
      </div>
      <div className={styles.metaGrid}>
        <MetaItem label="Period"      value={periodStr(cycle.start_date, cycle.end_date)} />
        <MetaItem label="Meeting Date" value={fmtDate(cycle.meeting_date)} />
        <MetaItem label="Frozen At"   value={fmtDate(cycle.frozen_at)} />
        <MetaItem label="Frozen By"   value={cycle.frozen_by_name ?? '—'} />
      </div>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div className={styles.metaItem}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{value || '—'}</span>
    </div>
  );
}

function RisksTable({ risks }) {
  if (!risks.length) {
    return (
      <div className={styles.tableWrap}>
        <div className={styles.emptyState}>No risks are associated with this cycle.</div>
      </div>
    );
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <Th helpKey="siro_cycle_summary.col.asset">Asset</Th>
            <Th helpKey="col.threat">Threat</Th>
            <Th helpKey="col.system">System</Th>
            <Th helpKey="siro_cycle_summary.col.score">Score</Th>
            <Th helpKey="siro_cycle_summary.col.level">Level</Th>
            <Th helpKey="siro_cycle_summary.col.decision">Decision</Th>
            <Th helpKey="siro_cycle_summary.col.finalised_notes">Finalised Notes</Th>
          </tr>
        </thead>
        <tbody>
          {risks.map((r) => (
            <tr key={r.id} className={styles.row}>
              <td className={`${styles.td} ${styles.tdBold}`}>
                {r.asset_name}
                {r.is_new && <span className={styles.newBadge}>new</span>}
              </td>
              <td className={styles.td}>{r.threat_name}</td>
              <td className={`${styles.td}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.system_name}</td>
              <td className={`${styles.td} ${styles.tdMono}`}>{r.risk_score}</td>
              <td className={styles.td}>
                <LevelBadge level={r.risk_score != null ? scoreLevel(r.risk_score) : null} />
              </td>
              <td className={styles.td}>
                {r.review_decision
                  ? <span className={styles.decisionTag}>{r.review_decision.replace('_', ' ')}</span>
                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td className={`${styles.td} ${styles.tdNotes}`}>
                {r.finalised_notes || <span style={{ color: 'var(--amber)', fontStyle: 'italic' }}>pending</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionsTable({ actions }) {
  if (!actions.length) {
    return (
      <div className={styles.tableWrap}>
        <div className={styles.emptyState}>No security actions are linked to this cycle.</div>
      </div>
    );
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <Th helpKey="col.status">Status</Th>
            <Th helpKey="siro_cycle_summary.col.title">Title</Th>
            <Th helpKey="siro_cycle_summary.col.type">Type</Th>
            <Th helpKey="siro_cycle_summary.col.owner">Owner</Th>
            <Th helpKey="siro_cycle_summary.col.target_date">Target Date</Th>
            <Th helpKey="siro_cycle_summary.col.siro">SIRO</Th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id} className={styles.row}>
              <td className={styles.td}>
                <StatusPill status={a.status} isOverdue={a.is_overdue} />
              </td>
              <td className={`${styles.td} ${styles.tdBold}`}>
                {a.title}
                {a.is_new && <span className={styles.newBadge}>new</span>}
              </td>
              <td className={styles.td}>
                <span className={styles.typeTag}>{a.treatment_type}</span>
              </td>
              <td className={styles.td}>{a.owner_name}</td>
              <td className={`${styles.td} ${styles.tdMono}`}>{fmtDate(a.target_date)}</td>
              <td className={styles.td}>
                {a.requires_siro_signoff
                  ? a.is_signed_off
                    ? <span style={{ color: 'var(--green)', fontSize: 13 }}>✓ signed off</span>
                    : <span style={{ color: 'var(--amber)', fontSize: 12 }}>required</span>
                  : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApproveFooter({ canApprove, unfinalisedCount, approved, approving, approveError, onApprove, onDone }) {
  if (approved) {
    return (
      <div className={styles.successBanner} role="status">
        Cycle approved successfully.{' '}
        <button onClick={onDone} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>
          Back to cycles
        </button>
      </div>
    );
  }

  return (
    <div className={styles.approveFooter}>
      <div className={styles.approveInfo}>
        <span className={styles.approveTitle}>SIRO Approval <HelpDot k="siro_cycle_summary.approval" placement="bottom" /></span>
        {canApprove ? (
          <span className={styles.approveDesc}>All items are finalised. You may approve this cycle.</span>
        ) : (
          <span className={styles.approveWarning}>
            {unfinalisedCount} risk item{unfinalisedCount !== 1 ? 's' : ''} still pending finalised notes — approval is blocked.
          </span>
        )}
        {approveError && (
          <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{approveError}</span>
        )}
      </div>
      <button
        className={styles.approveBtn}
        onClick={onApprove}
        disabled={!canApprove || approving}
      >
        {approving ? 'Approving…' : 'Approve Cycle'}
      </button>
    </div>
  );
}

function LevelBadge({ level }) {
  const cls = {
    critical: styles.levelCritical,
    high:     styles.levelHigh,
    medium:   styles.levelMedium,
    low:      styles.levelLow,
  }[level] ?? styles.levelLow;

  return <span className={`${styles.levelBadge} ${cls}`}>{level}</span>;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function periodStr(start, end) {
  return [start, end].filter(Boolean).map(fmtDate).join(' – ') || '—';
}
