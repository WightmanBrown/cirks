// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBusinessServices } from '../api';
import { useAuth } from '../context/AuthContext';
import { byMaxRiskThenMeanEffectiveCiaThenName } from '../utils/serviceSort';
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

export function ServicesWidget() {
  // "My" is an OWNERSHIP question, not a permission one. With department
  // isolation off the services endpoint returns every service in the org — the
  // right answer to "what may I see", the wrong one for a widget titled "My
  // Business Services", which showed 90 to an IAO whose department owns 7.
  //
  // `for_dept` routes the request to the server's own_dept branch, which is
  // owned OR ADOPTED — a rule the client cannot reproduce, because the
  // cross-department branch reports `adopted: false` for every row.
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getBusinessServices({ for_dept: user?.department_id })
      .then(data => { if (!cancelled) setServices(data); })
      .catch(()   => { if (!cancelled) setError('Could not load services.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.department_id]);

  const top5 = [...services].sort(byMaxRiskThenMeanEffectiveCiaThenName).slice(0, 5);

  return (
    <div className={dashStyles.widget}>
      <div className={dashStyles.widgetHeader}>
        <span className={dashStyles.widgetTitle}>My Business Services<HelpDot k="widget.my_services" placement="bottom" label="About My Business Services" /></span>
        {!loading && !error && (
          <span className={dashStyles.widgetBadge}>{services.length}</span>
        )}
      </div>

      {loading && <p className={styles.empty}>Loading…</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && top5.length === 0 && (
        <p className={styles.empty}>No business services in your department.</p>
      )}

      {!loading && !error && top5.length > 0 && (
        <div className={styles.list}>
          {top5.map(s => (
            <div
              key={s.id}
              className={styles.row}
              onClick={() => navigate(`/services?selected=${s.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/services?selected=${s.id}`)}
              aria-label={s.name}
            >
              <span className={styles.name}>{s.name}</span>
              {s.max_risk_score != null
                ? <span className={`${styles.riskPill} ${RISK_CLASS[scoreLevel(s.max_risk_score)] ?? ''}`}>
                    {scoreLevel(s.max_risk_score)}
                  </span>
                : <span className={styles.riskNone}>no risk</span>}
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className={styles.footer}>
          <button className={styles.link} onClick={() => navigate('/services')}>
            View all services →
          </button>
        </div>
      )}
    </div>
  );
}
