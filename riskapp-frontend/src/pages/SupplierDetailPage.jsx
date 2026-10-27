// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from '../components/HelpDot';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  getSupplier, updateSupplier, deleteSupplier,
  createSupplierRelationship, updateSupplierRelationship, deleteSupplierRelationship,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useViewMode } from '../hooks/useViewMode';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { EntityKind } from '../components/EntityKind';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { SupplierRelationshipForm } from '../components/SupplierRelationshipForm';
import { SupplierRelationshipCard } from '../components/SupplierRelationshipCard';
import { SupplierCriticality } from '../components/SupplierCriticality';
import { seatCanWrite } from '../utils/seatScope';
import styles from './ScopesPage.module.css';

// One supplier and the relationships we have with it. Each relationship is
// owned by the department that contracts it; an IAM/IAO records and edits their
// own department's. A relationship that has run its course is ENDED — deleting
// is for one recorded in error.
export function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // ?relationship=<id>: opened for one relationship (a finding links here), so
  // its assurance starts open and scrolls into view.
  const [search] = useSearchParams();
  const focusRel = search.get('relationship');
  const { user, hasCapability, departmentIsolation } = useAuth();
  const canWrite = hasCapability('suppliers.write');
  const viewMode = useViewMode();
  const [data, setData]         = useState(null);
  const [error, setError]       = useState('');
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState('');
  const [notes, setNotes]       = useState('');
  const [adding, setAdding]     = useState(false);
  const [editRel, setEditRel]   = useState(null);

  const load = useCallback(async () => {
    try { setData(await getSupplier(id)); setError(''); }
    catch (err) { setError(err?.response?.status === 404 ? 'Supplier not found.' : 'Could not load the supplier.'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setError('');
    try { await fn(); await load(); }
    catch (err) { setError(err?.response?.data?.error || 'That change was not saved.'); }
  };

  if (!data) {
    return <Shell><div className={styles.page}><BackButton fallback="/suppliers" />{error && <div className={styles.error} role="alert">{error}</div>}</div></Shell>;
  }
  const canEditRel = (r) => canWrite && seatCanWrite(user, departmentIsolation, r.department_id);

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/suppliers" />
        <div className={styles.header}>
          <div>
            {editing ? (
              <div className={styles.create}>
                <input className={styles.input} value={name} onChange={e => setName(e.target.value)} aria-label="Supplier name" maxLength={200} />
                <input className={styles.input} value={notes} onChange={e => setNotes(e.target.value)} aria-label="Notes" placeholder="Notes" />
                <button className={styles.primary} onClick={() => run(async () => { await updateSupplier(id, { name, notes }); setEditing(false); })}>Save</button>
                <button className={styles.secondary} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <h1 className={styles.title}>{data.name}<EntityKind kind="supplier" /> <HelpDot k="supplier_detail.title" placement="bottom" /></h1>
                {data.notes && <p className={styles.desc}>{data.notes}</p>}
              </>
            )}
          </div>
          <div className={styles.actions}>
            <ViewModeToggle {...viewMode} />
            {canWrite && !editing && (
              <>
                <button className={styles.secondary} onClick={() => { setName(data.name); setNotes(data.notes ?? ''); setEditing(true); }}>Edit</button>
                {data.relationships.length === 0 && (
                  <button className={styles.danger}
                    onClick={() => run(async () => { await deleteSupplier(id); navigate('/suppliers'); })}>Delete supplier</button>
                )}
              </>
            )}
            {!canWrite && <ReadOnlyBadge reason="Recording suppliers needs the suppliers.write capability." />}
          </div>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <SupplierCriticality supplierName={data.name} relationships={data.relationships} isExpert={viewMode.isExpert} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Relationships <HelpDot k="supplier_detail.relationships" placement="bottom" /> <span className={styles.count}>{data.relationships.length}</span></h2>
          <p className={styles.note}>
            Each relationship is one thing we have with this supplier. Its assurance — the control objectives it must
            meet, and the evidence that shows it — is shown with it.
          </p>
          {data.relationships.length === 0 && (
            <p className={styles.muted}>None recorded{departmentIsolation && canWrite ? ' that concern your department' : ''}.</p>
          )}
          {data.relationships.map(r => (
            editRel?.id === r.id ? (
              <SupplierRelationshipForm key={r.id} initial={editRel} submitLabel="Save relationship"
                onCancel={() => setEditRel(null)}
                onSubmit={async (body) => { await updateSupplierRelationship(editRel.id, body); setEditRel(null); await load(); }} />
            ) : (
              <SupplierRelationshipCard key={r.id} relationship={r} isExpert={viewMode.isExpert}
                canEdit={canEditRel(r)} onChanged={load} focus={r.id === focusRel}
                onEdit={() => { setAdding(false); setEditRel(r); }}
                onDelete={() => run(() => deleteSupplierRelationship(r.id))} />
            )
          ))}

          {canWrite && !editRel && (adding ? (
            <SupplierRelationshipForm submitLabel="Record relationship" onCancel={() => setAdding(false)}
              onSubmit={async (body) => { await createSupplierRelationship(id, body); setAdding(false); await load(); }} />
          ) : (
            <div><button className={styles.primary} onClick={() => setAdding(true)}>Record a relationship</button></div>
          ))}
        </section>
      </div>
    </Shell>
  );
}
