// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The lifecycle of a policy or document (v139): what kind it is, which version is
// in force, who owns and approved it, when it must next be reviewed, and where it
// actually lives — CIRKS links to the document management system rather than
// storing the file. ISO 27001 clause 7.5 expects documented information to be
// controlled; the review date is also the GV.PO-02 evidence.
//
// The state is derived from it: a Published document past its review date reads
// as Under review everywhere, on the day it falls due, without anyone changing it.
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateComponent, getUsers } from '../api';
import { componentStatusOptions } from '../utils/componentTypes';
import { PersonSelect } from './PersonSelect';
import { roleLabel } from '../utils/roles';
import styles from './DocumentLifecycle.module.css';
import { DateField } from './DateField';

const KINDS = [
  { value: '',          label: 'not stated' },
  { value: 'policy',    label: 'Policy' },
  { value: 'standard',  label: 'Standard' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'guideline', label: 'Guideline' },
];
const KIND_HINT = {
  policy:    'Says what and why; approved at the top.',
  standard:  'Makes a policy specific and mandatory.',
  procedure: 'Says how, step by step.',
  guideline: 'Advisory — nobody is bound by it, so it cannot deliver a control.',
};

const fmt = (d) => d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : null;
const ymd = (d) => (d ? String(d).slice(0, 10) : '');

export function DocumentLifecycle({ component, onSaved }) {
  const { hasCapability } = useAuth();
  const canEdit = hasCapability('components.write');
  const [editing, setEditing] = useState(false);
  const [users, setUsers]     = useState([]);
  const [form, setForm]       = useState({});
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');

  useEffect(() => { if (editing && !users.length) getUsers().then(u => setUsers(u || [])).catch(() => {}); },
    [editing, users.length]);

  function open() {
    setForm({
      // Status sits with the review date so a document can be published and
      // given its date in one save — a published document must have one (v141).
      status: component.status || 'unknown',
      document_kind: component.document_kind || '',
      document_version: component.document_version || '',
      document_owner_id: component.document_owner_id || '',
      document_approved_by: component.document_approved_by || '',
      document_approved_on: ymd(component.document_approved_on),
      document_next_review: ymd(component.document_next_review),
      document_url: component.document_url || '',
    });
    setErr(''); setEditing(true);
  }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await updateComponent(component.id, form); setEditing(false); await onSaved(); }
    catch (ex) { setErr(ex.response?.data?.error || 'Could not save.'); }
    finally { setBusy(false); }
  }

  const overdue = component.review_overdue;
  // "Name — Role": owner and approver are role-driven.
  const userName = (id, name, role) => {
    const n = name || users.find(u => u.id === id)?.full_name;
    const r = role || users.find(u => u.id === id)?.role;
    return n ? (r ? `${n} — ${roleLabel(r)}` : n) : null;
  };

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>Document</h2>
        {canEdit && !editing && <button className={styles.btnEdit} onClick={open}>Edit</button>}
      </div>

      {overdue && (
        <p className={styles.overdue}>
          Review overdue since {fmt(ymd(component.document_next_review))}. It reads as <strong>Under review</strong> on
          every system that relies on it until a new review date is recorded.
        </p>
      )}

      {!editing ? (
        <dl className={styles.grid}>
          <dt>Kind</dt>
          <dd>{KINDS.find(k => k.value === (component.document_kind || ''))?.label}
            {component.document_kind && <span className={styles.hint}> — {KIND_HINT[component.document_kind]}</span>}</dd>
          <dt>Version</dt><dd>{component.document_version || '—'}</dd>
          <dt>Owner</dt><dd>{userName(component.document_owner_id, component.document_owner_name, component.document_owner_role) || '—'}</dd>
          <dt>Approved / published</dt>
          <dd>{component.document_approved_on
            ? <>{fmt(ymd(component.document_approved_on))}{component.document_approved_by_name && <> by {userName(component.document_approved_by, component.document_approved_by_name, component.document_approved_by_role)}</>}</>
            : '—'}</dd>
          <dt>Next review</dt>
          <dd className={overdue ? styles.late : undefined}>{fmt(ymd(component.document_next_review)) || '—'}</dd>
          <dt>Where it lives</dt>
          <dd>{component.document_url
            ? <a href={component.document_url} target="_blank" rel="noopener noreferrer">{component.document_url}</a>
            : '—'}</dd>
        </dl>
      ) : (
        <form className={styles.form} onSubmit={save}>
          <label>Kind
            <select value={form.document_kind} onChange={set('document_kind')}>
              {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label>Status
            <select value={form.status} onChange={set('status')}>
              {componentStatusOptions('information').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>Version<input value={form.document_version} onChange={set('document_version')} placeholder="e.g. 2.1" /></label>
          {/* Owner and approver are chosen by role, so each person is shown with
              theirs (and their department) — the shared PersonSelect, as on every
              other owner picker. */}
          <label>Owner
            <PersonSelect users={users} value={form.document_owner_id}
              onChange={v => setForm(f => ({ ...f, document_owner_id: v || '' }))} placeholder="—" />
          </label>
          <label>Approved by
            <PersonSelect users={users} value={form.document_approved_by}
              onChange={v => setForm(f => ({ ...f, document_approved_by: v || '' }))} placeholder="—" />
          </label>
          <label>Approved / published on<DateField value={form.document_approved_on} onChange={set('document_approved_on')} /></label>
          <label>Next review<DateField value={form.document_next_review} onChange={set('document_next_review')} /></label>
          <label className={styles.wide}>Where it lives (link)
            <input type="url" value={form.document_url} onChange={set('document_url')} placeholder="https://…" />
          </label>
          {form.status === 'operational' && !form.document_next_review && (
            <p className={styles.wide + ' ' + styles.hint}>A published document must have a next review date.</p>
          )}
          {form.document_kind === 'guideline' && (
            <p className={styles.wide + ' ' + styles.hint}>{KIND_HINT.guideline}</p>
          )}
          {err && <p className={`${styles.wide} ${styles.err}`}>{err}</p>}
          <div className={`${styles.wide} ${styles.buttons}`}>
            <button type="button" className={styles.btnCancel} onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button type="submit" className={styles.btnSave} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
    </section>
  );
}
