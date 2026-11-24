// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from '../components/HelpDot';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSuppliers, createSupplier } from '../api';
import { useAuth } from '../context/AuthContext';
import { useViewMode } from '../hooks/useViewMode';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { RatingChip } from '../components/RatingChip';
import { CompletenessRing } from '../components/CompletenessRing';
import { supplierTypeLabel } from '../utils/supplierTypes';
import styles from './ScopesPage.module.css';
import { useScrollRestore } from '../hooks/useScrollRestore';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { useUrlSortState } from '../hooks/useUrlState';

// Suppliers (v142). A supplier is the organisation; what we have with it is a
// relationship — its supplier type, the department that contracts it (and so owns it),
// what it touches and the contract. Criticality is derived from the systems the
// relationships touch, never typed in.
// How well a supplier's live relationships have their control objectives met
// by current evidence (v144): met, evidenced once but expired, never evidenced —
// and whether anyone has answered the gap.
const RING_LABELS = { complete: 'met', partial: 'evidence expired', missing: 'not evidenced' };

// The percentage of a supplier's expected control objectives met, rounded down as
// the ring shows it; null (sorts last) when it has no live relationship or none expected.
export function assurancePercent(s) {
  if (!s.live_count) return null;
  const total = (s.objectives_met || 0) + (s.objectives_expired || 0) + (s.objectives_missing || 0);
  return total ? Math.floor(((s.objectives_met || 0) / total) * 100) : null;
}

// Column key → value, for sorting the list by a header (useTableSort).
export const SUPPLIER_ACCESSORS = {
  name:          (s) => s.name,
  relationships: (s) => s.relationship_count,
  contracted_by: (s) => (s.departments || []).join(', '),
  criticality:   (s) => s.max_impact,
  assurance:     assurancePercent,
};

function AssuranceCell({ s }) {
  if (s.live_count === 0) {
    return <span className={styles.muted}>no live relationship</span>;
  }
  if (s.objectives_met + s.objectives_expired + s.objectives_missing === 0) {
    return <span className={styles.muted}>no objectives expected</span>;
  }
  return (
    <>
      <CompletenessRing
        complete={s.objectives_met} partial={s.objectives_expired} missing={s.objectives_missing}
        labels={RING_LABELS} of="control objectives" />
      {s.gap_count > 0 && (
        <span className={styles.note}>
          Gaps on {s.gap_count} of {s.live_count} live relationship{s.live_count === 1 ? '' : 's'}
          {s.unanswered_gaps > 0 ? ` · ${s.unanswered_gaps} not yet answered` : ' · answered (action or exception)'}
        </span>
      )}
    </>
  );
}

export function SuppliersPage() {
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const canWrite = hasCapability('suppliers.write');
  const viewMode = useViewMode();
  const [rows, setRows]   = useState(null);
  useScrollRestore(rows !== null);   // Back from an item lands where you left the list
  const [error, setError] = useState('');
  const [name, setName]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [gapsOnly, setGapsOnly] = useState(false);

  const shown = useMemo(() => (gapsOnly ? (rows || []).filter(s => s.gap_count > 0) : (rows || [])), [rows, gapsOnly]);
  // Sorted by a header, the sort kept in the address so Back returns to it.
  const sortState = useUrlSortState();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(shown, { accessors: SUPPLIER_ACCESSORS, state: sortState });
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  const load = useCallback(async () => {
    try { setRows(await getSuppliers()); setError(''); }
    catch { setError('Could not load suppliers.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) { setError('A supplier needs a name.'); return; }
    setBusy(true); setError('');
    try {
      const s = await createSupplier({ name });
      navigate(`/suppliers/${s.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || 'The supplier was not recorded.');
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Suppliers <HelpDot k="suppliers.title" placement="bottom" /></h1>
            <p className={styles.desc}>
              The organisations we rely on, and what each relationship touches: contractors working inside
              the business, companies operating our systems, providers hosting a system for us, and the
              makers of the technology we run. Each relationship belongs to the department that contracts it.
            </p>
            <p className={styles.desc}>
              <Link to="/suppliers/control-sets">Supplier control sets →</Link> what each supplier type is expected to meet.
            </p>
          </div>
          <div className={styles.actions}>
            <ViewModeToggle {...viewMode} />
            {!canWrite && <ReadOnlyBadge reason="Recording suppliers needs the suppliers.write capability." />}
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {canWrite && (
          <form className={styles.create} onSubmit={create}>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)}
                   placeholder="New supplier, e.g. Microsoft" aria-label="Supplier name" maxLength={200} />
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Recording…' : 'Record supplier'}</button>
          </form>
        )}

        {rows && (() => {
          const withGaps   = rows.filter(s => s.gap_count > 0);
          const unanswered = withGaps.filter(s => s.unanswered_gaps > 0).length;
          const sum = (k) => rows.reduce((n, s) => n + (s[k] || 0), 0);
          return (<>
          <div className={styles.create}>
            <CompletenessRing size={44}
              complete={sum('objectives_met')} partial={sum('objectives_expired')} missing={sum('objectives_missing')}
              labels={RING_LABELS} of="control objectives" showCounts={false} />
            {withGaps.length === 0 ? (
              <span className={styles.good}>Every live supplier relationship has all its control objectives met.</span>
            ) : (
              <span className={styles.warn}>
                {withGaps.length} supplier{withGaps.length === 1 ? ' has' : 's have'} assurance gaps
                {unanswered > 0 && <> — {unanswered} with a gap nobody has answered yet</>}.
              </span>
            )}
            {withGaps.length > 0 && (
              <label className={styles.note} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 0 }}>
                <input type="checkbox" checked={gapsOnly} onChange={e => setGapsOnly(e.target.checked)} />
                Show only suppliers with gaps
              </label>
            )}
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableTh column="name" {...sortProps} helpKey="col.supplier">Supplier</SortableTh>
                <SortableTh column="relationships" {...sortProps} helpKey="suppliers.col.relationships">Relationships</SortableTh>
                <SortableTh column="contracted_by" {...sortProps} helpKey="suppliers.col.contracted_by">Contracted by</SortableTh>
                <SortableTh column="criticality" {...sortProps} helpKey="suppliers.col.criticality">Criticality</SortableTh>
                <SortableTh column="assurance" {...sortProps} helpKey="suppliers.col.assurance">Assurance</SortableTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => (
                <tr key={s.id}>
                  <td>
                    <Link className={styles.name} to={`/suppliers/${s.id}`}>{s.name}</Link>
                    {s.notes && <span className={styles.note}>{s.notes}</span>}
                  </td>
                  <td>
                    {s.relationship_count === 0
                      ? <span className={styles.muted}>none recorded</span>
                      : <>
                          {s.types.map(supplierTypeLabel).join(', ')}
                          <span className={styles.note}>
                            {s.active_count} active of {s.relationship_count}
                          </span>
                        </>}
                  </td>
                  <td>{s.departments.length ? s.departments.join(', ') : '—'}</td>
                  <td title="The highest impact of the systems its live relationships touch">
                    <RatingChip value={s.max_impact} scale="impact" variant={viewMode.isExpert ? 'number' : 'word'} />
                  </td>
                  <td><AssuranceCell s={s} /></td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={5} className={styles.muted}>No suppliers recorded yet.</td></tr>
              )}
            </tbody>
          </table>
          </>);
        })()}
      </div>
    </Shell>
  );
}
