// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { getDepartments } from '../api';
import { useAuth } from '../context/AuthContext';
import { useUrlState } from '../hooks/useUrlState';
import { Shell } from './Shell';
import { BackButton } from './BackButton';
import { HelpDot } from './HelpDot';
import { CapabilityGate } from './CapabilityGate';
import styles from '../pages/BoardSummaryPage.module.css';
import own from '../pages/CoverageQuestionPage.module.css';

// The frame of a question page (docs/insights-drilldown.md step 3): title,
// what it answers, the department picker for a reader who may choose (the API
// says so with `can_choose`), loading and errors. The page supplies `load`
// (department id or null → the answer) and renders the answer as children.
// `byDepartment` false for a question that is organisation-wide only.
// `reload` lists anything else in the address the answer depends on. `title`
// may be a function of the answer (null while loading).

export function QuestionPage({ title, helpKey, intro, feature, load, byDepartment = true, reload = [], children }) {
  const { hasCapability } = useAuth();
  const allowed = hasCapability('reports.read') || (byDepartment && hasCapability('reports.department'));
  const [dept, setDept] = useUrlState('dept', '');
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    if (!allowed) return;
    setR(null); setError(null);
    load(byDepartment ? dept || null : null).then(setR)
      .catch((err) => setError(err.response?.data?.error || 'The answer could not be produced.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the address changes, not when `load` is re-created
  }, [allowed, dept, ...reload]);
  useEffect(() => {
    if (r?.can_choose && !departments.length) getDepartments().then((d) => setDepartments(d.departments || d)).catch(() => {});
  }, [r, departments.length]);

  if (!allowed) return <Shell><CapabilityGate capability="reports.read" feature={feature} /></Shell>;
  const deptName = dept && departments.find((d) => d.id === dept)?.name;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{typeof title === 'function' ? title(r) : title} <HelpDot k={helpKey} placement="bottom" /></h1>
            <p className={styles.desc}>
              {intro}
              {r && byDepartment && (r.department_id ? <> {deptName || 'One department'}&rsquo;s.</> : <> Every department.</>)}
            </p>
          </div>
          {r?.can_choose && byDepartment && (
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
        {r && <section className={styles.panel}>{children(r)}</section>}
      </div>
    </Shell>
  );
}

// The page's tabs, kept in the address as ?by=.
export function QuestionTabs({ tabs, value, onChange }) {
  return (
    <div className={own.tabs} role="tablist" aria-label="Answer by">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k}
          className={value === k ? own.on : own.off} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}
