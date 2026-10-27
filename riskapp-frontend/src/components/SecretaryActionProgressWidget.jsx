// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrgInProgressActions } from '../api/index';
import styles from './SecretaryActionProgressWidget.module.css';
import { HelpDot } from './HelpDot';

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const STATUS_LABELS = {
  planned:     'Planned',
  in_progress: 'In progress',
};

// A risk action opens on its risk; an action about something else (an asset
// finding, v133/v134) has no risk, so it opens on the action itself.
const rowPath = (action) => (action.risk_id ? `/risks/${action.risk_id}` : `/actions/${action.id}`);

export function SecretaryActionProgressWidget() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    getOrgInProgressActions()
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.widget}>
        <div className={styles.header}>
          <span className={styles.title}>Action Progress<HelpDot k="widget.action_progress" placement="bottom" /></span>
        </div>
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }

  const needsUpdate = data?.actions?.filter(a => a.needs_update) ?? [];
  const hasUpdate   = data?.actions?.filter(a => !a.needs_update) ?? [];
  const total       = data?.count ?? 0;

  const displayActions = showAll ? needsUpdate : needsUpdate.slice(0, 5);
  const hidden = needsUpdate.length - displayActions.length;

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>Action Progress<HelpDot k="widget.action_progress" placement="bottom" /></span>
        {needsUpdate.length > 0 && (
          <span className={styles.alertBadge}>{needsUpdate.length} need update</span>
        )}
      </div>

      {total === 0 && (
        <p className={styles.muted}>No in-flight actions.</p>
      )}

      {total > 0 && (
        <>
          <div className={styles.summary}>
            <span className={styles.summaryNum}>{total}</span>
            <span className={styles.summaryLabel}>in-flight action{total !== 1 ? 's' : ''}</span>
            {data.last_meeting_date && (
              <span className={styles.sinceDate}>
                · progress since {formatDate(data.last_meeting_date)}
              </span>
            )}
          </div>

          {needsUpdate.length === 0 && (
            <p className={styles.allGood}>All actions have recent progress notes.</p>
          )}

          {needsUpdate.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Needs update</div>
              <ul className={styles.actionList}>
                {displayActions.map(action => (
                  <li
                    key={action.id}
                    className={styles.actionRow}
                    onClick={() => navigate(rowPath(action))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(rowPath(action));
                      }
                    }}
                    title="View the risk and this action's detail"
                  >
                    <span className={styles.actionAlert}>⚠</span>
                    <div className={styles.actionBody}>
                      <span className={styles.actionTitle}>{action.title}</span>
                      <div className={styles.actionMeta}>
                        <span className={`${styles.statusChip} ${styles[`status_${action.status}`]}`}>
                          {STATUS_LABELS[action.status] ?? action.status}
                        </span>
                        {action.owner_name && (
                          <span className={styles.owner}>{action.owner_name}</span>
                        )}
                        {action.target_date && (
                          <span className={styles.targetDate}>
                            due {formatDate(action.target_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <button className={styles.btnShowMore} onClick={() => setShowAll(true)}>
                  +{hidden} more
                </button>
              )}
            </>
          )}

          {hasUpdate.length > 0 && needsUpdate.length > 0 && (
            <div className={styles.updatedCount}>
              {hasUpdate.length} action{hasUpdate.length !== 1 ? 's' : ''} have recent updates
            </div>
          )}
        </>
      )}
    </div>
  );
}
