// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../context/AuthContext';
import {
  getPendingRisks, getActionStats,
  getSiroCyclePending, getSiroActionPending,
  getMyInProgressActions,
  getAcceptanceQueue, getMeetings,
  getReturnedToMe,
} from '../api';
import { HelpDot } from './HelpDot';
import styles from './MyActionsWidget.module.css';

// Each item: { label, path, fetch, kind }
// kind 'action' = must-do (red alert when > 0)
// kind 'info'   = awareness (amber when > 0)
// Exported for unit testing of the role → items contract.
export function buildItems(role) {
  // Verification is retired: an action finishes when its last ITEM completes.
  // The equivalent "work outstanding" signal is the open item count, which
  // drills into the org-wide remediation roll-up.
  const openItemsItem = {
    label: 'Remediation items still open',
    path:  '/remediation',
    kind:  'info',
    fetch: async () => {
      const d = await getActionStats();
      return parseInt(d?.open_items ?? 0, 10);
    },
  };
  const acceptanceItem = {
    label: 'Proposed actions awaiting acceptance',
    path:  '/acceptance-queue',
    kind:  'action',
    fetch: async () => {
      const d = await getAcceptanceQueue();
      return d?.count ?? 0;
    },
  };
  const closedMeetingsItem = {
    label: 'Meetings closed — minutes not yet issued',
    path:  '/meetings',
    kind:  'action',
    fetch: async () => {
      const d = await getMeetings();
      return (d?.meetings ?? []).filter(m => m.state === 'closed').length;
    },
  };
  const returnedToMeItem = {
    label: 'Risks returned to you — need rework',
    path:  '/risks/future',
    kind:  'action',
    fetch: async () => {
      const d = await getReturnedToMe();
      return d?.count ?? 0;
    },
  };

  switch (role) {
    case 'ciso':
      return [
        {
          label: 'Risks awaiting validation',
          path:  '/risks/pending',
          kind:  'action',
          fetch: async () => {
            const d = await getPendingRisks();
            return d?.count ?? 0;
          },
        },
        acceptanceItem,
        openItemsItem,
      ];

    case 'risk_analyst':
      return [returnedToMeItem, openItemsItem];

    case 'siro':
      return [
        {
          label: 'Review cycles pending approval',
          path:  '/siro/cycles',
          kind:  'action',
          fetch: async () => {
            const d = await getSiroCyclePending();
            return Array.isArray(d) ? d.length : (d?.count ?? 0);
          },
        },
        {
          label: 'SIRO actions pending review',
          path:  '/actions',
          kind:  'action',
          fetch: async () => {
            const d = await getSiroActionPending();
            return Array.isArray(d) ? d.length : (d?.count ?? 0);
          },
        },
        acceptanceItem,
        openItemsItem,
      ];

    case 'meeting_secretary':
      return [
        closedMeetingsItem,
      ];

    case 'admin':
      return [acceptanceItem];

    case 'information_asset_manager':
    case 'information_asset_owner':
    case 'security_consultant':
    default:
      return [];
  }
}

export function MyActionsWidget() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const defs = buildItems(user?.role);
    let cancelled = false;

    (async () => {
      const [results, inFlightData] = await Promise.all([
        Promise.allSettled(defs.map(d => d.fetch())),
        getMyInProgressActions().catch(() => null),
      ]);
      if (cancelled) return;

      const resolved = defs
        .map((def, i) => ({
          label: def.label,
          path:  def.path,
          kind:  def.kind,
          count: results[i].status === 'fulfilled' ? (results[i].value ?? 0) : null,
        }))
        .filter(item => item.count !== null);

      // My own in-progress security actions become a navigating summary row —
      // not an in-place unfold. Like the heatmap widget, we summarise here and
      // drill into the list page (/actions?mine=1) to act + log progress.
      const ip = inFlightData?.count ?? 0;
      if (ip > 0) {
        const needs = inFlightData.needs_update_count ?? 0;
        resolved.push({
          label: needs > 0
            ? `My in-progress actions — ${needs} need an update`
            : 'My in-progress actions',
          path:  '/actions?mine=1',
          kind:  needs > 0 ? 'action' : 'info',
          count: ip,
        });
      }

      setItems(resolved);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user?.role]);

  const urgentCount = items.filter(i => i.kind === 'action' && i.count > 0).length;
  const totalOutstanding = items.reduce(
    (sum, i) => sum + (i.count > 0 ? 1 : 0), 0
  );

  return (
    <div className={`${styles.widget} ${urgentCount > 0 ? styles.alertRed : totalOutstanding > 0 ? styles.alertAmber : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>My Tasks<HelpDot k="widget.my_tasks" placement="bottom" label="About My Tasks" /></span>
        {urgentCount > 0
          ? <span className={styles.badgeRed}>{urgentCount} outstanding</span>
          : totalOutstanding > 0
          ? <span className={styles.badgeAmber}>{totalOutstanding} to review</span>
          : <span className={styles.badgeClear}>all clear</span>
        }
      </div>

      {loading && <div className={styles.loadingBar} />}

      {!loading && items.length === 0 && (
        <p className={styles.emptyMsg}>Nothing requires your attention right now.</p>
      )}

      {!loading && (
        <div className={styles.list}>
          {items.map((item, idx) => {
            const isUrgent  = item.kind === 'action' && item.count > 0;
            const isWarning = item.kind === 'info'   && item.count > 0;
            return (
              <div
                key={idx}
                className={`${styles.item} ${isUrgent ? styles.itemUrgent : isWarning ? styles.itemWarning : styles.itemClear}`}
                onClick={() => item.path && navigate(item.path)}
                role={item.path ? 'button' : undefined}
                tabIndex={item.path ? 0 : undefined}
                onKeyDown={item.path ? e => e.key === 'Enter' && navigate(item.path) : undefined}
              >
                <span className={styles.itemIcon} aria-hidden="true">
                  {isUrgent ? '!' : isWarning ? '⚠' : '✓'}
                </span>
                <span className={styles.itemLabel}>{item.label}</span>
                <span className={`${styles.itemCount} ${isUrgent ? styles.countUrgent : isWarning ? styles.countWarning : styles.countClear}`}>
                  {item.count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
