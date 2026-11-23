// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { SortableTh } from './SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import styles from './CoverageQuestion.module.css';

// Work in progress, answered (docs/insights-drilldown.md step 3), from
// GET /reports/work: the security actions in hand, overdue first, with the risk
// points each removes; or who holds the open items. `by`: 'action' | 'person'.

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// How far along an action is, as one sortable figure: overdue first by how long.
const urgency = (a) => (!a.accepted ? 0 : a.overdue ? 100000 + a.days_overdue : a.target_date ? -new Date(a.target_date).getTime() / 864e5 : 0);

function People({ rows: given }) {
  const { sorted: rows, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    person: (p) => p.owner_name, items: (p) => p.open_items, actions: (p) => p.actions,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortableTh column="person" {...sort} helpKey="work.col.person">Person</SortableTh>
          <SortableTh column="items" {...sort} className={styles.num} helpKey="work.col.items">Open items</SortableTh>
          <SortableTh column="actions" {...sort} className={styles.num} helpKey="work.col.actions">Across</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.owner_name || 'none'}>
            <td>{p.owner_name || <span className={styles.sub}>Nobody named</span>}</td>
            <td className={styles.num}>{p.open_items}</td>
            <td className={styles.num}>{plural(p.actions, 'action')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Actions({ rows: given, threshold, limit }) {
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    action: (a) => a.title, state: urgency, done: (a) => (a.items ? a.items_done / a.items : 0), points: (a) => a.points,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  const rows = sorted.slice(0, limit);
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh column="action" {...sort} helpKey="work.col.action">Security action</SortableTh>
            <SortableTh column="state" {...sort} helpKey="work.col.state">State</SortableTh>
            <SortableTh column="done" {...sort} className={styles.num} helpKey="work.col.done">Items done</SortableTh>
            <SortableTh column="points" {...sort} className={styles.num} helpKey="work.col.points">Risk points it removes</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>
                {/* A risk's action is worked on its risk; one raised from a finding, on the findings page. */}
                {a.risks.length
                  ? <Link to={`/risks/${a.risks[0].risk_id}#work`}>{a.title}</Link>
                  : <Link to="/findings">{a.title}</Link>}
                <span className={styles.sub}>{[a.owner_name && `${a.owner_name} accountable`, a.departments.join(', ')].filter(Boolean).join('; ')}</span>
              </td>
              <td>
                {!a.accepted ? 'Awaiting acceptance' : a.overdue ? <>Overdue by {plural(a.days_overdue, 'day')}</> : a.target_date ? <>Due {day(a.target_date)}</> : 'In hand'}
              </td>
              <td className={styles.num}>{a.items_done} of {a.items}</td>
              <td className={styles.num}>{a.points || <span className={styles.sub}>none judged</span>}
                {a.high_risks > 0 && <span className={styles.sub}>on {plural(a.high_risks, 'risk')} at or above {threshold}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {given.length > rows.length && <p className={styles.note}>The first {rows.length} of {given.length}.</p>}
    </>
  );
}

export function WorkQuestion({ data, by, limit = 50 }) {
  if (by === 'person') {
    if (!data.people.length) return <p className={styles.note}>No open item of work.</p>;
    return <div className={styles.side}><People rows={data.people} /></div>;
  }
  if (!data.actions.length) return <p className={styles.note}>No security action is in hand.</p>;
  return <div className={styles.side}><Actions rows={data.actions} threshold={data.action_threshold} limit={limit} /></div>;
}
