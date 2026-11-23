// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { getDecisionsOwed, getDepartments } from '../api';
import { useAuth } from '../context/AuthContext';
import { useUrlState } from '../hooks/useUrlState';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { CompletenessRing } from '../components/CompletenessRing';
import { DecisionsQuestion } from '../components/DecisionsQuestion';
import styles from './BoardSummaryPage.module.css';
import own from './CoverageQuestionPage.module.css';

// Awaiting decision (was "Decisions owed" until the tester's review,
// 2026-11-16): the question page behind the board's "is every risk scoring
// 12 or higher answered?", the SIRO's decisions and the CISO's agreement
// (docs/insights-drilldown.md step 3). Who owes each decision and how long it
// has waited; which departments have most waiting; which acceptances run out.
// The scope follows the reader; the view lives in the address.

// What each stage is waiting for, as a button says it.
const STAGE_LABEL = {
  validate: 'Awaiting validation',
  correct: 'Returned to the analyst',
  treat: 'Awaiting a treatment decision',
  agree: 'Awaiting agreement',
};

const TABS = [
  ['who', 'Who must decide'],
  ['department', 'By department'],
  ['expiring', 'Exceptions expired or running out'],
];

export function DecisionsQuestionPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read') || hasCapability('reports.department');
  const [by, setBy] = useUrlState('by', 'who');
  const [stage, setStage] = useUrlState('stage', '');
  const [dept, setDept] = useUrlState('dept', '');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [departments, setDepartments] = useState([]);
  const tab = TABS.some(([k]) => k === by) ? by : 'who';

  useEffect(() => {
    if (!allowed) return;
    setR(null); setError(null);
    getDecisionsOwed(dept || null).then(setR).catch((err) => setError(err.response?.data?.error || 'The answer could not be produced.'));
  }, [allowed, dept]);
  useEffect(() => {
    if (r?.can_choose && !departments.length) getDepartments().then((d) => setDepartments(d.departments || d)).catch(() => {});
  }, [r, departments.length]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature="see the risks awaiting decision" /></Shell>;
  const deptName = dept && departments.find((d) => d.id === dept)?.name;
  const action = r?.thresholds.action;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Risks awaiting decision <HelpDot k="decisions.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              Risks scoring {action ?? 'at or above the action threshold'}{action ? ' or higher' : ''} that still need a decision: who must take the next step, and how long it has waited.
              {r && <> {r.department_id ? `${deptName || 'One department'}’s risks.` : 'Every department’s risks.'}</>}
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
              <CompletenessRing size={88} complete={r.answered} partial={0} missing={r.owed.length}
                labels={{ complete: 'agreed by the business', partial: '', missing: 'awaiting decision' }}
                of={`risks scoring ${action} or higher`} />
              <div className={own.controls}>
                <div className={own.tabs} role="tablist" aria-label="Answer by">
                  {TABS.map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k}
                      className={tab === k ? own.on : own.off} onClick={() => setBy(k)}>{label}</button>
                  ))}
                </div>
                {tab === 'who' && (
                  <div className={own.tabs} role="group" aria-label="The step waiting">
                    <button type="button" aria-pressed={!stage} className={!stage ? own.on : own.off} onClick={() => setStage('')}>All awaiting decision ({r.owed.length})</button>
                    {r.by_stage.filter((s) => s.count).map((s) => (
                      <button key={s.stage} type="button" aria-pressed={stage === s.stage} className={stage === s.stage ? own.on : own.off}
                        onClick={() => setStage(s.stage)}>{STAGE_LABEL[s.stage]} ({s.count})</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DecisionsQuestion data={r} by={tab} stage={stage} deptLink={(id) => `/reporting/decisions?dept=${id}`} />
          </section>
        )}
      </div>
    </Shell>
  );
}
