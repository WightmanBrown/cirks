// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSecurityActions, getSecurityActionDetail } from '../api';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { chipClass, scoreColorClass } from '../utils/riskColors';
import { Spinner } from '../components/Spinner';
import { Th } from '../components/Th';
import { HelpDot } from '../components/HelpDot';
import { StatusPill } from '../components/StatusPill';
import styles from './ActionsPage.module.css';

function maxScore(p_c, p_i, p_a, i_c, i_i, i_a) {
  const vals = [p_c * i_c, p_i * i_i, p_a * i_a].filter(v => Number.isFinite(v));
  return vals.length ? Math.max(...vals) : null;
}

// 'YYYY-MM-DD' → 'D Mon' without a Date() timezone shift.
function formatYmd(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const FILTERS = [
  { value: '',            label: 'Active' },   // default — hides archived (completed/cancelled)
  { value: 'overdue',     label: 'Overdue' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'planned',     label: 'Planned' },
  { value: 'completed',   label: 'Completed' },
  { value: 'deferred',    label: 'Deferred' },
  { value: 'archived',    label: 'Archived' }, // terminal states, for audit/lookup
  { value: 'all',         label: 'All' },
];

export function ActionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [actions,      setActions]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [updateMeetingDate, setUpdateMeetingDate] = useState(null);
  const [statusFilter, setStatusFilter] = useState(
    FILTERS.some(f => f.value === searchParams.get('status')) ? searchParams.get('status') : ''
  );

  // ?mine=1 — show only the actions this user owns.
  // Represented as a filter-tab selection alongside the status tabs.
  const mine = searchParams.get('mine') === '1';

  const setMine = useCallback((on) => {
    const next = new URLSearchParams(searchParams);
    if (on) {
      next.set('mine', '1');
      next.delete('status');
      setStatusFilter('');
    } else {
      next.delete('mine');
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Fold-down: ?selected=<id> expands the row inline (mirrors RiskSummaryPage).
  const selectedId = searchParams.get('selected');
  const [detailCache, setDetailCache] = useState({});
  const selectedRowRef = useRef(null);

  const toggleSelect = useCallback((id) => {
    const next = new URLSearchParams(searchParams);
    if (selectedId === id) next.delete('selected');
    else next.set('selected', id);
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedId, setSearchParams]);

  // Lazy-fetch + cache the expanded row's detail.
  useEffect(() => {
    if (!selectedId || detailCache[selectedId]) return;
    let cancelled = false;
    getSecurityActionDetail(selectedId)
      .then(d => { if (!cancelled) setDetailCache(p => ({ ...p, [selectedId]: d })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, detailCache]);

  // Scroll the expanded row into view.
  useEffect(() => {
    if (selectedId && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedId, actions]);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSecurityActions({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(mine ? { mine: 1 } : {}),
      });
      setActions(data.actions);
      setUpdateMeetingDate(data.update_required_meeting_date ?? null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load security actions.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, mine]);


  useEffect(() => { fetchActions(); }, [fetchActions]);

  const overdueCount     = actions.filter((a) => a.is_overdue).length;
  const inProgressCount  = actions.filter((a) => a.status === 'in_progress').length;
  const completedCount   = actions.filter((a) => a.status === 'completed').length;
  const needsUpdateCount = actions.filter((a) => a.needs_update).length;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Security Actions <HelpDot k="actions.title" placement="bottom" /></h1>
            <p className={styles.pageDesc}>
              Security actions and their progress. Click a row to preview; open it to act
              on the ones you're responsible for.
            </p>
          </div>
          <button className={styles.refreshBtn} onClick={fetchActions} disabled={loading}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>

        <div className={styles.statsRow}>
          <Stat label="Overdue"     value={overdueCount}    color="var(--red)" />
          <Stat label="In Progress" value={inProgressCount} color="var(--amber)" />
          <Stat label="Completed"   value={completedCount}  color="var(--green)" />
          <Stat label="Total"       value={actions.length}  color="var(--text-secondary)" />
        </div>

        {needsUpdateCount > 0 && (
          <div className={styles.updateBanner} role="status">
            <span className={styles.updateBannerIcon}>⚠</span>
            <span>
              <strong>{needsUpdateCount}</strong> action{needsUpdateCount !== 1 ? 's' : ''} need a progress
              update{updateMeetingDate ? ` before the meeting on ${formatYmd(updateMeetingDate)}` : ''}.
              Log progress to clear the flag.
            </span>
          </div>
        )}

        <div className={styles.filterRow}>
          {FILTERS.map(({ value, label }) => (
            <button
              key={value || 'active'}
              className={`${styles.filterTab} ${!mine && statusFilter === value ? styles.filterActive : ''}`}
              onClick={() => { setMine(false); setStatusFilter(value); }}
            >
              {label}
            </button>
          ))}
          <button
            className={`${styles.filterTab} ${styles.filterTabMine} ${mine ? styles.filterActive : ''}`}
            onClick={() => setMine(!mine)}
          >
            My Actions
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
            <button onClick={fetchActions} className={styles.retryBtn}>Retry</button>
          </div>
        )}

        {!error && (
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.emptyState}>
                <Spinner />
                <span>Loading actions…</span>
              </div>
            ) : actions.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>✓</span>
                <span>No actions match this filter.</span>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <Th helpKey="actions.col.status">Status</Th>
                    <Th helpKey="actions.col.title">Title</Th>
                    <Th helpKey="actions.col.items">Items</Th>
                    <Th helpKey="actions.col.owner">Owner</Th>
                    <Th helpKey="actions.col.plan">Plan</Th>
                    <Th helpKey="actions.col.target_date">Target Date</Th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((action) => (
                    <ActionRow
                      key={action.id}
                      action={action}
                      isSelected={selectedId === action.id}
                      onToggle={() => toggleSelect(action.id)}
                      detail={detailCache[action.id]}
                      rowRef={selectedId === action.id ? selectedRowRef : null}
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

function relativeDays(targetDate, isOverdue) {
  if (!targetDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(targetDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (isOverdue || diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0)             return { label: 'due today',                 overdue: false };
  if (diff === 1)             return { label: '1d remaining',              overdue: false };
  return                             { label: `${diff}d remaining`,        overdue: false };
}

function ActionRow({ action, isSelected, onToggle, detail, rowRef }) {
  const date = action.target_date
    ? new Date(action.target_date).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null;
  const rel = relativeDays(action.target_date, action.is_overdue);

  return (
    <>
      <tr
        ref={rowRef}
        className={`${styles.row} ${styles.rowClickable} ${action.is_overdue ? styles.rowOverdue : ''} ${isSelected ? styles.rowSelected : ''}`}
        onClick={onToggle}
        role="button"
        aria-expanded={isSelected}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
      >
        <td className={styles.td}><StatusPill status={action.status} isOverdue={action.is_overdue} /></td>
        <td className={`${styles.td} ${styles.tdTitle}`}>
          {action.title}
          {action.needs_update && (
            <span className={styles.updateFlag} title="Progress not updated for the scheduled meeting — log a progress note to clear this">
              ⚠ Update needed
            </span>
          )}
        </td>
        <td className={`${styles.td} ${styles.tdMono}`}>
          {Number(action.item_count ?? 0) > 0
            ? `${action.items_done ?? 0}/${action.item_count}`
            : '—'}
        </td>
        <td className={styles.td}>{action.owner_name}</td>
        <td className={`${styles.td} ${styles.tdPlan}`}>{action.plan_title || '—'}</td>
        <td className={`${styles.td} ${styles.tdMono}`}>
          {date ? (
            <span className={styles.dateCell}>
              {rel && (
                <span className={rel.overdue ? styles.dateOverdue : styles.dateRemaining}>
                  {rel.label}
                </span>
              )}
              <span className={action.is_overdue ? styles.tdOverdue : ''}>{date}</span>
            </span>
          ) : '—'}
        </td>
      </tr>
      {isSelected && (
        <tr className={styles.expandRow}>
          <td colSpan={6} className={styles.expandCell}>
            <ActionSummaryCard action={action} detail={detail} />
          </td>
        </tr>
      )}
    </>
  );
}

function ActionSummaryCard({ action, detail }) {
  const navigate = useNavigate();
  const curMax = maxScore(
    action.current_p_c, action.current_p_i, action.current_p_a,
    action.current_imp_c, action.current_imp_i, action.current_imp_a,
  );
  // Forecast score: the MIN of the open control items' target probabilities
  // (targets live on items now) against the risk's current impact, which
  // remediation never moves. Needs the lazily-fetched detail, so it appears
  // once the row is expanded.
  const openTargets = (detail?.items ?? [])
    .filter(i => i.element_type === 'control' && i.target?.c != null
             && !['completed', 'withdrawn'].includes(i.status));
  const tgtMax = openTargets.length
    ? maxScore(
        Math.min(...openTargets.map(i => i.target.c)),
        Math.min(...openTargets.map(i => i.target.i)),
        Math.min(...openTargets.map(i => i.target.a)),
        action.current_imp_c, action.current_imp_i, action.current_imp_a,
      )
    : null;
  const description = detail?.description ?? action.description;
  const context = [action.system_name, action.threat_name, action.department_name]
    .filter(Boolean).join(' · ');

  return (
    <div className={styles.expandCard}>
      <SummaryField label="Owner">{action.owner_name}</SummaryField>
      <SummaryField label="Items">
        {Number(action.item_count ?? 0) > 0
          ? `${action.items_done ?? 0} of ${action.item_count} complete`
          : 'None'}
      </SummaryField>
      <SummaryField label="Linked risks">{action.risk_count ?? 0}</SummaryField>
      {curMax != null && (
        <SummaryField label="Risk score">
          <span className={styles.scoreCell}>
            <span className={`${chipClass()} ${scoreColorClass(curMax)}`}>{curMax}</span>
            {tgtMax != null && (
              <>
                <span className={styles.scoreArrow}>→</span>
                <span className={`${chipClass()} ${scoreColorClass(tgtMax)}`}>{tgtMax}</span>
              </>
            )}
          </span>
        </SummaryField>
      )}
      {context && (
        <SummaryField label="Context">{context}</SummaryField>
      )}
      <div className={styles.expandField}>
        <span className={styles.expandLabel}>Description</span>
        {description
          ? <span className={styles.expandValue}>{description}</span>
          : <span className={styles.expandMuted}>No description recorded.</span>}
      </div>

      <div className={styles.expandActions}>
        <button className={styles.expandOpenBtn} onClick={() => navigate(`/actions/${action.id}`)}>
          Open details →
        </button>
      </div>
    </div>
  );
}

function SummaryField({ label, children }) {
  return (
    <div className={styles.expandField}>
      <span className={styles.expandLabel}>{label}</span>
      <span className={styles.expandValue}>{children}</span>
    </div>
  );
}


