// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../context/AuthContext';
import { DepartmentScopeFilter, useDepartmentScope } from '../components/DepartmentScopeFilter';
import { applyDepartmentScope, CROSS_DEPT_ROLES }    from '../utils/departmentScope';
import { getActiveExceptions, getExceptionStats, getEscalatedExceptions } from '../api';
import { Shell }               from '../components/Shell';
import { BackButton }          from '../components/BackButton';
import { ReadOnlyBadge }      from '../components/ReadOnlyBadge';
import { HelpDot }             from '../components/HelpDot';
import { SortableTh }          from '../components/SortableTh';
import { useTableSort }        from '../hooks/useTableSort';
import { useUrlSortState }     from '../hooks/useUrlState';
import { ExceptionFormModal }  from '../components/ExceptionFormModal';
import { scoreLevel }           from '../utils/riskColors';
import styles from './SecurityExceptionsPage.module.css';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDays(d) {
  if (d == null) return '—';
  if (d < 0)   return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'expires today';
  return `${d}d`;
}

const LEVEL_CLASS = {
  low:      styles.levelLow,
  medium:   styles.levelMedium,
  high:     styles.levelHigh,
  critical: styles.levelCritical,
};

const CADENCE_LABEL = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  annual:    'Annual',
};

const EXPIRY_FILTERS = [
  { value: '',         label: 'All' },
  { value: 'overdue',  label: 'Overdue' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'ok',       label: 'Ok' },
];

const LEVEL_FILTERS = [
  { value: '',         label: 'All levels' },
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High' },
  { value: 'medium',   label: 'Medium' },
  { value: 'low',      label: 'Low' },
];

// Column key → value, for sorting either table by a header (useTableSort).
// Level sorts by the score it bands, so Low < Medium < High < Critical.
export const EXCEPTION_ACCESSORS = {
  level:      (e) => e.risk_score,
  threat:     (e) => e.threat_name,
  system:     (e) => e.system_name,
  department: (e) => e.department_name,
  acceptedBy: (e) => e.accepted_by_name,
  cadence:    (e) => CADENCE_LABEL[e.review_cadence] || e.review_cadence,
  expires:    (e) => e.expires_at,
  days:       (e) => e.days_until_expiry,
  overdue:    (e) => e.days_overdue,
};

