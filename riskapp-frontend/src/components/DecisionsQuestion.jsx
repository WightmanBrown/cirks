// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { SortableTh } from './SortableTh';
import { RiskAnswerRow, RiskOpener, useRiskUnfold } from './RiskAnswer';
import { Score } from './ExposureQuestion';
import { useTableSort } from '../hooks/useTableSort';
import styles from './CoverageQuestion.module.css';

// Awaiting decision, answered (docs/insights-drilldown.md step 3), from
// GET /reports/decisions: risks at or above the action threshold still waiting
// for a decision — who must decide the next step and how long it has waited —
// each unfolding its risk answer, decision first; or the departments with most
// waiting; or acceptances expired or running out. Every column sorts.
// `by`: 'who' | 'department' | 'expiring'. `stage` narrows 'who' to one step.

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const waited = (n) => (n == null ? '—' : n === 0 ? 'today' : plural(n, 'day'));

function Owed({ rows: given, ownerMax, limit }) {
  const [openId, toggle] = useRiskUnfold();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    risk: (r) => `${r.system_name} ${r.threat_name}`, score: (r) => r.score, who: (r) => r.who, waiting: (r) => r.waiting_days,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  const rows = sorted.slice(0, limit);
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh column="risk" {...sort} helpKey="decisions.col.risk">Risk</SortableTh>
            <SortableTh column="score" {...sort} className={styles.num} helpKey="decisions.col.score">Score</SortableTh>
            <SortableTh column="who" {...sort} helpKey="decisions.col.who">Who must decide</SortableTh>
            <SortableTh column="waiting" {...sort} className={styles.num} helpKey="decisions.col.waiting">Waiting</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.risk_id}>
              <tr>
                <td>
                  <RiskOpener open={openId === r.risk_id} onToggle={() => toggle(r.risk_id)}>{r.system_name} — {r.threat_name}</RiskOpener>
                  {r.department_name && <span className={styles.sub}>{r.department_name}</span>}
                </td>
                <td className={styles.num}><Score value={r.score} /></td>
                <td>{r.who}: {r.act}{r.above_owner_max && <span className={styles.sub}>Above {ownerMax}: beyond the risk owner’s authority to accept</span>}</td>
                <td className={styles.num}>{waited(r.waiting_days)}</td>
              </tr>
              {openId === r.risk_id && <RiskAnswerRow colSpan={4} riskId={r.risk_id} lead="decision" />}
            </Fragment>
          ))}
        </tbody>
      </table>
      {given.length > rows.length && <p className={styles.note}>The first {rows.length} of {given.length}. Narrow by department to see the rest.</p>}
    </>
  );
}

function Departments({ rows: given, deptLink }) {
  const { sorted: rows, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    name: (d) => d.name, count: (d) => d.count, longest: (d) => d.longest_days,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortableTh column="name" {...sort} helpKey="decisions.col.department">Department</SortableTh>
          <SortableTh column="count" {...sort} className={styles.num} helpKey="decisions.col.count">Waiting</SortableTh>
          <SortableTh column="longest" {...sort} className={styles.num} helpKey="decisions.col.longest">Longest</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.department_id || 'none'}>
            <td>{d.department_id ? <Link to={deptLink(d.department_id)}>{d.name}</Link> : d.name}</td>
            <td className={styles.num}>{d.count}</td>
            <td className={styles.num}>{waited(d.longest_days)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Expiring({ rows: given }) {
  const { sorted: rows, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    risk: (e) => `${e.system_name} ${e.threat_name}`, score: (e) => e.score, by: (e) => e.accepted_by, expires: (e) => e.days_left,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortableTh column="risk" {...sort} helpKey="decisions.col.risk">Risk</SortableTh>
          <SortableTh column="score" {...sort} className={styles.num} helpKey="decisions.col.score">Score</SortableTh>
          <SortableTh column="by" {...sort} helpKey="decisions.col.accepted_by">Accepted by</SortableTh>
          <SortableTh column="expires" {...sort} className={styles.num} helpKey="decisions.col.expires">Runs out</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.exception_id}>
            <td><Link to={`/risks/${e.risk_id}#decision`}>{e.system_name} — {e.threat_name}</Link>{e.department_name && <span className={styles.sub}>{e.department_name}</span>}</td>
            <td className={styles.num}><Score value={e.score} /></td>
            <td>{e.accepted_by || '—'}<span className={styles.sub}>to renew or end: {e.who}</span></td>
            <td className={styles.num}>{day(e.expires_at)}<span className={styles.sub}>{e.days_left < 0 ? `expired ${plural(-e.days_left, 'day')} ago` : `in ${plural(e.days_left, 'day')}`}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DecisionsQuestion({ data, by, stage = '', deptLink = (id) => `?dept=${id}`, limit = 50 }) {
  if (by === 'department') {
    if (!data.by_department.length) return <p className={styles.note}>No decision is waiting.</p>;
    return <div className={styles.side}><Departments rows={data.by_department} deptLink={deptLink} /></div>;
  }
  if (by === 'expiring') {
    if (!data.acceptances.length) return <p className={styles.note}>No exception has expired with its risk open, and none runs out in the next {data.expiring_within_days} days.</p>;
    return <div className={styles.side}><Expiring rows={data.acceptances} /></div>;
  }
  const all = stage ? data.owed.filter((x) => x.stage === stage) : data.owed;
  if (!all.length) return <p className={styles.note}>No decision is waiting{stage ? ' at this stage' : ''}.</p>;
  return <div className={styles.side}><Owed rows={all} ownerMax={data.thresholds.owner_max} limit={limit} /></div>;
}
