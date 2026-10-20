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
                    <th className={styles.th}>Level</th>
                    <th className={styles.th}>Threat</th>
                    <th className={styles.th}>System</th>
                    <th className={styles.th}>Department</th>
                    <th className={styles.th}>Accepted by</th>
                    <th className={styles.th}>Expired</th>
                    <th className={`${styles.th} ${styles.thDays}`}>Overdue</th>
                    {canWrite && <th className={styles.th} />}
                  </tr>
                </thead>
                <tbody>
                  {scopedBreaches.map(e => (
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
                : 'No active risk acceptance exceptions.'}
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Level</th>
                  <th className={styles.th}>Threat</th>
                  <th className={styles.th}>System</th>
                  <th className={styles.th}>Department</th>
                  <th className={styles.th}>Accepted by</th>
                  <th className={styles.th}>Cadence</th>
                  <th className={styles.th}>Expires<HelpDot k="exceptions.expiry" placement="top" label="About exception expiry" /></th>
                  <th className={`${styles.th} ${styles.thDays}`}>Days</th>
                  {canWrite && <th className={styles.th} />}
                </tr>
              </thead>
              <tbody>
                {scopedItems.map(e => (
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
