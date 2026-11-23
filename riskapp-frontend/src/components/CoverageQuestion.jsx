// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { HelpDot } from './HelpDot';
import { SortableTh } from './SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { Score } from './ExposureQuestion';
import styles from './CoverageQuestion.module.css';

// Control coverage on systems, answered (docs/insights-drilldown.md step 3):
// the best and worst covered objectives, systems or departments, or the
// degraded controls to fix first, from GET /reports/coverage. Each row says why
// it is low where CIRKS can tell, because the causes need different people.
// `by`: 'objective' | 'system' | 'department' | 'degraded'. `limit` rows a side.

const CAUSE = {
  no_solution: 'No security solution delivers it, so it cannot be put in place yet',
  solution_not_in_place: 'Its security solution is in place on no system that needs it',
  degraded_everywhere: 'In place only in a degraded state: working properly nowhere',
  no_pattern: 'No system pattern stated, so its record is not checked',
  record_incomplete: 'Its record is incomplete against its pattern',
  nothing_in_place: 'Nothing recorded in place',
};
const pct = (t) => (t.total ? Math.floor((100 * t.operational) / t.total) : 0);
const label = (o) => `${o.ref ? `${o.ref.replace(/^CIRKS1\./, '')} ` : ''}${o.title}`;

function Bar({ t }) {
  return (
    <span className={styles.bar} role="img" aria-label={`${t.operational} in place, ${t.degraded} degraded, ${t.missing} not in place, of ${t.total}`}>
      <i className={styles.in} style={{ width: `${(100 * t.operational) / t.total}%` }} />
      <i className={styles.deg} style={{ width: `${(100 * t.degraded) / t.total}%` }} />
    </span>
  );
}

const whyOf = (r, kind, threshold) => (r.cause ? CAUSE[r.cause] : kind === 'system' && r.risks_at_or_above_action
  ? `${r.risks_at_or_above_action} risk${r.risks_at_or_above_action === 1 ? '' : 's'} scoring ${threshold} or higher here`
  : kind === 'department' ? `${r.systems} system${r.systems === 1 ? '' : 's'}, ${pct(r)}% in place` : '');

function Rows({ rows: given, kind, deptLink, threshold }) {
  const { sorted: rows, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    name: (r) => (kind === 'objective' ? label(r) : r.name),
    in_place: (r) => (r.total ? r.operational / r.total : 0),
    why: (r) => whyOf(r, kind, threshold),
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {kind === 'objective' && <SortableTh column="name" {...sort} helpKey="coverage.col.objective">Control objective</SortableTh>}
          {kind === 'system' && <SortableTh column="name" {...sort} helpKey="coverage.col.system">System</SortableTh>}
          {kind === 'department' && <SortableTh column="name" {...sort} helpKey="coverage.col.department">Department</SortableTh>}
          <SortableTh column="in_place" {...sort} className={styles.num} helpKey="coverage.col.in_place">In place</SortableTh>
          <SortableTh column="why" {...sort} helpKey="coverage.col.why">Why</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.control_id || r.system_id || r.department_id || 'none'}>
            <td>
              {kind === 'objective' && <Link to={`/controls/${r.control_id}`}>{label(r)}</Link>}
              {kind === 'system' && <><Link to={`/reporting/systems/${r.system_id}`}>{r.name}</Link>
                {r.department_name && <span className={styles.sub}>{r.department_name}</span>}</>}
              {kind === 'department' && (r.department_id ? <Link to={deptLink(r.department_id)}>{r.name}</Link> : r.name)}
            </td>
            <td className={styles.num}>
              <Bar t={r} /> {r.operational} of {r.total}
              {r.degraded > 0 && <span className={styles.sub}>{r.degraded} degraded</span>}
            </td>
            <td className={styles.why}>{whyOf(r, kind, threshold)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Degraded({ data, limit }) {
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(data.degraded, { accessors: {
    system: (r) => r.system_name, objective: (r) => label(r), risks: (r) => r.risks, highest: (r) => r.top_score || null,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  const rows = sorted.slice(0, limit * 2);
  if (!rows.length) return <p className={styles.note}>No control is degraded on any system.</p>;
  return (
    <div className={styles.side}>
      <h3 className={styles.sideTitle}>Degraded controls, behind the highest risks first <HelpDot k="coverage.degraded" placement="bottom" /></h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh column="system" {...sort} helpKey="coverage.col.system">System</SortableTh>
            <SortableTh column="objective" {...sort} helpKey="coverage.col.objective">Control objective</SortableTh>
            <SortableTh column="risks" {...sort} className={styles.num} helpKey="coverage.col.risks">Risks it counters</SortableTh>
            <SortableTh column="highest" {...sort} className={styles.num} helpKey="coverage.col.highest">Highest risk</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.system_id}:${r.control_id}`}>
              <td><Link to={`/reporting/systems/${r.system_id}`}>{r.system_name}</Link>{r.department_name && <span className={styles.sub}>{r.department_name}</span>}</td>
              <td><Link to={`/controls/${r.control_id}`}>{label(r)}</Link></td>
              <td className={styles.num}>{r.risks || <span className={styles.sub}>none assessed</span>}</td>
              <td className={styles.num}>{r.risks ? <Score value={r.top_score} /> : <span className={styles.sub}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.degraded.length > rows.length && <p className={styles.note}>and {data.degraded.length - rows.length} more.</p>}
    </div>
  );
}

export function CoverageQuestion({ data, by, limit = 10, deptLink = (id) => `?by=system&dept=${id}` }) {
  if (by === 'degraded') return <Degraded data={data} limit={limit} />;
  const all = by === 'objective' ? data.objectives : by === 'system' ? data.systems : data.departments;
  if (!all.length) return <p className={styles.note}>Nothing is recorded on any system yet.</p>;
  // Few enough to show in one list; otherwise the two ends.
  if (all.length <= limit * 2) {
    return <div className={styles.side}><Rows rows={all} kind={by} deptLink={deptLink} threshold={data.action_threshold} /></div>;
  }
  const worst = all.slice(-limit).reverse();
  return (
    <div className={styles.pair}>
      <div className={styles.side}>
        <h3 className={styles.sideTitle}>Worst covered <HelpDot k="coverage.worst" placement="bottom" /></h3>
        <Rows rows={worst} kind={by} deptLink={deptLink} threshold={data.action_threshold} />
      </div>
      <div className={styles.side}>
        <h3 className={styles.sideTitle}>Best covered <HelpDot k="coverage.best" placement="bottom" /></h3>
        <Rows rows={all.slice(0, limit)} kind={by} deptLink={deptLink} threshold={data.action_threshold} />
      </div>
    </div>
  );
}
