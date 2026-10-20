// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useMemo, useState } from 'react';
import { getSystems, getDepartments, listComponents } from '../api';
import { useAuth } from '../context/AuthContext';
import { SUPPLIER_TYPES, SUPPLIER_STATUSES, supplierType } from '../utils/supplierTypes';
import { COMPONENT_TYPE_LABEL } from '../utils/componentTypes';
import styles from './SupplierRelationshipForm.module.css';
import { DateField } from './DateField';

const DEPT_SCOPED = new Set(['information_asset_owner', 'information_asset_manager']);
const EMPTY = {
  relationship_type: '', department_id: '', system_id: '', component_id: '', status: '',
  description: '', contract_ref: '', contract_url: '', contract_start: '', contract_end: '',
};

// Record or edit one relationship with a supplier. The type decides what it is
// recorded against — a system, a component of a given component type, or both — so the
// form offers only the pickers that type takes, and the database refuses the
// rest. Status has no default: whether it is live is a fact to state.
export function SupplierRelationshipForm({ initial = null, onSubmit, onCancel, submitLabel = 'Save' }) {
  const { user, departmentIsolation } = useAuth();
  const seatBound = departmentIsolation && DEPT_SCOPED.has(user?.role);
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initial || {}),
    department_id: initial?.department_id || (seatBound ? user?.department_id || '' : '') }));
  const [systems, setSystems] = useState([]);
  const [depts, setDepts] = useState([]);
  const [components, setComponents] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSystems().then(d => setSystems((Array.isArray(d) ? d : d?.systems || []).filter(s => s.is_active !== false)))
      .catch(() => setSystems([]));
    getDepartments().then(d => setDepts(Array.isArray(d) ? d : d?.departments || [])).catch(() => setDepts([]));
    listComponents().then(setComponents).catch(() => setComponents([]));
  }, []);

  const type = supplierType(form.relationship_type);
  const componentChoices = useMemo(() => {
    if (!type || !type.componentTypes.length) return [];
    return components.filter(c => type.componentTypes.includes(c.component_type))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [components, type]);
  const sortedSystems = useMemo(() => [...systems].sort((a, b) => a.name.localeCompare(b.name)), [systems]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  function changeType(e) {
    const next = supplierType(e.target.value);
    // Drop what the new type does not take, so a stale id is never submitted.
    setForm(f => ({ ...f, relationship_type: e.target.value,
      system_id: next?.system === 'none' ? '' : f.system_id,
      component_id: next && !next.componentTypes.length ? '' : f.component_id }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.relationship_type) return setError('Choose the supplier type.');
    if (!form.status) return setError('Say whether it is proposed, active, exiting or ended.');
    if (type.system === 'required' && !form.system_id) return setError('Choose the system.');
    if (type.componentRequired && !form.component_id) return setError('Choose the component.');
    setBusy(true); setError('');
    try {
      const body = {};
      for (const k of Object.keys(EMPTY)) body[k] = form[k] === '' ? null : form[k];
      if (seatBound) delete body.department_id; // the server uses the seat
      await onSubmit(body);
    } catch (err) {
      setError(err?.response?.data?.error || 'The relationship was not saved.');
    } finally {
      setBusy(false);
    }
  }

  const componentLabel = type?.componentTypes.map(t => COMPONENT_TYPE_LABEL[t] || t).join(' or ');

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Supplier type</span>
          <select value={form.relationship_type} onChange={changeType} aria-label="Supplier type">
            <option value="">— choose —</option>
            {SUPPLIER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Status</span>
          <select value={form.status} onChange={set('status')} aria-label="Status">
            <option value="">— choose —</option>
            {SUPPLIER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>
      {type && <p className={styles.hint}>{type.hint}</p>}

      {type && (
        <div className={styles.grid}>
          {type.system === 'required' && (
            <label className={styles.field}>
              <span>{type.value === 'service_provider' ? 'System it hosts' : 'System it operates'}</span>
              <select value={form.system_id || ''} onChange={set('system_id')} aria-label="System">
                <option value="">— choose a system —</option>
                {sortedSystems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          {type.componentTypes.length > 0 && (
            <label className={styles.field}>
              <span>{componentLabel} component{type.componentRequired ? '' : ' (optional)'}</span>
              <select value={form.component_id || ''} onChange={set('component_id')} aria-label="Component">
                <option value="">{type.componentRequired ? '— choose a component —' : '— none —'}</option>
                {componentChoices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Contracting department — owns the relationship</span>
          <select value={form.department_id || ''} onChange={set('department_id')} disabled={seatBound}
                  title={seatBound ? 'You record relationships for your own department' : undefined}
                  aria-label="Contracting department">
            <option value="">— choose —</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Contract reference</span>
          <input value={form.contract_ref || ''} onChange={set('contract_ref')} aria-label="Contract reference" />
        </label>
        <label className={styles.field}>
          <span>Contract starts</span>
          <DateField value={form.contract_start || ''} onChange={set('contract_start')} aria-label="Contract starts" />
        </label>
        <label className={styles.field}>
          <span>Contract ends</span>
          <DateField value={form.contract_end || ''} onChange={set('contract_end')} aria-label="Contract ends" />
        </label>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>Link to the contract</span>
          <input value={form.contract_url || ''} onChange={set('contract_url')} placeholder="https://…" aria-label="Link to the contract" />
        </label>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>What they do for us</span>
          <input value={form.description || ''} onChange={set('description')} aria-label="What they do for us" />
        </label>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.buttons}>
        <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button className={styles.secondary} type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
