// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

import { Link } from 'react-router-dom';
import { DeliveryChip } from './DeliveryChip';
import { PatternChip } from './PatternChip';
import { deliveryLabel } from '../utils/deliveryPatterns';
import styles from './ControlDeployments.module.css';

// Where a control is, and WHY it is there (v131).
//
// The page listed the systems in one place and the threats in another and never
// joined them, so "why is this on Flight operations system?" had no answer — and
// the stored one is no answer either: `system_controls.provenance` says
// 'recorded' on all 823 rows and nothing writes anything else.
//
// The real answer is derivable. A control reaches a risk through
// `system_controls ∩ control_threats`, so the threats it counters that are also
// live on that system are exactly why it belongs there. Where there are none, it
// is a baseline deployment: good practice treating no identified threat, which is
// a different and legitimate reason — and saying so distinguishes the two
// workflows the SoA notes describe.

// One list answers both questions about each system (owner, 2026-10-06): how
// the objective is delivered there (the security solution in place and its
// state, v145) and why it is there at all. They were two panels listing the same
// systems.

const VIA_LABEL = { organisation: 'organisation-wide', group: 'for a group' };

export default function ControlDeployments({ deployments = [], deliveryBySystem = [], isExpert = true }) {
  if (!deployments.length) return null;
  const delivery = new Map(deliveryBySystem.map(d => [d.system_id, d]));

  // The ones doing work first: most risks, then worst risk, then name.
  const rows = [...deployments].sort((a, b) =>
    b.risks.length - a.risks.length
    || (b.risks[0]?.score ?? 0) - (a.risks[0]?.score ?? 0)
    || a.system_name.localeCompare(b.system_name));
  const treating = rows.filter(r => r.reason === 'risk').length;

  return (
    <section className={styles.panel} aria-label="Where this control is, and why">
      <p className={styles.summary}>
        On {rows.length} system{rows.length === 1 ? '' : 's'}
        {treating > 0
          ? ` — treating identified risks on ${treating}${treating === rows.length ? '' : `, baseline on the other ${rows.length - treating}`}.`
          : ' — none of them carrying a threat it counters, so every one is a baseline deployment.'}
      </p>
      <ul className={styles.list}>
        {rows.map(d => (
          <li key={d.system_id} className={styles.row}>
            <div className={styles.head}>
              <Link to={`/systems/${d.system_id}`} className={styles.system}>{d.system_name}</Link>
              {d.department_name && <span className={styles.dept}>{d.department_name}</span>}
              <span className={`${styles.status} ${styles[d.status] || ''}`}>{d.status.replace('_', ' ')}</span>
              {d.via !== 'deployed' && <span className={styles.via}>{VIA_LABEL[d.via] || d.via}</span>}
            </div>

            {delivery.get(d.system_id) && (() => {
              const v = delivery.get(d.system_id);
              const inPlace = v.pattern_name && v.delivery !== 'no_pattern_in_place';
              return (
                <p className={styles.delivery}>
                  <DeliveryChip delivery={v.delivery} title={deliveryLabel(v.delivery)} />
                  {inPlace && <span><PatternChip kind="solution" iconOnly /> {v.pattern_name}</span>}
                  {inPlace && v.missing_parts?.length > 0 && <span>Missing: {v.missing_parts.join(', ')}</span>}
                  {v.degraded_parts?.length > 0 && <span>Degraded: {v.degraded_parts.join(', ')}</span>}
                  {v.disagreement && <span className={styles.warn}>{v.disagreement}</span>}
                </p>
              );
            })()}

            {d.status === 'not_applicable' ? (
              <p className={styles.why}>Excluded here: {d.exclusion_reason}</p>
            ) : d.reason === 'risk' ? (
              <p className={styles.why}>
                Here because this system carries {d.threats.map(t => t.name).join(', ')}
                {d.risks.length > 0 && (
                  <>
                    {' — '}
                    {d.risks.length} assessed risk{d.risks.length === 1 ? '' : 's'}
                    {isExpert && d.risks[0] && (
                      <span className={styles.detail}>
                        {' '}(worst {d.risks[0].probability}, score {d.risks[0].score}
                        {d.risks[0].judged
                          ? `; this control judged at ${d.risks[0].judged}`
                          : '; nobody has judged what this control achieves here'})
                      </span>
                    )}
                  </>
                )}
                {d.risks.length === 0 && ' — identified, not yet assessed'}
              </p>
            ) : (
              <p className={styles.whyBaseline}>
                Baseline: it counters no threat identified on this system, so no risk depends on it here.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
