// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { useNavigate }         from 'react-router-dom';
import { getSetupStatus }      from '../api';
import { HelpDot }              from './HelpDot';
import styles                  from './AdminSetupWidget.module.css';

export function AdminSetupWidget() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { items: data } = await getSetupStatus();
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setError('Could not load setup status.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const okCount = items.filter(i => i.ok).length;
  const allDone = items.length > 0 && okCount === items.length;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>System Setup<HelpDot k="widget.system_setup" placement="bottom" label="About System Setup" /></span>
        <span className={styles.badge}>ADMIN</span>
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.skeleton}>
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n} className={styles.skeletonRow} />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className={styles.error}>{error}</p>
        )}

        {!loading && !error && allDone && (
          <p className={styles.allDone}>All prerequisites are configured.</p>
        )}

        {!loading && !error && !allDone && (
          <ul className={styles.list}>
            {items.map(item => (
              <li key={item.key} className={`${styles.item} ${item.ok ? styles.itemOk : styles.itemPending}`}>
                <span className={styles.icon} aria-hidden="true">
                  {item.ok ? '✓' : '○'}
                </span>
                <span className={styles.itemBody}>
                  <span className={styles.itemLabel}>{item.label}</span>
                  {!item.ok && (
                    <span className={styles.itemDesc}>{item.description}</span>
                  )}
                </span>
                {!item.ok && item.action_path && (
                  <button
                    className={styles.actionBtn}
                    onClick={() => navigate(item.action_path)}
                  >
                    {item.action_label} →
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && !error && (
        <div className={styles.footer}>
          <span className={allDone ? styles.progressDone : styles.progress}>
            {okCount} of {items.length} prerequisites complete
          </span>
        </div>
      )}
    </div>
  );
}
