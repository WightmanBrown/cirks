// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { useNavigate }         from 'react-router-dom';
import { getPendingRisks }     from '../api';
import styles                  from './CisoPendingWidget.module.css';
import { HelpDot }              from './HelpDot';

export function CisoPendingWidget() {
  const [count,   setCount]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { count } = await getPendingRisks();
        if (!cancelled) setCount(count);
      } catch (err) {
        if (!cancelled) {
          const status = err.response?.status;
          const detail = err.response?.data?.error || err.message;
          setError(status ? `${status}: ${detail}` : detail);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  function handleClick() {
    navigate('/risks/pending');
  }

  return (
    <div
      className={styles.widget}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      style={{ cursor: 'pointer' }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Pending Validations<HelpDot k="widget.pending_validations" placement="bottom" label="About Pending Validations" /></span>
        <span className={styles.badge}>CISO</span>
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.skeleton} aria-label="Loading…">
            <div className={styles.skeletonCount} />
            <div className={styles.skeletonLabel} />
          </div>
        )}

        {!loading && error && (
          <p className={styles.error}>Could not load pending risks — {error}</p>
        )}

        {!loading && !error && count === 0 && (
          <span className={styles.countLabel}>There are no pending risks.</span>
        )}

        {!loading && !error && count > 0 && (
          <>
            <span className={styles.count}>{count}</span>
            <span className={styles.countLabel}>
              {count === 1 ? 'risk awaiting validation' : 'risks awaiting validation'}
            </span>
          </>
        )}
      </div>

      {!loading && (
        <div className={styles.footer}>
          <span className={styles.link}>View all pending risks →</span>
        </div>
      )}
    </div>
  );
}
