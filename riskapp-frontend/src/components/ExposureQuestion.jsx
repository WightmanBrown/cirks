// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { SortableTh } from './SortableTh';
import { RiskAnswerRow, RiskOpener, useRiskUnfold } from './RiskAnswer';
import { useTableSort } from '../hooks/useTableSort';
import { scoreLevel } from '../utils/riskColors';
import styles from './CoverageQuestion.module.css';
import own from './ExposureQuestion.module.css';

// Where the risk sits, answered (docs/insights-drilldown.md step 3), from
// GET /reports/exposure: the risks in scope grouped by department, system or
// threat, or listed one by one with each unfolding its risk answer. Every
// column sorts. `by`: 'department' | 'system' | 'threat' | 'risks'.

const TREATMENT = { mitigate: 'Mitigate', accept: 'Accept', transfer: 'Transfer', avoid: 'Avoid' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// THE score pill on the question pages: the risk band's colours, as elsewhere.
export function Score({ value }) {
  if (value == null) return <span className={styles.sub}>—</span>;
  return <span className={`${own.score} ${own[`band_${scoreLevel(value)}`]}`}>{value}</span>;
}

function Groups({ rows: given, kind, action, deptLink }) {
  const { sorted: rows, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    name: (g) => g.name, risks: (g) => g.risks, at: (g) => g.at_or_above_action, top: (g) => g.top_score, work: (g) => g.with_target,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {kind === 'department' && <SortableTh column="name" {...sort} helpKey="exposure.col.department">Department</SortableTh>}
          {kind === 'system' && <SortableTh column="name" {...sort} helpKey="exposure.col.system">System</SortableTh>}
          {kind === 'threat' && <SortableTh column="name" {...sort} helpKey="exposure.col.threat">Threat</SortableTh>}
          <SortableTh column="risks" {...sort} className={styles.num} helpKey="exposure.col.risks">Risks</SortableTh>
          <SortableTh column="at" {...sort} className={styles.num} helpKey="exposure.col.at_or_above">Scoring {action} or higher</SortableTh>
          <SortableTh column="top" {...sort} className={styles.num} helpKey="exposure.col.highest">Highest</SortableTh>
          <SortableTh column="work" {...sort} helpKey="exposure.col.committed">Committed work</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.id || 'none'}>
            <td>
              {kind === 'department' && (g.id ? <Link to={deptLink(g.id)}>{g.name}</Link> : g.name)}
              {kind === 'system' && <><Link to={`/reporting/systems/${g.id}`}>{g.name}</Link>{g.department_name && <span className={styles.sub}>{g.department_name}</span>}</>}
              {kind === 'threat' && (g.id ? <Link to={`/threats/${g.id}`}>{g.name}</Link> : g.name)}
            </td>
            <td className={styles.num}>{g.risks}</td>
            <td className={styles.num}>{g.at_or_above_action}</td>
            <td className={styles.num}><Score value={g.top_score} /></td>
            <td className={styles.why}>
              {g.with_target === 0 ? 'None lowers a score'
                : <>Lowers {plural(g.with_target, 'risk')}{g.brought_below_action ? `, ${g.brought_below_action} below ${action}` : ''}</>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Risks({ rows: given, limit }) {
  const [openId, toggle] = useRiskUnfold();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    risk: (r) => `${r.system_name} ${r.threat_name}`, dept: (r) => r.department_name, now: (r) => r.score,
    after: (r) => (r.target_score != null && r.target_score < r.score ? r.target_score : null),
    treatment: (r) => TREATMENT[r.treatment_decision] || null,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  const rows = sorted.slice(0, limit);
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh column="risk" {...sort} helpKey="exposure.col.risk">Risk</SortableTh>
            <SortableTh column="dept" {...sort} helpKey="col.department">Department</SortableTh>
            <SortableTh column="now" {...sort} className={styles.num} helpKey="exposure.col.now">Now</SortableTh>
            <SortableTh column="after" {...sort} className={styles.num} helpKey="exposure.col.after">After work</SortableTh>
            <SortableTh column="treatment" {...sort} helpKey="exposure.col.treatment">Treatment</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.risk_id}>
              <tr>
                <td><RiskOpener open={openId === r.risk_id} onToggle={() => toggle(r.risk_id)}>{r.system_name} — {r.threat_name}</RiskOpener></td>
                <td>{r.department_name || '—'}</td>
                <td className={styles.num}><Score value={r.score} /></td>
                <td className={styles.num}>{r.target_score != null && r.target_score < r.score ? <Score value={r.target_score} /> : <span className={styles.sub}>—</span>}</td>
                <td className={styles.why}>
                  {TREATMENT[r.treatment_decision] || 'Not decided'}
                  {r.has_open_action && ', action open'}{r.has_active_exception && ', accepted'}
                </td>
              </tr>
              {openId === r.risk_id && <RiskAnswerRow colSpan={5} riskId={r.risk_id} lead="why" />}
            </Fragment>
          ))}
        </tbody>
      </table>
      {given.length > rows.length && <p className={styles.note}>The first {rows.length} of {given.length}. Narrow by department or square to see the rest.</p>}
    </>
  );
}

export function ExposureQuestion({ data, by, deptLink = (id) => `?by=system&dept=${id}`, limit = 50 }) {
  if (!data.total) return <p className={styles.note}>No active risk matches.</p>;
  const action = data.thresholds.action;
  if (by === 'risks') return <div className={styles.side}><Risks rows={data.risks} limit={limit} /></div>;
  const rows = by === 'department' ? data.by_department : by === 'system' ? data.by_system : data.by_threat;
  return (
    <div className={styles.side}>
      <Groups rows={rows.slice(0, limit)} kind={by} action={action} deptLink={deptLink} />
      {rows.length > limit && <p className={styles.note}>The first {limit} of {rows.length}.</p>}
    </div>
  );
}
