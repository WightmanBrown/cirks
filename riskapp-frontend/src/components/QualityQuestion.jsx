// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { SortableTh } from './SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import styles from './CoverageQuestion.module.css';

// Control quality, answered (docs/insights-drilldown.md step 3), from
// GET /reports/quality: the applicable control objectives by how well they are
// judged to work, weak and not rated first, with the high risks leaning on each;
// or who is to rate them. `by`: 'objective' | 'owner'. `band` narrows the list.

const BAND = { weak: 'Weak (1–2)', not_rated: 'Not rated', adequate: 'Adequate (3)', strong: 'Strong (4–5)' };
const label = (o) => `${o.framework_ref ? `${o.framework_ref.replace(/^CIRKS1\./, '')} ` : ''}${o.title}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

const BAND_ORDER = { weak: 0, not_rated: 1, adequate: 2, strong: 3 };
const inPlaceOf = (o) => (o.delivery === 'organisation' || o.delivery === 'group' ? null : o.systems_in_place);

function Owners({ rows: given }) {
  const { sorted: rows, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    owner: (o) => o.owner_name, weak: (o) => o.weak, not_rated: (o) => o.not_rated,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortableTh column="owner" {...sort} helpKey="quality.col.owner">Owner</SortableTh>
          <SortableTh column="weak" {...sort} className={styles.num} helpKey="quality.col.weak">Weak</SortableTh>
          <SortableTh column="not_rated" {...sort} className={styles.num} helpKey="quality.col.not_rated">Not rated</SortableTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.owner_name || 'none'}>
            <td>{o.owner_name || <span className={styles.sub}>No owner named: the SoA names one per objective</span>}</td>
            <td className={styles.num}>{o.weak}</td>
            <td className={styles.num}>{o.not_rated}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Objectives({ rows: given, limit }) {
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(given, { accessors: {
    name: (o) => label(o), rated: (o) => BAND_ORDER[o.band] * 10 + (o.effectiveness ?? 0),
    systems: inPlaceOf, leaning: (o) => o.high_risks_leaning,
  } });
  const sort = { sortKey, sortDir, onSort: toggleSort };
  const rows = sorted.slice(0, limit);
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableTh column="name" {...sort} helpKey="quality.col.objective">Control objective</SortableTh>
            <SortableTh column="rated" {...sort} helpKey="quality.col.rating">Rated</SortableTh>
            <SortableTh column="systems" {...sort} className={styles.num} helpKey="quality.col.systems">In place on</SortableTh>
            <SortableTh column="leaning" {...sort} className={styles.num} helpKey="quality.col.leaning">High risks leaning on it</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.control_id}>
              <td><Link to={`/controls/${o.control_id}`}>{label(o)}</Link>{o.owner_name && <span className={styles.sub}>Owner: {o.owner_name}</span>}</td>
              <td>{BAND[o.band]}{o.effectiveness != null && <span className={styles.sub}>{o.effectiveness} of 5{o.rated_at ? `, ${day(o.rated_at)}` : ''}{o.rated_by_name ? ` by ${o.rated_by_name}` : ''}</span>}</td>
              <td className={styles.num}>
                {o.delivery === 'organisation' || o.delivery === 'group'
                  ? <span className={styles.sub}>{o.delivery === 'group' ? 'A group of systems' : 'Organisation-wide'}</span>
                  : `${o.systems_in_place} system${o.systems_in_place === 1 ? '' : 's'}`}
              </td>
              <td className={styles.num}>{o.high_risks_leaning || <span className={styles.sub}>none</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {given.length > rows.length && <p className={styles.note}>The first {rows.length} of {given.length}.</p>}
    </>
  );
}

export function QualityQuestion({ data, by, band = '', limit = 50 }) {
  if (by === 'owner') {
    if (!data.owners.length) return <p className={styles.note}>Every applicable objective is rated and none is weak.</p>;
    return <div className={styles.side}><Owners rows={data.owners} /></div>;
  }
  const all = band ? data.objectives.filter((o) => o.band === band) : data.objectives;
  if (!all.length) return <p className={styles.note}>None.</p>;
  return <div className={styles.side}><Objectives rows={all} limit={limit} /></div>;
}
