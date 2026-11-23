// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { getCoverage, getDepartments } from '../api';
import { useAuth } from '../context/AuthContext';
import { useUrlState } from '../hooks/useUrlState';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import { CoverageQuestion } from '../components/CoverageQuestion';
import styles from './BoardSummaryPage.module.css';
import own from './CoverageQuestionPage.module.css';

// Control coverage on systems: the question page behind the board's ring
// (docs/insights-drilldown.md step 3). Which objectives, systems and
// departments are best and worst covered, and which degraded controls to fix
// first. The reader's scope decides what is counted (an IAO or IAM sees their
// own department); the tab and any department chosen live in the address, so
// Back returns to the same view.

const TABS = [
  ['objective', 'By control objective'],
  ['system', 'By system'],
  ['department', 'By department'],
  ['degraded', 'Degraded'],
];

export function CoverageQuestionPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read') || hasCapability('reports.department');
  const [by, setBy] = useUrlState('by', 'objective');
  const [dept, setDept] = useUrlState('dept', '');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [departments, setDepartments] = useState([]);
  const tab = TABS.some(([k]) => k === by) ? by : 'objective';

  useEffect(() => {
    if (!allowed) return;
    setR(null); setError(null);
    getCoverage(dept || null).then(setR).catch((err) => setError(err.response?.data?.error || 'The answer could not be produced.'));
  }, [allowed, dept]);
  useEffect(() => {
    if (r?.can_choose && !departments.length) getDepartments().then((d) => setDepartments(d.departments || d)).catch(() => {});
  }, [r, departments.length]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature="see control coverage on systems" /></Shell>;
  const deptName = dept && departments.find((d) => d.id === dept)?.name;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Control coverage on systems <HelpDot k="coverage.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              Which control objectives are in place on the systems that need them, and where they are not.
              {r && (r.department_id ? <> Counting {deptName || 'one department'}&rsquo;s systems.</> : <> Counting every system.</>)}
            </p>
          </div>
          {r?.can_choose && (
            <label className={own.picker}>
              <span>Department</span>
              <select value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">Every department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {!r && !error && <p className={styles.note}>Working it out…</p>}
        {r && (
          <section className={styles.panel}>
            <div className={own.top}>
              <CompletenessRing size={88}
                complete={r.totals.operational} partial={r.totals.degraded} missing={r.totals.missing}
                labels={{ complete: 'in place', partial: 'degraded', missing: 'not in place' }} of="control objectives on systems" />
              <div className={own.tabs} role="tablist" aria-label="Answer by">
                {TABS.map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k}
                    className={tab === k ? own.on : own.off} onClick={() => setBy(k)}>{label}</button>
                ))}
              </div>
            </div>
            <CoverageQuestion data={r} by={tab} deptLink={(id) => `/reporting/coverage?by=system&dept=${id}`} />
          </section>
        )}
      </div>
    </Shell>
  );
}
