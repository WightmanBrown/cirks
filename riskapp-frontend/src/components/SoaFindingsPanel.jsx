// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSoaFindings } from '../api';
import { groupFindings } from '../utils/soaFindings';
import styles from './SoaFindingsPanel.module.css';
import { HelpDot } from './HelpDot';

// Where the Statement of Applicability contradicts what is deployed or linked
// (v130). Derived: a finding goes away when the fact is fixed, so there is no
// "resolve" button — each says which existing act resolves it.
//
// Each finding LINKS to the act that resolves it: saying "change the decision"
// and leaving the reader to find the form is most of the way to saying nothing
// (owner, 2026-09-24). On the objective's own page `onDecide` opens the form in
// place; elsewhere the link carries ?decide=1, which opens it on arrival.
//
// `controlId` narrows it to one objective (the objective page), where it renders
// nothing when there is nothing to say. `refreshKey` re-fetches after an edit.
export default function SoaFindingsPanel({ controlId, refreshKey, findingsData, onDecide, canDecide = true }) {
  const [data, setData] = useState(findingsData ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (findingsData) { setData(findingsData); return; }
    let live = true;
    getSoaFindings(controlId)
      .then(d => { if (live) { setData(d); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [controlId, refreshKey, findingsData]);

  if (failed) return controlId ? null : <p className={styles.note}>Could not load the SoA findings.</p>;
  if (!data) return null;
  const groups = groupFindings(data.findings);
  if (!groups.length) {
    return controlId ? null : (
      <p className={styles.clear}>No findings: what is deployed agrees with the SoA.</p>
    );
  }

  return (
    <section className={styles.panel} aria-label="SoA findings">
      <h2 className={styles.heading}>
        {controlId ? 'This objective contradicts itself' : 'Findings — where the SoA and the register disagree'}
        {controlId
          ? <HelpDot k="soa_findings.objective" placement="bottom" />
          : <HelpDot k="soa_findings.register" placement="bottom" />}
      </h2>
      {groups.map(g => (
        <div key={g.type} className={styles.group}>
          <h3 className={styles.groupTitle}>{g.title} <span className={styles.count}>{g.count}</span></h3>
          <p className={styles.explain}>{g.explain}</p>
          <p className={styles.resolve}><strong>Resolved by:</strong> {g.resolve}</p>
          <ul className={styles.list}>
            {g.controls.map(c => (
              <li key={c.control_id} className={styles.item}>
                {canDecide && (onDecide ? (
                  <button type="button" className={styles.decide} onClick={onDecide}>Change the decision →</button>
                ) : (
                  <Link className={styles.decide} to={`/controls/${c.control_id}?decide=1`}>Change the decision →</Link>
                ))}
                {!controlId && (
                  <Link to={`/controls/${c.control_id}`} className={styles.ctl}>
                    {c.ref && <span className={styles.ref}>{c.ref}</span>} {c.title}
                  </Link>
                )}
                {c.risks_affected > 0 && g.risksLabel(c.risks_affected) && (
                  <span className={styles.risks}>{g.risksLabel(c.risks_affected)}</span>
                )}
                {c.systems.length > 0 && (
                  <span className={styles.systems}>
                    {c.systems.map(s => (
                      <Link key={s.id} to={`/systems/${s.id}`} className={styles.system}
                            title={s.why === 'outside_scope' ? 'Outside every scope it applies in' : 'The objective is not applicable'}>
                        {s.name} <span className={styles.status}>{s.status}</span>
                      </Link>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
