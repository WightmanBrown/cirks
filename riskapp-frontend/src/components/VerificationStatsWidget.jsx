// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { useNavigate }         from 'react-router-dom';
import { getActionStats, getOverdueActionCount } from '../api';
import styles from './VerificationStatsWidget.module.css';
import { HelpDot } from './HelpDot';

// A clickable stat row: navigates on click or Enter/Space.
function StatRow({ label, value, valueClass = '', rowAlert = false, onActivate }) {
  return (
    <div
      className={`${styles.statRow} ${styles.statRowClickable} ${rowAlert ? styles.statRowAlert : ''}`}
      onClick={onActivate}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); } }}
    >
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${valueClass}`}>{value}</span>
    </div>
  );
}

export function VerificationStatsWidget() {
  const navigate      = useNavigate();
  const [stats,       setStats]       = useState(null);
  const [overdueCount, setOverdueCount] = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, od] = await Promise.allSettled([
          getActionStats(),
          getOverdueActionCount(),
        ]);
        if (cancelled) return;
        if (s.status === 'fulfilled') setStats(s.value);
        // Overdue endpoint is CISO-only; silently skip for other roles
        if (od.status === 'fulfilled') setOverdueCount(od.value?.count ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasOverdue  = overdueCount > 0;
  const hasQueue    = stats && parseInt(stats.awaiting_acceptance, 10) > 0;
  const isAlert     = hasOverdue || hasQueue;

  // Every row goes to the Security Actions page, pre-filtered where the Actions
  // page has a matching status tab (overdue / completed / in_progress); the rest
  // land on the unfiltered list.
  const goActions = (status) => () =>
    navigate(status ? `/actions?status=${status}` : '/actions');

  return (
    <div className={`${styles.widget} ${isAlert ? styles.alert : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>Security Action Plan<HelpDot k="widget.security_action_plan" placement="bottom" label="About Security Action Plan" /></span>
        {isAlert && (
          <span className={styles.alertBadge}>
            {hasOverdue ? `${overdueCount} OVERDUE` : `${stats.awaiting_acceptance} TO ACCEPT`}
          </span>
        )}
      </div>

      {loading && <div className={styles.loadingBar} />}

      {stats && (
        <div className={styles.statList}>
          {overdueCount !== null && (
            <StatRow
              label="Overdue actions"
              value={overdueCount}
              valueClass={hasOverdue ? styles.statRed : ''}
              rowAlert={hasOverdue}
              onActivate={goActions('overdue')}
            />
          )}
          <StatRow
            label="Awaiting acceptance"
            value={stats.awaiting_acceptance}
            valueClass={hasQueue ? styles.statAlert : ''}
            onActivate={() => navigate('/acceptance-queue')}
          />
          <StatRow
            label="Accepted, in progress"
            value={stats.in_progress}
            onActivate={goActions('in_progress')}
          />
          <StatRow
            label="Remediation items open"
            value={stats.open_items}
            onActivate={() => navigate('/remediation')}
          />
          <StatRow
            label="Items completed (30 days)"
            value={stats.items_completed_recent}
            valueClass={styles.statGreen}
            onActivate={() => navigate('/remediation')}
          />
        </div>
      )}

      <div className={styles.footer}>
        {hasQueue && (
          <button className={styles.footerBtn} onClick={() => navigate('/acceptance-queue')}>
            Open acceptance queue →
          </button>
        )}
        <button className={styles.footerLink} onClick={() => navigate('/actions')}>
          View all actions →
        </button>
      </div>
    </div>
  );
}
