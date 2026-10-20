// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * components/ExceptionBreachWidget.jsx
 *
 * Breach queue: risk-acceptance exceptions that passed their review date without
 * being renewed or revoked, and were auto-expired by the v75 sweep. The
 * underlying risk is still treatment_decision='accept' — it has lapsed into
 * breach and needs a human to renew or revoke.
 *
 *   role='ciso'  → "Exceptions in breach" (the escalation queue to action)
 *   role='siro'  → "In contravention of policy" (oversight framing)
 *
 * Rows click through to the risk detail page where renew/revoke live.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate }   from 'react-router-dom';
import { getEscalatedExceptions } from '../api';
import { scoreLevel } from '../utils/riskColors';
import styles from './ExceptionBreachWidget.module.css';

const LEVEL_CLASS = {
  low:           styles.levelLow,
  medium:        styles.levelMedium,
  high:          styles.levelHigh,
  critical:      styles.levelCritical,
  catastrophic:  styles.levelCatastrophic,
};

export function ExceptionBreachWidget({ role = 'ciso' }) {
  const navigate = useNavigate();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getEscalatedExceptions();
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setError('Could not load the breach queue.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isSiro = role === 'siro';
  const title  = isSiro ? 'In contravention of policy' : 'Exceptions in breach';
  const badge  = isSiro ? 'SIRO' : 'CISO';
  const total  = items.length;
  const isAlert = total > 0;
  const top    = items.slice(0, 4);
  const moreCount = Math.max(0, total - top.length);

  return (
    <div className={`${styles.widget} ${isAlert ? styles.alert : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.badge}>{badge}</span>
      </div>

      <div className={styles.body}>
        {loading && <div className={styles.skeleton} aria-label="Loading…" />}
        {!loading && error && <p className={styles.error}>{error}</p>}

        {!loading && !error && (
          <>
            <div className={styles.statsRow}>
              <span className={`${styles.count} ${total === 0 ? styles.countZero : styles.countAlert}`}>{total}</span>
              <span className={styles.countLabel}>
                {total === 0
                  ? 'no expired exceptions'
                  : `expired exception${total === 1 ? '' : 's'} awaiting ${isSiro ? 'oversight' : 'action'}`}
              </span>
            </div>

            {total === 0 && (
              <p className={styles.emptyMsg}>
                No exceptions in breach. Every acceptance is within its review window.
              </p>
            )}

            {top.length > 0 && (
              <ul className={styles.list}>
                {top.map(e => (
                  <li
                    key={e.exception_id}
                    className={styles.listItem}
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
                      <span className={styles.itemSystem}>{e.system_name}{e.department_name ? ` · ${e.department_name}` : ''}</span>
                    </span>
                    <span className={styles.itemOverdue}>
                      {e.days_overdue}d overdue
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {!loading && !error && total > 0 && (
        <div className={styles.footer}>
          <Link to="/exceptions" className={styles.link}>
            {moreCount > 0 ? `+ ${moreCount} more →` : 'View all exceptions →'}
          </Link>
        </div>
      )}
    </div>
  );
}
