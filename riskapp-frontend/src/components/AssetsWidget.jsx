// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAssets } from '../api';
import { useAuth } from '../context/AuthContext';
import { byMaxRiskThenMeanCiaThenName } from '../utils/assetSort';
import { scoreLevel } from '../utils/riskColors';
import dashStyles from '../pages/DashboardPage.module.css';
import styles from './WidgetShared.module.css';
import { HelpDot } from './HelpDot';

const RISK_CLASS = {
  critical: styles.riskCritical,
  high:     styles.riskHigh,
  medium:   styles.riskMedium,
  low:      styles.riskLow,
};

const DEPT_SCOPED = new Set(['information_asset_owner', 'information_asset_manager']);

export function AssetsWidget() {
  const [assets,  setAssets]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    getAssets({ mine: true })
      .then(data => { if (!cancelled) setAssets(data); })
      .catch(()   => { if (!cancelled) setError('Could not load assets.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Restrict to own dept + shared for IAO/IAM (matches the backend assets read).
  const mine = DEPT_SCOPED.has(user?.role) && user?.department_id
    ? assets.filter(a => a.department_id === user.department_id || a.is_shared)
    : assets;

  const top5 = [...mine].sort(byMaxRiskThenMeanCiaThenName).slice(0, 5);

  return (
    <div className={dashStyles.widget}>
      <div className={dashStyles.widgetHeader}>
        <span className={dashStyles.widgetTitle}>My Information Assets<HelpDot k="widget.my_assets" placement="bottom" label="About My Information Assets" /></span>
        {!loading && !error && (
          <span className={dashStyles.widgetBadge}>{mine.length}</span>
        )}
      </div>

      {loading && <p className={styles.empty}>Loading…</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && mine.length === 0 && (
        <p className={styles.empty}>No information assets registered.</p>
      )}

      {!loading && !error && top5.length > 0 && (
        <div className={styles.list}>
          {top5.map(a => (
            <div
              key={a.id}
              className={styles.row}
              onClick={() => navigate(`/assets?selected=${a.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/assets?selected=${a.id}`)}
              aria-label={a.name}
            >
              <span className={styles.name}>{a.name}</span>
              {a.max_risk_score != null
                ? <span className={`${styles.riskPill} ${RISK_CLASS[scoreLevel(a.max_risk_score)] ?? ''}`}>
                    {scoreLevel(a.max_risk_score)}
                  </span>
                : <span className={styles.riskNone}>no risk</span>}
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className={styles.footer}>
          <button className={styles.link} onClick={() => navigate('/assets')}>
            View all assets →
          </button>
        </div>
      )}
    </div>
  );
}
