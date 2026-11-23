// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { getQualityQuestion, getReportStandards, getStandardQuestion, getWorkQuestion, getChangesQuestion } from '../api';
import { useUrlState } from '../hooks/useUrlState';
import { QuestionPage, QuestionTabs } from '../components/QuestionPage';
import { CompletenessRing } from '../components/CompletenessRing';
import { QualityQuestion } from '../components/QualityQuestion';
import { StandardQuestion } from '../components/StandardQuestion';
import { WorkQuestion } from '../components/WorkQuestion';
import { ChangesQuestion } from '../components/ChangesQuestion';
import styles from './BoardSummaryPage.module.css';
import own from './CoverageQuestionPage.module.css';

// The remaining question pages (docs/insights-drilldown.md step 3): control
// quality, meeting a standard, work in progress, what changed. Each is the
// QuestionPage frame around its part; the view lives in the address.

const pick = (value, tabs, fallback) => (tabs.some(([k]) => k === value) ? value : fallback);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function QualityQuestionPage() {
  const TABS = [['objective', 'By control objective'], ['owner', 'Who rates them']];
  const BANDS = [['', 'Every rating'], ['weak', 'Weak'], ['not_rated', 'Not rated'], ['adequate', 'Adequate'], ['strong', 'Strong']];
  const [by, setBy] = useUrlState('by', 'objective');
  const [band, setBand] = useUrlState('band', '');
  const tab = pick(by, TABS, 'objective');
  return (
    <QuestionPage title="Control quality" helpKey="quality.title" byDepartment={false} feature="see control quality"
      intro="How well each applicable control objective is judged to work, weak and not rated first, with the high risks leaning on it."
      load={() => getQualityQuestion()}>
      {(r) => <>
        <div className={own.top}>
          <CompletenessRing size={88} complete={r.totals.strong} partial={r.totals.adequate} missing={r.totals.weak + r.totals.not_rated}
            labels={{ complete: 'strong', partial: 'adequate', missing: 'weak or not rated' }} of="applicable control objectives" />
          <div className={own.controls}>
            <QuestionTabs tabs={TABS} value={tab} onChange={setBy} />
            {tab === 'objective' && (
              <div className={own.tabs} role="group" aria-label="Rating">
                {BANDS.map(([k, label]) => (
                  <button key={k || 'all'} type="button" aria-pressed={band === k} className={band === k ? own.on : own.off} onClick={() => setBand(k)}>
                    {label}{k ? ` (${r.totals[k]})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <QualityQuestion data={r} by={tab} band={band} />
      </>}
    </QuestionPage>
  );
}

export function StandardQuestionPage() {
  const TABS = [['requirement', 'Requirements not met'], ['objective', 'Objectives falling short']];
  const [by, setBy] = useUrlState('by', 'requirement');
  const [code, setCode] = useUrlState('standard', '');
  const [standards, setStandards] = useState(null);
  const tab = pick(by, TABS, 'requirement');
  useEffect(() => { getReportStandards().then((d) => setStandards(d.standards)).catch(() => setStandards([])); }, []);
  const chosen = code || standards?.[0]?.code || '';
  return (
    <QuestionPage title={(r) => (r?.name && !r.none ? `Meeting the ${r.name} standard` : 'Meeting a standard')} helpKey="standard.title" byDepartment={false} feature="see how a standard is met"
      intro="Which requirements of a standard are not met, and the control objectives holding each back. A requirement is met only when every objective mapped to it is in place."
      load={() => (chosen ? getStandardQuestion(chosen) : Promise.resolve({ loaded: false, name: 'No standard', none: true }))}
      reload={[chosen]}>
      {(r) => r.none ? <p className={styles.note}>No standard is switched on with its requirements loaded.</p> : <>
        <div className={own.top}>
          <CompletenessRing size={88} complete={r.totals.covered} partial={r.totals.partial} missing={r.totals.gap}
            labels={{ complete: 'met', partial: 'partly met', missing: 'not met' }} of={`${r.name} requirements`} />
          <div className={own.controls}>
            {standards?.length > 1 && (
              <label className={own.picker}>
                <span>Standard</span>
                <select value={chosen} onChange={(e) => setCode(e.target.value)}>
                  {standards.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              </label>
            )}
            <QuestionTabs tabs={TABS} value={tab} onChange={setBy} />
            {r.totals.excluded > 0 && <p className={styles.note}>{plural(r.totals.excluded, 'requirement')} excluded, with a reason recorded in the Statement of Applicability.</p>}
          </div>
        </div>
        <StandardQuestion data={r} by={tab} />
      </>}
    </QuestionPage>
  );
}

export function WorkQuestionPage() {
  const TABS = [['action', 'The actions'], ['person', 'Who holds the work']];
  const [by, setBy] = useUrlState('by', 'action');
  const tab = pick(by, TABS, 'action');
  return (
    <QuestionPage title="Work in progress" helpKey="work.title" feature="see the security work in progress"
      intro="The security actions in hand: what is overdue, who holds the items, and the risk points each will remove."
      load={(dept) => getWorkQuestion(dept)}>
      {(r) => <>
        <div className={own.top}>
          <p className={styles.note}>
            {plural(r.totals.actions, 'action')} in hand ({r.totals.awaiting_acceptance} awaiting acceptance), {r.totals.overdue} overdue;
            {' '}{plural(r.totals.open_items, 'item')} open; {r.totals.points} risk points to remove.
          </p>
          <div className={own.controls}><QuestionTabs tabs={TABS} value={tab} onChange={setBy} /></div>
        </div>
        <WorkQuestion data={r} by={tab} />
      </>}
    </QuestionPage>
  );
}

export function ChangesQuestionPage() {
  const TABS = [['change', 'Each change'], ['cause', 'By cause']];
  const PERIODS = [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']];
  const [by, setBy] = useUrlState('by', 'change');
  const [days, setDays] = useUrlState('days', '90');
  const [direction, setDirection] = useUrlState('direction', '');
  const tab = pick(by, TABS, 'change');
  const period = pick(days, PERIODS, '90');
  return (
    <QuestionPage title="What changed" helpKey="changes.title" feature="see what changed"
      intro="Every change to a risk score in the period, and the event that moved it."
      load={(dept) => getChangesQuestion(dept, period)} reload={[period]}>
      {(r) => <>
        <div className={own.top}>
          <p className={styles.note}>
            {plural(r.totals.changes, 'change')} in the last {r.days} days: {r.totals.down} down, {r.totals.up} up; {r.totals.points} risk points removed overall.
          </p>
          <div className={own.controls}>
            <QuestionTabs tabs={TABS} value={tab} onChange={setBy} />
            <div className={own.tabs} role="group" aria-label="Period">
              {PERIODS.map(([k, label]) => (
                <button key={k} type="button" aria-pressed={period === k} className={period === k ? own.on : own.off} onClick={() => setDays(k)}>{label}</button>
              ))}
            </div>
            {tab === 'change' && (
              <div className={own.tabs} role="group" aria-label="Direction">
                {[['', 'Both'], ['down', 'Down'], ['up', 'Up']].map(([k, label]) => (
                  <button key={k || 'both'} type="button" aria-pressed={direction === k} className={direction === k ? own.on : own.off} onClick={() => setDirection(k)}>{label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <ChangesQuestion data={r} by={tab} direction={direction} />
      </>}
    </QuestionPage>
  );
}
