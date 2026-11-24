// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getSupplierObjectiveSets, addSupplierObjective, removeSupplierObjective, getControls } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { ControlStatusPill } from '../components/ControlStatusPill';
import { SUPPLIER_TYPES } from '../utils/supplierTypes';
import styles from './ScopesPage.module.css';
import { HelpDot } from '../components/HelpDot';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { useUrlSortState } from '../hooks/useUrlState';
import { OBJECTIVE_STATUS } from '../utils/objectiveStatus';

const SETS = [
  { key: 'all', label: 'Every supplier', hint: 'The supplier programme itself — expected of every relationship, whatever its supplier type.' },
  ...SUPPLIER_TYPES.map(t => ({ key: t.value, label: t.label, hint: t.hint })),
];

// Column key → value, for sorting the sets by a header (useTableSort). One sort
// applies within every set. The objective sorts by its reference, else its title;
// the SoA status by the words the pill shows.
export const SET_OBJECTIVE_ACCESSORS = {
  objective: (o) => o.ref || o.title,
  soa:       (o) => OBJECTIVE_STATUS[o.objective_status]?.label || o.objective_status,
};

// The control objectives each supplier type is expected to meet
// (v143). They are data, edited with the control catalogue (controls.write): a
// relationship's set is every-supplier plus its own supplier type's, derived — so a change
// here reaches every relationship of that supplier type at once. An objective is met by
// evidence — a report or terms in the contract — recorded on the relationship.
export function SupplierControlSetsPage() {
  const { hasCapability } = useAuth();
  const canEdit = hasCapability('controls.write');
  const [sets, setSets]         = useState(null);
  const [controls, setControls] = useState([]);
  const [pick, setPick]         = useState({});
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    try { setSets(await getSupplierObjectiveSets()); setError(''); }
    catch { setError('Could not load the control sets.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!canEdit) return;
    getControls().then(d => setControls(d.controls || [])).catch(() => setControls([]));
  }, [canEdit]);

  const sortedControls = useMemo(() => [...controls].sort((a, b) =>
    (a.framework_ref || '~').localeCompare(b.framework_ref || '~', undefined, { numeric: true }) || a.title.localeCompare(b.title)
  ), [controls]);

  // Every set's rows sorted together by one sort (hooks cannot run per set), then
  // handed back to their own set, each keeping the API's order until a header is chosen.
  const flat = useMemo(() => SETS.flatMap(set => (sets?.[set.key] || []).map(o => ({ ...o, _set: set.key }))), [sets]);
  const sortState = useUrlSortState();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(flat, { accessors: SET_OBJECTIVE_ACCESSORS, state: sortState });
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  const run = async (fn) => {
    setError('');
    try { await fn(); await load(); }
    catch (err) { setError(err?.response?.data?.error || 'That change was not saved.'); }
  };

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/suppliers" />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Supplier control sets <HelpDot k="supplier_sets.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              What each supplier type is expected to meet. Every relationship is held to the <b>every supplier</b>
              set plus the set for its supplier type. An objective counts as met when a current assurance report or
              contract terms cover it &mdash; or, for an objective we deliver once for the whole organisation, when our
              own control is implemented. Changing a set here changes it for every relationship of that supplier type.
            </p>
          </div>
          {!canEdit && <ReadOnlyBadge reason="Editing the sets needs the controls.write capability (CISO, risk analyst, admin)." />}
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {sets && SETS.map(set => {
          const rows = sorted.filter(o => o._set === set.key);
          const inSet = new Set(rows.map(r => r.control_id));
          return (
            <section key={set.key} className={styles.section}>
              <h2 className={styles.sectionTitle}>{set.label} <span className={styles.count}>{rows.length}</span> <HelpDot k="supplier_sets.set" placement="bottom" /></h2>
              <p className={styles.note}>{set.hint}</p>
              {rows.length === 0 ? (
                <p className={styles.muted}>No objectives in this set.</p>
              ) : (
                <table className={styles.table}>
                  <thead><tr>
                    <SortableTh column="objective" {...sortProps} helpKey="col.control">Objective</SortableTh>
                    <SortableTh column="soa" {...sortProps} helpKey="supplier_sets.col.in_soa">In the SoA</SortableTh>
                    {canEdit && <th />}
                  </tr></thead>
                  <tbody>
                    {rows.map(o => (
                      <tr key={o.control_id}>
                        <td>
                          {o.ref && <span className={styles.ref}>{o.ref}</span>}
                          <Link to={`/controls/${o.control_id}`}>{o.title}</Link>
                        </td>
                        <td><ControlStatusPill status={o.objective_status} /></td>
                        {canEdit && (
                          <td className={styles.right}>
                            <button className={styles.linkBtn} aria-label={`Remove ${o.ref || o.title} from ${set.label}`}
                              onClick={() => run(() => removeSupplierObjective(set.key, o.control_id))}>Remove</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {canEdit && (
                <div className={styles.create}>
                  <select className={styles.input} value={pick[set.key] || ''} aria-label={`Objective to add to ${set.label}`}
                    onChange={e => setPick(p => ({ ...p, [set.key]: e.target.value }))}>
                    <option value="">Add an objective…</option>
                    {sortedControls.filter(c => !inSet.has(c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.framework_ref ? `${c.framework_ref} — ` : ''}{c.title}</option>
                    ))}
                  </select>
                  <button className={styles.primary} disabled={!pick[set.key]}
                    onClick={() => run(async () => {
                      await addSupplierObjective(set.key, pick[set.key]);
                      setPick(p => ({ ...p, [set.key]: '' }));
                    })}>Add</button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
