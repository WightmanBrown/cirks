// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from '../components/HelpDot';
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSuppliers, createSupplier } from '../api';
import { useAuth } from '../context/AuthContext';
import { useViewMode } from '../hooks/useViewMode';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { RatingChip } from '../components/RatingChip';
import { supplierTypeLabel } from '../utils/supplierTypes';
import styles from './ScopesPage.module.css';

// Suppliers (v142). A supplier is the organisation; what we have with it is a
// relationship — its supplier type, the department that contracts it (and so owns it),
// what it touches and the contract. Criticality is derived from the systems the
// relationships touch, never typed in.
// Whether a supplier's live relationships have all their control objectives met
// by current evidence (v144) — the gap, and whether anyone has answered it.
function AssuranceCell({ s }) {
  if (s.live_count === 0) {
    return <span className={styles.muted}>no live relationship</span>;
  }
  if (s.gap_count === 0) {
    return <span className={styles.good}>All met</span>;
  }
  return (
    <>
      <span className={styles.warn}>
        ⚠ Gaps on {s.gap_count} of {s.live_count} live relationship{s.live_count === 1 ? '' : 's'}
      </span>
      <span className={styles.note}>
        {s.unmet_objectives} control objective{s.unmet_objectives === 1 ? '' : 's'} not met
        {s.unanswered_gaps > 0 ? ` · ${s.unanswered_gaps} not yet answered` : ' · answered (action or acceptance)'}
      </span>
    </>
  );
}

export function SuppliersPage() {
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const canWrite = hasCapability('suppliers.write');
  const viewMode = useViewMode();
  const [rows, setRows]   = useState(null);
  const [error, setError] = useState('');
  const [name, setName]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [gapsOnly, setGapsOnly] = useState(false);

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
          const shown      = gapsOnly ? withGaps : rows;
          return (<>
          <div className={styles.create}>
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
                <th>Supplier <HelpDot k="col.supplier" placement="bottom" /></th>
                <th>Relationships <HelpDot k="suppliers.col.relationships" placement="bottom" /></th>
                <th>Contracted by <HelpDot k="suppliers.col.contracted_by" placement="bottom" /></th>
                <th>Criticality <HelpDot k="suppliers.col.criticality" placement="bottom" /></th>
                <th>Assurance <HelpDot k="suppliers.col.assurance" placement="bottom" /></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(s => (
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
