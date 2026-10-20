// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './CountWidget.module.css';

/**
 * Shared "big-count headline" dashboard widget (Pattern B). Canonical style is
 * the former SiroActionsWidget. Each caller supplies a `fetchCount` returning a
 * number; the rest is presentation.
 *
 * Props:
 *  - title, badge          header text + role chip
 *  - fetchCount            async () => number
 *  - errorText             message shown if fetchCount throws
 *  - singular / plural     count label (chosen by count === 1)
 *  - accent                'amber' | 'red' | 'none' (default) — tint when count > 0
 *  - to                    optional navigation target
 *  - linkLabel             optional footer link text (requires `to`)
 *  - clickable             whole widget navigates to `to` (renders footer as text)
 *  - zeroText              optional: shown instead of the number when count === 0
 */
export function CountWidget({
  title,
  badge,
  fetchCount,
  errorText = 'Could not load data.',
  singular,
  plural,
  accent = 'none',
  to,
  linkLabel,
  clickable = false,
  zeroText,
}) {
  const [count,   setCount]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await fetchCount();
        if (!cancelled) setCount(value);
      } catch (err) {
        if (!cancelled) setError(errorText);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [fetchCount, errorText]);

  const lit = count > 0 && accent !== 'none';
  const accentWidget = lit ? (accent === 'red' ? styles.accentRed : styles.accentAmber) : '';
  const accentCount  = lit ? (accent === 'red' ? styles.countRed  : styles.countAmber) : '';

  const go = to ? () => navigate(to) : undefined;
  const widgetProps = clickable && go
    ? { onClick: go, role: 'button', tabIndex: 0,
        onKeyDown: (e) => e.key === 'Enter' && go(), style: { cursor: 'pointer' } }
    : {};

  const showZero = zeroText != null && count === 0;

  return (
    <div className={`${styles.widget} ${accentWidget}`} {...widgetProps}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.badge}>{badge}</span>
      </div>

      <div className={styles.body}>
        {loading && (
          <div className={styles.skeleton} aria-label="Loading…">
            <div className={styles.skeletonCount} />
            <div className={styles.skeletonLabel} />
          </div>
        )}

        {!loading && error && <p className={styles.error}>{error}</p>}

        {!loading && !error && showZero && (
          <span className={styles.countLabel}>{zeroText}</span>
        )}

        {!loading && !error && !showZero && (
          <>
            <span className={`${styles.count} ${accentCount}`}>{count}</span>
            <span className={styles.countLabel}>
              {count === 1 ? singular : plural}
            </span>
          </>
        )}
      </div>

      {!loading && !error && linkLabel && to && (
        <div className={styles.footer}>
          {clickable
            ? <span className={styles.link}>{linkLabel}</span>
            : <Link to={to} className={styles.link}>{linkLabel}</Link>}
        </div>
      )}
    </div>
  );
}
