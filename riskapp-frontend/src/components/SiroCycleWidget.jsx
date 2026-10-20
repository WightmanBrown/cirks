// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { Link }                from 'react-router-dom';
import { getSiroCyclePending } from '../api';
import styles from './SiroWidget.module.css';
import { HelpDot } from './HelpDot';

export function SiroCycleWidget() {
  const [count,   setCount]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { count } = await getSiroCyclePending();
        if (!cancelled) setCount(count);
      } catch (err) {
        if (!cancelled) setError('Could not load pending cycles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const isPending = count > 0;

  return (
    <div className={`${styles.widget} ${isPending ? styles.pending : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>Cycle Approval<HelpDot k="widget.cycle_approval" placement="bottom" label="About Cycle Approval" /></span>
        <span className={styles.badge}>SIRO</span>
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.skeleton} aria-label="Loading…">
            <div className={styles.skeletonCount} />
            <div className={styles.skeletonLabel} />
          </div>
        )}

        {!loading && error && (
          <p className={styles.error}>{error}</p>
        )}

        {!loading && !error && (
          <>
            <span className={`${styles.count} ${isPending ? styles.countPending : ''}`}>
              {count}
            </span>
            <span className={styles.countLabel}>
              {count === 1 ? 'cycle awaiting sign-off' : 'cycles awaiting sign-off'}
            </span>
          </>
        )}
      </div>

      {!loading && !error && (
        <div className={styles.footer}>
          <Link to="/siro/cycles" className={styles.link}>
            View cycles →
          </Link>
        </div>
      )}
    </div>
  );
}
