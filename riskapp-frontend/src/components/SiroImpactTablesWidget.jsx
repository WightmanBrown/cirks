// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { Link }                from 'react-router-dom';
import { getSiroPublishedImpactTables } from '../api';
import styles from './SiroWidget.module.css';
import tableStyles from './SiroImpactTablesWidget.module.css';
import { HelpDot } from './HelpDot';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function SiroImpactTablesWidget() {
  const [tables,  setTables]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { tables: rows } = await getSiroPublishedImpactTables();
        if (!cancelled) setTables(rows);
      } catch (err) {
        if (!cancelled) setError('Could not load impact table notifications.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const hasTables = tables.length > 0;

  return (
    <div className={`${styles.widget} ${hasTables ? styles.pending : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>Impact Tables<HelpDot k="widget.siro_impact_tables" placement="bottom" /></span>
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

        {!loading && !error && !hasTables && (
          <span className={styles.countLabel}>No tables published by CISO.</span>
        )}

        {!loading && !error && hasTables && (
          <ul className={tableStyles.tableList}>
            {tables.map(t => (
              <li key={t.id} className={tableStyles.tableItem}>
                <span className={tableStyles.tableName}>{t.name}</span>
                <span className={tableStyles.tableMeta}>
                  Published by {t.published_by_role} · {fmtDate(t.published_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && !error && (
        <div className={styles.footer}>
          <Link to="/impact-tables?scope=organisation" className={styles.link}>
            Review impact tables →
          </Link>
        </div>
      )}
    </div>
  );
}
