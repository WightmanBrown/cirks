// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import { getAcceptanceQueue, acceptAction, acceptSubjectAction } from '../api';
import { ReviewQueue, TargetScore, targetMax, fmtDate } from '../components/ReviewQueue';
import styles from './AcceptanceQueuePage.module.css';

// Why a non-risk action exists — its finding (v133/v134).
const ORIGIN_BLURB = {
  rating_incomplete: 'Finding: not rated against every mandatory impact table',
  component_record:  'Finding: per-system components not recorded on the system',
  document_review:   'Finding: policy or document past its review date',
};

// Plain-English summary of what a proposed action would commit the org to.
function itemBlurb(a) {
  const ctl = Number(a.control_count ?? 0);
  const cmp = Number(a.component_count ?? 0);
  const sys = Number(a.system_count ?? 0);
  const parts = [];
  if (ctl) parts.push(`${ctl} control${ctl !== 1 ? 's' : ''}`);
  if (cmp) parts.push(`${cmp} component${cmp !== 1 ? 's' : ''}`);
  const across = sys > 1 ? ` across ${sys} systems` : '';
  return `${parts.join(' + ')}${across}`;
}

export function AcceptanceQueuePage() {
  // confirmingId: action whose inline confirm prompt is open; busy: action being accepted
  const [confirmingId, setConfirmingId] = useState(null);
  const [busy,         setBusy]         = useState(null);
  const [acceptErr,    setAcceptErr]    = useState({});

  async function handleAccept(action, reload) {
    setBusy(action.action_id);
    setAcceptErr(e => ({ ...e, [action.action_id]: null }));
    try {
      // A risk action is accepted on its risk, which snapshots the risk
      // baseline; an action about anything else has no baseline to take.
      if (action.subject_type === 'risk') await acceptAction(action.risk_id, action.action_id);
      else await acceptSubjectAction(action.action_id);
      setConfirmingId(null);
      await reload();
    } catch (err) {
      setAcceptErr(e => ({ ...e, [action.action_id]: err.response?.data?.error || 'Acceptance failed.' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ReviewQueue
      title="Acceptance Queue"
      helpKey="acceptance_queue.title"
      countLabel={(n) => `${n} proposed action${n !== 1 ? 's' : ''} awaiting SWG acceptance`}
      emptyBody="No proposed actions are awaiting acceptance."
      intro="Review proposed remediation below and formally accept what the SWG has approved. Accepting freezes the action's items, owners and targets and, for an action on a risk, records the risk's current scores as the baseline to measure progress against — this cannot be undone. Actions raised from an assurance finding are grouped under what they are about."
      fetcher={async () => (await getAcceptanceQueue()).actions}
      metaDates={(a) => [
        Number(a.item_count ?? 0) > 0 && itemBlurb(a),
        a.target_date && `Target: ${fmtDate(a.target_date)}`,
        `Proposed ${fmtDate(a.created_at)}`,
      ].filter(Boolean)}
      renderControl={(a, { curMax, reload }) => {
        const target       = targetMax(a);
        const itemCount    = Number(a.item_count ?? 0);
        const isRisk       = a.subject_type === 'risk';
        const isConfirming = confirmingId === a.action_id;
        const isBusy       = busy === a.action_id;
        const err          = acceptErr[a.action_id];

        return (
          <>
            {!isRisk ? (
              <span className={styles.noItems}>{ORIGIN_BLURB[a.origin] || 'Raised from an assurance finding'}</span>
            ) : itemCount > 0 ? (
              <div className={styles.itemSummary}>
                <span className={styles.itemCount}>{itemCount}</span>
                <span>item{itemCount !== 1 ? 's' : ''}</span>
              </div>
            ) : (
              <span className={styles.noItems}>
                No remediation items — rebuild this action from the risk&rsquo;s coverage gap
              </span>
            )}

            {target != null && (
              <TargetScore curMax={curMax} target={target} label="Forecast risk:" />
            )}

            {err && <p className={styles.acceptErr}>{err}</p>}

            {isConfirming ? (
              <div className={styles.confirmBox}>
                <span className={styles.confirmText}>
                  {isRisk
                    ? <>Freeze {itemCount} item{itemCount !== 1 ? 's' : ''} and snapshot the baseline?</>
                    : <>Accept this action and its owner?</>}
                </span>
                <div className={styles.confirmButtons}>
                  <button className={styles.btnCancel} onClick={() => setConfirmingId(null)} disabled={isBusy}>
                    Cancel
                  </button>
                  <button className={styles.btnConfirmAccept} onClick={() => handleAccept(a, reload)} disabled={isBusy}>
                    {isBusy ? 'Accepting…' : 'Confirm acceptance'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className={styles.btnAccept}
                disabled={isRisk && itemCount === 0}
                title={isRisk && itemCount === 0
                  ? 'This action has no remediation items to accept'
                  : 'Accept this action'}
                onClick={() => { setConfirmingId(a.action_id); setAcceptErr(e => ({ ...e, [a.action_id]: null })); }}
              >
                Accept
              </button>
            )}
          </>
        );
      }}
    />
  );
}
