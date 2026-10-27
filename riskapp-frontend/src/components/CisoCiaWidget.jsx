// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { useNavigate }         from 'react-router-dom';
import { getImpactTables }     from '../api';
import styles                  from './CisoPendingWidget.module.css';
import { HelpDot }              from './HelpDot';

export function CisoCiaWidget() {
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tables = await getImpactTables();
        if (cancelled) return;
        // Impact tables no longer have rows to analyse (the old row_count /
        // rows_with_any_analysis fields are gone, which made this NaN). What the
        // CISO still has to do here is publish the organisation's tables.
        const orgTables = tables.filter(t => t.scope === 'organisation');
        setPending({ drafts: orgTables.filter(t => !t.published_at).length, total: orgTables.length });
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

  return (
    <div
      className={styles.widget}
      onClick={() => navigate('/impact-tables?scope=organisation')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/impact-tables?scope=organisation')}
      style={{ cursor: 'pointer' }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Impact Tables<HelpDot k="widget.impact_tables" placement="bottom" label="About Impact Tables" /></span>
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
          <p className={styles.error}>Could not load — {error}</p>
        )}

        {!loading && !error && pending?.total === 0 && (
          <span className={styles.countLabel}>No organisation impact tables yet.</span>
        )}

        {!loading && !error && pending?.total > 0 && pending.drafts === 0 && (
          <span className={styles.countLabel}>
            {pending.total === 1 ? 'The organisation impact table is published.' : `All ${pending.total} organisation impact tables are published.`}
          </span>
        )}

        {!loading && !error && pending?.drafts > 0 && (
          <>
            <span className={styles.count}>{pending.drafts}</span>
            <span className={styles.countLabel}>
              {pending.drafts === 1 ? 'organisation impact table not yet published' : 'organisation impact tables not yet published'}
            </span>
          </>
        )}
      </div>

      {!loading && (
        <div className={styles.footer}>
          <span className={styles.link}>Go to org impact tables →</span>
        </div>
      )}
    </div>
  );
}
