// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from './Shell';
import { BackButton } from './BackButton';
import { chipClass, scoreColorClass, scoreLevel } from '../utils/riskColors';
import styles from './ReviewQueue.module.css';

const LEVEL_CLASS = {
  low:      styles.levelLow,
  medium:   styles.levelMedium,
  high:     styles.levelHigh,
  critical: styles.levelCritical,
};

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function scoreMax(pC, iC, pI, iI, pA, iA) {
  return Math.max((pC ?? 0) * (iC ?? 0), (pI ?? 0) * (iI ?? 0), (pA ?? 0) * (iA ?? 0));
}

/**
 * Max forecast score for an action, from the MIN of its control items' target
 * probabilities (target_p_*) against the risk's current impact. Impact is
 * derived from the system's assets, so remediation only ever moves probability.
 * Null when the action carries no targets.
 */
export function targetMax(a) {
  if (a.target_p_c == null) return null;
  return Math.max(
    a.target_p_c * (a.current_imp_c ?? 0),
    a.target_p_i * (a.current_imp_i ?? 0),
    a.target_p_a * (a.current_imp_a ?? 0),
  );
}

/** Shared current → target chip block, used inside a queue's renderControl. */
export function TargetScore({ curMax, target, label }) {
  return (
    <div className={styles.targetScore}>
      <span className={styles.targetLabel}>{label}</span>
      <span className={`${chipClass()} ${scoreColorClass(curMax)}`}>{curMax || '—'}</span>
      <span className={styles.targetArrow}>→</span>
      <span className={`${chipClass()} ${scoreColorClass(target)}`}>{target}</span>
    </div>
  );
}

/**
 * Shared "review queue" shell — a card list of actions grouped by their owning
 * risk, used by the acceptance review flow. Owns fetch / loading / empty
 * / grouping and all the layout chrome (risk header, action title/meta/desc).
 * The per-item action — the "verb" — is supplied by the caller:
 *
 *   - `fetcher`       async () => action[]   (each action carries risk_* + current_* fields)
 *   - `metaDates`     (action) => string[]   verb-specific meta spans (dates etc.)
 *   - `renderControl` (action, { curMax, reload }) => node   fills the right column
 */
// Where a non-risk action's subject lives, and what to call it.
const SUBJECT_PATH  = { asset: '/assets', system: '/systems', service: '/services', control: '/controls', component: '/components' };
const SUBJECT_LABEL = {
  asset: 'information asset', system: 'system', service: 'business service',
  control: 'control objective', component: 'policy or document', organisation: 'organisation-wide',
};

export function ReviewQueue({
  title,
  countLabel,
  emptyBody,
  intro,
  fetcher,
  metaDates = () => [],
  renderControl,
}) {
  const navigate = useNavigate();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      setActions(await fetcher());
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load queue.');
    } finally {
      setLoading(false);
    }
  }

  // Mount-only: fetcher is a stable reference from the caller.
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const map = new Map();
    for (const a of actions) {
      // A risk action groups under its risk; an action about something else
      // (an asset with an incomplete rating, v133/v134) under its subject.
      const key = a.risk_id || `${a.subject_type}:${a.subject_id ?? ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          subject_type: a.subject_type, subject_id: a.subject_id, subject_name: a.subject_name,
          risk_id: a.risk_id, threat_name: a.threat_name,
          system_id: a.system_id, system_name: a.system_name, department_name: a.department_name,
          current_p_c: a.current_p_c, current_p_i: a.current_p_i, current_p_a: a.current_p_a,
          current_imp_c: a.current_imp_c, current_imp_i: a.current_imp_i, current_imp_a: a.current_imp_a,
          actions: [],
        });
      }
      map.get(key).actions.push(a);
    }
    return [...map.values()];
  }, [actions]);

  function renderAction(a, curMax = 0) {
    return (
      <div key={a.action_id} className={styles.actionRow}>
        <div className={styles.actionLeft}>
          <span className={styles.actionTitle}>{a.action_title}</span>
          <div className={styles.actionMeta}>
            {a.owner_name && <span>Owner: <strong>{a.owner_name}</strong></span>}
            {metaDates(a).map((text, i) => <span key={i}>{text}</span>)}
          </div>
          {a.action_description && <p className={styles.actionDesc}>{a.action_description}</p>}
        </div>
        <div className={styles.actionRight}>
          {renderControl(a, { curMax, reload: load })}
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton fallback="/dashboard" />
          <div className={styles.headingGroup}>
            <h1 className={styles.heading}>{title}</h1>
            {!loading && <span className={styles.headingCount}>{countLabel(actions.length)}</span>}
          </div>
        </div>

        {intro && <p className={styles.intro}>{intro}</p>}

        {loading && <div className={styles.loadingBar} />}
        {!loading && error && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && actions.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Queue is clear</p>
            <p className={styles.emptyBody}>{emptyBody}</p>
          </div>
        )}

        {grouped.map(group => {
          const curMax = scoreMax(
            group.current_p_c, group.current_imp_c,
            group.current_p_i, group.current_imp_i,
            group.current_p_a, group.current_imp_a,
          );
          if (!group.risk_id) {
            const path = SUBJECT_PATH[group.subject_type];
            return (
              <div key={group.key} className={styles.riskGroup}>
                <div className={styles.riskGroupHeader}>
                  {path && group.subject_id ? (
                    <button className={styles.riskLink} onClick={() => navigate(`${path}/${group.subject_id}`)}>
                      {group.subject_name || 'Unnamed'}
                    </button>
                  ) : (
                    <span className={styles.riskThreat}>{group.subject_name || 'The organisation'}</span>
                  )}
                  <span className={styles.riskSep}>·</span>
                  <span className={styles.riskThreat}>{SUBJECT_LABEL[group.subject_type] || group.subject_type}</span>
                </div>
                {group.actions.map(renderAction)}
              </div>
            );
          }
          return (
            <div key={group.key} className={styles.riskGroup}>
              <div className={styles.riskGroupHeader}>
                <button className={styles.riskLink} onClick={() => navigate(`/risks/${group.risk_id}`)}>
                  {group.system_name}
                </button>
                <span className={styles.riskSep}>·</span>
                <span className={styles.riskThreat}>{group.threat_name}</span>
                {group.department_name && <span className={styles.riskDept}>{group.department_name}</span>}
                <span className={`${styles.riskLevel} ${LEVEL_CLASS[scoreLevel(curMax)] || ''}`}>
                  {scoreLevel(curMax)}
                </span>
                {curMax > 0 && (
                  <span className={`${chipClass()} ${scoreColorClass(curMax)} ${styles.curScore}`}>{curMax}</span>
                )}
              </div>

              {group.actions.map(a => renderAction(a, curMax))}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
