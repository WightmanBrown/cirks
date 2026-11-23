// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { SortableTh } from './SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import styles from './CoverageQuestion.module.css';

// Meeting a standard, answered (docs/insights-drilldown.md step 3), from
// GET /reports/standards/:code: the requirements not met and partly met, each
// with the objectives falling short and why each applies; or the objectives
// standing between the standard and being met, most requirements first. A
// requirement is met only when every objective mapped to it is in place (v161).
// Every column sorts. `by`: 'requirement' | 'objective'.

const STATE = { gap: 'Not met', partial: 'Partly met', covered: 'Met', excluded: 'Excluded' };
const STATE_ORDER = { gap: 0, partial: 1, covered: 2, excluded: 3 };
const STATUS = { not_implemented: 'not in place', partial: 'partly in place', planned: 'planned', not_decided: 'applicability not decided' };

// Where an objective's obligation comes from, in words: the identified threats
// it counters, and the Statement of Applicability (its decision and drivers).
export function sourceWords(s) {
  if (!s) return null;
  const parts = [];
  if (s.risks > 0) {
    const named = s.threats.slice(0, 2).join(', ');
    const more = s.threats.length > 2 ? ` and ${s.threats.length - 2} more` : '';
    parts.push(`counters ${named}${more} (${s.risks} risk${s.risks === 1 ? '' : 's'})`);
  }
  if (!s.decided) parts.push('applicability not yet decided in the SoA');
  else if (s.applicable) parts.push(`required by the SoA${s.drivers.length ? ` (${s.drivers.join(', ')})` : ''}`);
  if (!s.risks && s.decided && s.applicable) parts.push('no identified threat');
  return parts.join('; ');
}

function Objectives({ rows: given, limit }) {
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    name: (o) => o.title, state: (o) => STATUS[o.status] || o.status, held: (o) => o.requirements, missing: (o) => o.systems_missing || null,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  const rows = sorted.slice(0, limit);
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh column="name" {...sort} helpKey="standard.col.objective">Control objective</SortableTh>
            <SortableTh column="state" {...sort} helpKey="standard.col.status">State</SortableTh>
            <SortableTh column="held" {...sort} className={styles.num} helpKey="standard.col.held_back">Requirements held back</SortableTh>
            <SortableTh column="missing" {...sort} className={styles.num} helpKey="standard.col.missing_on">Missing on</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.control_id}>
              <td><Link to={`/controls/${o.control_id}`}>{o.title}</Link>{o.source && <span className={styles.sub}>Why it applies: {sourceWords(o.source)}</span>}</td>
              <td>{STATUS[o.status] || o.status}</td>
              <td className={styles.num}>{o.requirements}</td>
              <td className={styles.num}>{o.systems_missing ? `${o.systems_missing} system${o.systems_missing === 1 ? '' : 's'}` : <span className={styles.sub}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {given.length > rows.length && <p className={styles.note}>The first {rows.length} of {given.length}.</p>}
    </>
  );
}

function Requirements({ rows: given, limit }) {
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    ref: (r) => r.ref, state: (r) => STATE_ORDER[r.state] * 1000 + (r.percent ?? 0), short: (r) => r.shortfalls.length,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  const rows = sorted.slice(0, limit);
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh column="ref" {...sort} helpKey="standard.col.requirement">Requirement</SortableTh>
            <SortableTh column="state" {...sort} helpKey="standard.col.state">State</SortableTh>
            <SortableTh column="short" {...sort} helpKey="standard.col.short">Falling short</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.ref}</b> {r.title}{r.group && <span className={styles.sub}>{r.group}</span>}</td>
              <td>{STATE[r.state]}{r.percent != null && r.state !== 'covered' && <span className={styles.sub}>{r.percent}% of its objectives in place</span>}</td>
              <td className={styles.why}>
                {r.shortfalls.length === 0 ? (r.state === 'gap' ? 'No objective is mapped to it' : '—')
                  : r.shortfalls.map((f) => (
                    <span key={f.control_id} className={styles.shortfall}>
                      <Link to={`/controls/${f.control_id}`}>{f.title}</Link> ({STATUS[f.status] || f.status})
                      {f.source && <span className={styles.sub}>Why it applies: {sourceWords(f.source)}</span>}
                    </span>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {given.length > rows.length && <p className={styles.note}>The first {rows.length} of {given.length}.</p>}
    </>
  );
}

export function StandardQuestion({ data, by, showMet = false, limit = 60 }) {
  if (!data.loaded) return <p className={styles.note}>{data.name} has no requirements loaded, so nothing can be measured against it yet.</p>;
  if (by === 'objective') {
    if (!data.objectives.length) return <p className={styles.note}>No objective falls short: every requirement is met or excluded.</p>;
    return <div className={styles.side}><Objectives rows={data.objectives} limit={limit} /></div>;
  }
  const all = data.requirements.filter((r) => showMet || r.state === 'gap' || r.state === 'partial');
  if (!all.length) return <p className={styles.note}>Every requirement is met or excluded.</p>;
  return <div className={styles.side}><Requirements rows={all} limit={limit} /></div>;
}
