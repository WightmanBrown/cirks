// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSystems } from '../api';
import { useAuth } from '../context/AuthContext';
import { byMaxRiskDescThenName } from '../utils/systemSort';
import { scoreLevel } from '../utils/riskColors';
import dashStyles from '../pages/DashboardPage.module.css';
import styles from './WidgetShared.module.css';
import pageStyles from '../pages/SystemsPage.module.css';
import { HelpDot } from './HelpDot';

const RISK_CLASS = {
  critical: styles.riskCritical,
  high:     styles.riskHigh,
  medium:   styles.riskMedium,
  low:      styles.riskLow,
};

const DEPT_SCOPED = new Set(['information_asset_owner', 'information_asset_manager']);

// "Mine" = my department owns it, OR my department actually holds information
// in it (viewer_asset_count, computed per viewer by GET /systems).
//
// It used to be `own dept OR is_shared`, which put every shared system in the
// estate on every IAM's dashboard whether or not their department had anything
// in it — Health saw 19 systems while owning 4 and holding information in 5
// more, so 10 were nothing to do with her. A shared system being AVAILABLE to
// you is not the same as your information being in it; that is the distinction
// the service picker draws between a system bearing your information and one
// you merely depend on.
//
// Exported for test: this rule decides what an IAM sees on login.
export function scopeToRemit(systems, user) {
  if (!DEPT_SCOPED.has(user?.role) || !user?.department_id) return systems;
  return systems.filter(
    s => s.department_id === user.department_id || s.viewer_asset_count > 0,
  );
}

export function SystemsWidget() {
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    getSystems({ mine: true })
      .then(data => { if (!cancelled) setSystems(data); })
      .catch(()   => { if (!cancelled) setError('Could not load systems.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // The full estate remains at /systems — this widget is about the remit.
  const mine = scopeToRemit(systems, user);

  const sorted = [...mine].sort(byMaxRiskDescThenName);

  return (
    <div className={dashStyles.widget}>
      <div className={dashStyles.widgetHeader}>
        <span className={dashStyles.widgetTitle}>Systems in my remit<HelpDot k="widget.my_systems" placement="bottom" label="About Systems in my remit" /></span>
        {!loading && !error && (
          <span className={dashStyles.widgetBadge}>{mine.length}</span>
        )}
      </div>

      {loading && <p className={styles.empty}>Loading…</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && mine.length === 0 && (
        <p className={styles.empty}>
            No systems your department owns or holds information in.
          </p>
      )}

      {!loading && !error && sorted.length > 0 && (
        <div className={styles.list}>
          {sorted.map(s => (
            <div
              key={s.id}
              className={styles.row}
              onClick={() => navigate(`/systems?selected=${s.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/systems?selected=${s.id}`)}
              aria-label={`${s.name} — ${s.max_risk_score != null ? scoreLevel(s.max_risk_score) : 'no risk'}`}
            >
              <span className={styles.name}>
                {s.name}
                {s.is_shared && <span className={pageStyles.sharedBadge}>shared</span>}
              </span>
              {s.max_risk_score != null
                ? <span className={`${styles.riskPill} ${RISK_CLASS[scoreLevel(s.max_risk_score)] ?? ''}`}>
                    {scoreLevel(s.max_risk_score)}
                  </span>
                : <span className={styles.riskNone}>no risk</span>
              }
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className={styles.footer}>
          <button className={styles.link} onClick={() => navigate('/systems')}>
            View all systems →
          </button>
        </div>
      )}
    </div>
  );
}
