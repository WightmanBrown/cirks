// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * components/ExceptionsWidget.jsx
 *
 * Dashboard widget for active risk-acceptance exceptions.
 *
 * Exceptions are read-visible to EVERYONE org-wide (v68) — every role sees the
 * full org list here, regardless of department. The role badge is just a "who
 * am I" chip, not a scope indicator.
 *
 * Alert state when any exception is overdue (policy violation).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate }   from 'react-router-dom';
import { getActiveExceptions, getExceptionStats } from '../api';
import { scoreLevel } from '../utils/riskColors';
import { HelpDot } from './HelpDot';
import styles from './ExceptionsWidget.module.css';

const LEVEL_CLASS = {
  low:      styles.levelLow,
  medium:   styles.levelMedium,
  high:     styles.levelHigh,
  critical: styles.levelCritical,
};

function fmtDays(d) {
  if (d == null) return '—';
  if (d < 0)  return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'today';
  return `in ${d}d`;
}

export function ExceptionsWidget({ role = 'ciso' }) {
  const navigate = useNavigate();
  const [stats,   setStats]   = useState(null);
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, list] = await Promise.all([
          getExceptionStats(),
          getActiveExceptions(),
        ]);
        if (cancelled) return;
        setStats(s);
        // Most-urgent first: overdue then due_soon then ok, then by expires_at
        const prio = { overdue: 0, due_soon: 1, ok: 2 };
        const ordered = [...list].sort((a, b) => {
          const pa = prio[a.expiry_status] ?? 9;
          const pb = prio[b.expiry_status] ?? 9;
          return pa - pb || (a.days_until_expiry ?? 0) - (b.days_until_expiry ?? 0);
        });
        setItems(ordered);
      } catch {
        if (!cancelled) setError('Could not load exceptions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const overdue       = Number(stats?.overdue             || 0);
  const dueSoon       = Number(stats?.due_soon            || 0);
  const total         = Number(stats?.total               || 0);
  const newCount      = Number(stats?.new_count           || 0);
  const oldestAge     = Number(stats?.oldest_age_days     || 0);
  const siroEscalated = Number(stats?.siro_escalated_count || 0);
  const isAlert       = overdue > 0 || siroEscalated > 0;
  const top           = items.slice(0, 4);
  const moreCount     = Math.max(0, items.length - top.length);

  const badgeLabel =
    role === 'siro'                       ? 'SIRO'    :
    role === 'information_asset_owner'    ? 'IAO'     :
    role === 'information_asset_manager'  ? 'IAM'     :
    role === 'risk_analyst'              ? 'ANALYST' :
    'CISO';

  return (
    <div className={`${styles.widget} ${isAlert ? styles.alert : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>Security Exceptions<HelpDot k="widget.exceptions" placement="bottom" label="About security exceptions" /></span>
        <span className={styles.badge}>{badgeLabel}</span>
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.skeleton} aria-label="Loading…">
            <div className={styles.skeletonCount} />
            <div className={styles.skeletonLabel} />
          </div>
        )}

        {!loading && error && <p className={styles.error}>{error}</p>}

        {!loading && !error && (
          <>
            <div className={styles.statsRow}>
              <span className={`${styles.count} ${total === 0 ? styles.countZero : styles.countNonZero}`}>{total}</span>
              <div className={styles.statsAux}>
                <span className={styles.countLabel}>active</span>
                {overdue > 0      && <span className={styles.pillOverdue}>{overdue} overdue</span>}
                {dueSoon > 0      && <span className={styles.pillDueSoon}>{dueSoon} due in 30d</span>}
              </div>
            </div>

            {/* ── Since-last-SWG meta-row ─────────────────────────────────── */}
            {total > 0 && (
              <div className={styles.metaRow}>
                {newCount > 0 ? (
                  <span className={styles.metaNew}>
                    +{newCount} since last SWG
                  </span>
                ) : (
                  <span className={styles.metaNeutral}>none new since last SWG</span>
                )}
                <span className={styles.metaDivider} />
                {oldestAge > 0 && (
                  <span className={styles.metaAge}>
                    oldest {oldestAge}d
                  </span>
                )}
                {siroEscalated > 0 && (
                  <>
                    <span className={styles.metaDivider} />
                    <span className={styles.metaEscalated}>
                      {siroEscalated} SIRO escalated
                    </span>
                  </>
                )}
              </div>
            )}

            {top.length === 0 && (
              <p className={styles.emptyMsg}>No active exceptions. ISMS is healthy.</p>
            )}

            {top.length > 0 && (
              <ul className={styles.list}>
                {top.map(e => (
                  <li
                    key={e.exception_id}
                    className={`${styles.listItem} ${styles[`status_${e.expiry_status}`] || ''}`}
                    onClick={() => navigate(`/risks/${e.risk_id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={ev => { if (ev.key === 'Enter') navigate(`/risks/${e.risk_id}`); }}
                  >
                    <span className={`${styles.levelPill} ${LEVEL_CLASS[scoreLevel(e.risk_score)] || ''}`}>
                      {scoreLevel(e.risk_score)}
                    </span>
                    <span className={styles.itemMain}>
                      <span className={styles.itemThreat}>{e.threat_name}</span>
                      <span className={styles.itemSystem}>{e.system_name}</span>
                    </span>
                    <span className={`${styles.itemExpiry} ${styles[`expiry_${e.expiry_status}`] || ''}`}>
                      {fmtDays(e.days_until_expiry)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {!loading && !error && (moreCount > 0 || items.length > 0) && (
        <div className={styles.footer}>
          {moreCount > 0 && (
            <Link to="/exceptions" className={styles.link}>
              + {moreCount} more →
            </Link>
          )}
          {moreCount === 0 && (
            <Link to="/exceptions" className={styles.link}>
              View all exceptions →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
