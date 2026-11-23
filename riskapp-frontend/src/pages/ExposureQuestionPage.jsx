// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { getExposure, getDepartments } from '../api';
import { useAuth } from '../context/AuthContext';
import { useUrlState } from '../hooks/useUrlState';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import { RiskGrid } from '../components/RiskGrid';
import { ExposureQuestion } from '../components/ExposureQuestion';
import styles from './BoardSummaryPage.module.css';
import own from './CoverageQuestionPage.module.css';

// Where the risk sits: the question page behind the board's heat maps and the
// SIRO's exposure (docs/insights-drilldown.md step 3). Which departments carry
// the most, which systems concentrate it, which threats recur, which risks sit
// in a square. Choosing a square narrows to it; the scope follows the reader
// (an IAO or IAM sees their own department). Everything lives in the address.

const TABS = [
  ['department', 'By department'],
  ['system', 'By system'],
  ['threat', 'By threat'],
  ['risks', 'The risks'],
];

export function ExposureQuestionPage() {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read') || hasCapability('reports.department');
  const [by, setBy] = useUrlState('by', 'department');
  const [dept, setDept] = useUrlState('dept', '');
  const [cell, setCell] = useUrlState('cell', '');
  const [min, setMin] = useUrlState('min', '');
  const [only, setOnly] = useUrlState('only', '');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [departments, setDepartments] = useState([]);
  const tab = TABS.some(([k]) => k === by) ? by : 'department';
  const [ci, cl] = cell.split(',').map(Number);
  const square = ci && cl ? { impact: ci, likelihood: cl } : null;

  useEffect(() => {
    if (!allowed) return;
    setR(null); setError(null);
    getExposure({ departmentId: dept || null, cell: cell || null, min: min || null, only: only || null }).then(setR)
      .catch((err) => setError(err.response?.data?.error || 'The answer could not be produced.'));
  }, [allowed, dept, cell, min, only]);
  useEffect(() => {
    if (r?.can_choose && !departments.length) getDepartments().then((d) => setDepartments(d.departments || d)).catch(() => {});
  }, [r, departments.length]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature="see where the risk sits" /></Shell>;
  const deptName = dept && departments.find((d) => d.id === dept)?.name;
  const action = r?.thresholds.action;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Where the risk sits <HelpDot k="exposure.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              Which departments, systems and threats carry the most risk, and what committed work will move.
              {r && <> {r.department_id ? `${deptName || 'One department'}’s risks` : 'Every department’s risks'}
                {square ? `, in the square impact ${square.impact} × likelihood ${square.likelihood}` : ''}
                {min ? `, scoring ${min} or higher` : ''}
                {only ? ', with a treatment decided but no security action' : ''}: {r.total}.</>}
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
              <RiskGrid size="small" label="Choose a square to narrow to it" helpKey="exposure.grid"
                countAt={(i, p) => r.grid[i - 1][p - 1]} selected={square}
                onCellClick={(p, i) => setCell(square && square.impact === i && square.likelihood === p ? '' : `${i},${p}`)} />
              <div className={own.controls}>
                <div className={own.tabs} role="tablist" aria-label="Answer by">
                  {TABS.map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k}
                      className={tab === k ? own.on : own.off} onClick={() => setBy(k)}>{label}</button>
                  ))}
                </div>
                <div className={own.tabs}>
                  <button type="button" aria-pressed={!!min} className={min ? own.on : own.off}
                    onClick={() => setMin(min ? '' : String(action))}>Only scoring {action} or higher</button>
                  {square && <button type="button" className={own.off} onClick={() => setCell('')}>Clear the square</button>}
                  {only && <button type="button" className={own.on} aria-pressed onClick={() => setOnly('')}>Treatment decided, no security action ✕</button>}
                </div>
                <p className={styles.note}>
                  {r.at_or_above_action} of {r.total} score {action} or higher; committed work lowers {r.with_target}.
                </p>
              </div>
            </div>
            <ExposureQuestion data={r} by={tab} deptLink={(id) => `/reporting/exposure?by=system&dept=${id}${min ? `&min=${min}` : ''}`} />
          </section>
        )}
      </div>
    </Shell>
  );
}