export function SecurityExceptionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [items,        setItems]        = useState([]);
  const [breaches,     setBreaches]     = useState([]);
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [expiryFilter, setExpiryFilter] = useState('');
  const [levelFilter,  setLevelFilter]  = useState('');
  const [modal,        setModal]        = useState(null); // { mode, exception }

  const canWrite = ['ciso', 'risk_analyst', 'admin', 'siro', 'information_asset_owner'].includes(user?.role);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (expiryFilter) params.expiry_status = expiryFilter;

      const [s, list, breachList] = await Promise.all([
        getExceptionStats(),
        getActiveExceptions(params),
        getEscalatedExceptions(),
      ]);

      setStats(s);
      setBreaches(Array.isArray(breachList) ? breachList : []);

      // Band filtering is client-side — the API returns risk_score, we band it.
      const filtered = levelFilter
        ? list.filter(e => scoreLevel(e.risk_score) === levelFilter)
        : list;

      const prio = { overdue: 0, due_soon: 1, ok: 2 };
      const sorted = [...filtered].sort((a, b) => {
        const pa = prio[a.expiry_status] ?? 9;
        const pb = prio[b.expiry_status] ?? 9;
        return pa - pb || (a.days_until_expiry ?? 0) - (b.days_until_expiry ?? 0);
      });
      setItems(sorted);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load exceptions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [expiryFilter, levelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exceptions are deliberately org-wide for transparency (v68), so this filter
  // is presentation only — it narrows the default view without hiding anything
  // the user could not otherwise reach.
  const scopeCtl = useDepartmentScope({
    rows: [...items, ...breaches],
    userDeptId: user?.department_id,
    defaultToOwnDept: !CROSS_DEPT_ROLES.has(user?.role),
  });
  const scopeArgs      = { scope: scopeCtl.scope, userDeptId: user?.department_id, deptId: scopeCtl.deptId };
  const scopedItems    = applyDepartmentScope(items,    scopeArgs);
  const scopedBreaches = applyDepartmentScope(breaches, scopeArgs);

  // Each table sorted by its headers, the sort kept in the address. With no
  // column chosen the active list keeps its order from load() (most urgent first).
  const itemSortState   = useUrlSortState();
  const breachSortState = useUrlSortState('sort_breaches');
  const itemSort   = useTableSort(scopedItems,    { accessors: EXCEPTION_ACCESSORS, state: itemSortState });
  const breachSort = useTableSort(scopedBreaches, { accessors: EXCEPTION_ACCESSORS, state: breachSortState });
  const itemTh   = { sortKey: itemSort.sortKey,   sortDir: itemSort.sortDir,   onSort: itemSort.toggleSort };
  const breachTh = { sortKey: breachSort.sortKey, sortDir: breachSort.sortDir, onSort: breachSort.toggleSort };

  const overdue = Number(stats?.overdue  || 0);
  const dueSoon = Number(stats?.due_soon || 0);
  const ok      = Number(stats?.ok       || 0);
  const total   = Number(stats?.total    || 0);

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton fallback="/dashboard" />
          <div className={styles.headingGroup}>
            <h1 className={styles.heading}>Security Exceptions<HelpDot k="exceptions.overview" placement="bottom" label="About security exceptions" /></h1>
            {stats && (
              <span className={styles.headingCount}>{total} active</span>
            )}
            {!canWrite && <ReadOnlyBadge reason="Your role can view exceptions but cannot renew or revoke them." />}
          </div>
        </div>

        {stats && (
          <div className={styles.statsBanner}>
            <div className={`${styles.statCard} ${overdue > 0 ? styles.statCardRed : ''}`}>
              <span className={`${styles.statNum} ${overdue > 0 ? styles.numRed : ''}`}>{overdue}</span>
              <span className={styles.statLabel}>Overdue</span>
            </div>
            <div className={`${styles.statCard} ${dueSoon > 0 ? styles.statCardAmber : ''}`}>
              <span className={`${styles.statNum} ${dueSoon > 0 ? styles.numAmber : ''}`}>{dueSoon}</span>
              <span className={styles.statLabel}>Due in 30 days</span>
            </div>
            <div className={styles.statCard}>
              <span className={`${styles.statNum} ${styles.numGreen}`}>{ok}</span>
              <span className={styles.statLabel}>Within policy</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statNum}>{total}</span>
              <span className={styles.statLabel}>Total active</span>
            </div>
          </div>
        )}

        {breaches.length > 0 && (
          <div className={styles.breachSection}>
            <div className={styles.breachHeader}>
              <span className={styles.breachTitle}>In contravention of policy<HelpDot k="exceptions.breach" placement="top" label="About exceptions in breach" /></span>
              <span className={styles.breachCount}>{breaches.length} expired</span>
            </div>
            <p className={styles.breachIntro}>
              These acceptances passed their review date without renewal and were auto-expired.
              The risk is still accepted but is now in breach — renew to re-instate with a fresh
              review window, or revoke to force re-treatment.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <SortableTh column="level" {...breachTh} className={styles.th} helpKey="exceptions.col.level">Level</SortableTh>
                    <SortableTh column="threat" {...breachTh} className={styles.th} helpKey="col.threat">Threat</SortableTh>
                    <SortableTh column="system" {...breachTh} className={styles.th} helpKey="col.system">System</SortableTh>
                    <SortableTh column="department" {...breachTh} className={styles.th} helpKey="col.department">Department</SortableTh>
                    <SortableTh column="acceptedBy" {...breachTh} className={styles.th} helpKey="exceptions.col.accepted_by">Accepted by</SortableTh>
                    <SortableTh column="expires" {...breachTh} className={styles.th} helpKey="exceptions.col.expired">Expired</SortableTh>
                    <SortableTh column="overdue" {...breachTh} className={`${styles.th} ${styles.thDays}`} helpKey="exceptions.col.overdue">Overdue</SortableTh>
                    {canWrite && <th className={styles.th} />}
                  </tr>
                </thead>
                <tbody>
                  {breachSort.sorted.map(e => (
                    <tr
                      key={e.exception_id}
                      className={`${styles.row} ${styles.row_overdue}`}
                      onClick={() => navigate(`/risks/${e.risk_id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={ev => { if (ev.key === 'Enter') navigate(`/risks/${e.risk_id}`); }}
                    >
                      <td className={styles.td}>
                        <span className={`${styles.levelPill} ${LEVEL_CLASS[scoreLevel(e.risk_score)] || ''}`}>
                          {scoreLevel(e.risk_score)}
                        </span>
                      </td>
                      <td className={`${styles.td} ${styles.tdMain}`}>{e.threat_name}</td>
                      <td className={`${styles.td} ${styles.tdMono}`}>{e.system_name}</td>
                      <td className={`${styles.td} ${styles.tdSecondary}`}>{e.department_name || '—'}</td>
                      <td className={`${styles.td} ${styles.tdSecondary}`}>{e.accepted_by_name || '—'}</td>
                      <td className={`${styles.td} ${styles.tdMono}`}>{fmtDate(e.expires_at)}</td>
                      <td className={styles.td}>
                        <span className={`${styles.daysPill} ${styles.days_overdue}`}>{e.days_overdue}d</span>
                      </td>
                      {canWrite && (
                        <td className={styles.td} onClick={ev => ev.stopPropagation()}>
                          <div className={styles.actions}>
                            <button
                              className={styles.btnRenew}
                              onClick={() => setModal({ mode: 'renew', exception: e })}
                            >Renew</button>
                            <button
                              className={styles.btnRevoke}
                              onClick={() => setModal({ mode: 'revoke', exception: e })}
                            >Revoke</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className={styles.filterBar}>
          <DepartmentScopeFilter {...scopeCtl} showShared={false} />
          <div className={styles.filterGroup}>
            {EXPIRY_FILTERS.map(f => (
              <button
                key={f.value}
                className={`${styles.filterChip} ${expiryFilter === f.value ? styles.filterChipActive : ''}`}
                onClick={() => setExpiryFilter(f.value)}
              >{f.label}</button>
            ))}
          </div>
          <div className={styles.filterGroup}>
            {LEVEL_FILTERS.map(f => (
              <button
                key={f.value}
                className={`${styles.filterChip} ${levelFilter === f.value ? styles.filterChipActive : ''}`}
                onClick={() => setLevelFilter(f.value)}
              >{f.label}</button>
            ))}
          </div>
        </div>

        {loading && <div className={styles.loadingBar} />}
        {!loading && error && !items.length && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && items.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No exceptions found</p>
            <p className={styles.emptyBody}>
              {expiryFilter || levelFilter
                ? 'Try adjusting the filters above.'
                : 'No active risk exceptions.'}
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <SortableTh column="level" {...itemTh} className={styles.th} helpKey="exceptions.col.level">Level</SortableTh>
                  <SortableTh column="threat" {...itemTh} className={styles.th} helpKey="col.threat">Threat</SortableTh>
                  <SortableTh column="system" {...itemTh} className={styles.th} helpKey="col.system">System</SortableTh>
                  <SortableTh column="department" {...itemTh} className={styles.th} helpKey="col.department">Department</SortableTh>
                  <SortableTh column="acceptedBy" {...itemTh} className={styles.th} helpKey="exceptions.col.accepted_by">Accepted by</SortableTh>
                  <SortableTh column="cadence" {...itemTh} className={styles.th} helpKey="exceptions.col.cadence">Cadence</SortableTh>
                  <SortableTh column="expires" {...itemTh} className={styles.th} helpKey="exceptions.expiry" helpPlacement="top" helpLabel="About exception expiry">Expires</SortableTh>
                  <SortableTh column="days" {...itemTh} className={`${styles.th} ${styles.thDays}`} helpKey="exceptions.col.days">Days</SortableTh>
                  {canWrite && <th className={styles.th} />}
                </tr>
              </thead>
              <tbody>
                {itemSort.sorted.map(e => (
                  <tr
                    key={e.exception_id}
                    className={`${styles.row} ${styles[`row_${e.expiry_status}`] || ''}`}
                    onClick={() => navigate(`/risks/${e.risk_id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={ev => { if (ev.key === 'Enter') navigate(`/risks/${e.risk_id}`); }}
                  >
                    <td className={styles.td}>
                      <span className={`${styles.levelPill} ${LEVEL_CLASS[scoreLevel(e.risk_score)] || ''}`}>
                        {scoreLevel(e.risk_score)}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.tdMain}`}>{e.threat_name}</td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{e.system_name}</td>
                    <td className={`${styles.td} ${styles.tdSecondary}`}>
                      {e.department_name || '—'}
                    </td>
                    <td className={`${styles.td} ${styles.tdSecondary}`}>
                      {e.accepted_by_name || '—'}
                    </td>
                    <td className={`${styles.td} ${styles.tdMono}`}>
                      {CADENCE_LABEL[e.review_cadence] || e.review_cadence || '—'}
                    </td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{fmtDate(e.expires_at)}</td>
                    <td className={styles.td}>
                      <span className={`${styles.daysPill} ${styles[`days_${e.expiry_status}`]}`}>
                        {fmtDays(e.days_until_expiry)}
                      </span>
                    </td>
                    {canWrite && (
                      <td className={styles.td} onClick={ev => ev.stopPropagation()}>
                        <div className={styles.actions}>
                          <button
                            className={styles.btnRenew}
                            onClick={() => setModal({ mode: 'renew', exception: e })}
                          >Renew</button>
                          <button
                            className={styles.btnRevoke}
                            onClick={() => setModal({ mode: 'revoke', exception: e })}
                          >Revoke</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ExceptionFormModal
          mode={modal.mode}
          riskId={modal.exception.risk_id}
          exception={{ id: modal.exception.exception_id, ...modal.exception }}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
    </Shell>
  );
}
