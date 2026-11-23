// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Fragment } from 'react';
import { SortableTh } from './SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { RiskAnswerRow, RiskOpener, useRiskUnfold } from './RiskAnswer';
import { Score } from './ExposureQuestion';
import styles from './CoverageQuestion.module.css';

// What changed, answered (docs/insights-drilldown.md step 3), from
// GET /reports/changes: every change to a risk score in the period, newest
// first, each unfolding its risk answer; or the changes grouped by what caused
// them. `by`: 'change' | 'cause'. `direction` narrows to 'down' or 'up'.

const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Causes({ rows: given }) {
  const { sorted: rows, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    cause: (g) => g.why, down: (g) => g.down, up: (g) => g.up, points: (g) => g.points,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortableTh column="cause" {...sort} helpKey="changes.col.cause">What caused it</SortableTh>
          <SortableTh column="down" {...sort} className={styles.num} helpKey="changes.col.down">Down</SortableTh>
          <SortableTh column="up" {...sort} className={styles.num} helpKey="changes.col.up">Up</SortableTh>
          <SortableTh column="points" {...sort} className={styles.num} helpKey="changes.col.points">Points removed</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.source}>
            <td>{g.why}</td>
            <td className={styles.num}>{g.down}</td>
            <td className={styles.num}>{g.up}</td>
            <td className={styles.num}>{g.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Changes({ rows: given, limit }) {
  const [openId, toggle] = useRiskUnfold();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    when: (c) => new Date(c.changed_at).getTime(), risk: (c) => `${c.system_name} ${c.threat_name}`,
    score: (c) => c.after - (c.before ?? c.after), why: (c) => c.why,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  const rows = sorted.slice(0, limit);
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh column="when" {...sort} helpKey="changes.col.when">When</SortableTh>
            <SortableTh column="risk" {...sort} helpKey="changes.col.risk">Risk</SortableTh>
            <SortableTh column="score" {...sort} className={styles.num} helpKey="changes.col.score">Score</SortableTh>
            <SortableTh column="why" {...sort} helpKey="changes.col.why">Why</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <td className={styles.why}>{day(c.changed_at)}</td>
                <td>
                  <RiskOpener open={openId === c.id} onToggle={() => toggle(c.id)}>{c.system_name} — {c.threat_name}</RiskOpener>
                  {c.department_name && <span className={styles.sub}>{c.department_name}</span>}
                </td>
                <td className={styles.num}><Score value={c.before} /> → <Score value={c.after} /></td>
                <td className={styles.why}>{c.why}{c.notes ? `: ${c.notes}` : ''}{c.changed_by_name && <span className={styles.sub}>by {c.changed_by_name}</span>}</td>
              </tr>
              {openId === c.id && <RiskAnswerRow colSpan={4} riskId={c.risk_id} lead="why" />}
            </Fragment>
          ))}
        </tbody>
      </table>
      {given.length > rows.length && <p className={styles.note}>The newest {rows.length} of {given.length}.</p>}
    </>
  );
}

export function ChangesQuestion({ data, by, direction = '', limit = 60 }) {
  if (!data.changes.length) return <p className={styles.note}>No risk score changed in the last {data.days} days.</p>;
  if (by === 'cause') return <div className={styles.side}><Causes rows={data.by_source} /></div>;
  const all = direction ? data.changes.filter((c) => c.direction === direction) : data.changes;
  if (!all.length) return <p className={styles.note}>None.</p>;
  return <div className={styles.side}><Changes rows={all} limit={limit} /></div>;
}
