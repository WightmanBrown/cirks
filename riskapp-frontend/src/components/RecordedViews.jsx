// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { getDecisionViews } from '../api';
import { HelpDot } from './HelpDot';
import styles from './RecordedViews.module.css';

// The views the department's IAO or IAM recorded on decisions about this risk
// (v173, docs/reporting-iam.md decision 5): dated, signed, never changing the
// decision, never edited or removed. Recorded from the system report's decision
// record; shown here so they travel with the risk. Renders nothing when none.
const KIND = { validated: 'the validation', minuted: 'a minuted decision', accepted: 'the acceptance', action_accepted: 'an accepted action' };
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function RecordedViews({ riskId }) {
  const [views, setViews] = useState([]);
  useEffect(() => {
    let live = true;
    getDecisionViews(riskId).then((d) => { if (live) setViews(d.views || []); }).catch(() => {});
    return () => { live = false; };
  }, [riskId]);
  if (!views.length) return null;
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Recorded views on decisions <HelpDot k="risk.recorded_views" placement="bottom" /></h2>
      <ul className={styles.list}>
        {views.map((v) => (
          <li key={v.id}>
            <span className={styles.meta}>{day(v.written_at)} · {v.written_by_name} ({v.written_role.replace(/_/g, ' ')}) · on {KIND[v.decision_kind]}</span>
            <span>{v.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
