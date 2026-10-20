// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import styles from './SupplierRelationshipForm.module.css';
import { DateField } from './DateField';

const EMPTY = { kind: '', title: '', reference: '', url: '', issued_on: '', expires_on: '' };

// Record (or edit) ONE piece of assurance evidence — an assurance report, or
// terms in the contract (decision 5) — and say which control objectives it
// covers. One piece rarely covers everything: the relationship can hold as many
// as it needs, and a control objective is covered when any current one covers it.
// So the list separates what no other evidence covers yet from what it already does.
export function SupplierEvidenceForm({ objectives, evidence = [], editingId = null, initial = null, onSubmit, onCancel, submitLabel = 'Save evidence' }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initial || {}) }));
  const [ticked, setTicked] = useState(() => new Set(initial?.control_ids || []));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const toggle = (id) => setTicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const isReport = form.kind === 'report';
  const noun = isReport ? 'report' : form.kind === 'contract_terms' ? 'contract' : 'evidence';
  // Covered by some OTHER current evidence (this one excluded when editing it).
  const coveredElsewhere = (o) => evidence.some(e => e.id !== editingId && e.is_current && e.control_ids.includes(o.control_id));
  const notCovered = objectives.filter(o => !coveredElsewhere(o));
  const alreadyCovered = objectives.filter(coveredElsewhere);

  async function submit(e) {
    e.preventDefault();
    if (!form.kind) return setError('Choose the evidence type: an assurance report, or terms in the contract.');
    if (!form.title.trim()) return setError(isReport ? 'Enter the name of the report.' : 'Enter the contract and the clause.');
    if (isReport && !form.expires_on) return setError('Enter the date the report is valid until. An assurance report covers a fixed period.');
    if (!ticked.size) return setError(`Tick at least one control objective that this ${noun} covers.`);
    setBusy(true); setError('');
    try {
      const body = { control_ids: [...ticked] };
      for (const k of Object.keys(EMPTY)) body[k] = form[k] === '' ? null : form[k];
      await onSubmit(body);
    } catch (err) {
      setError(err?.response?.data?.error || 'The evidence was not saved.');
    } finally {
      setBusy(false);
    }
  }

  const box = (o) => (
    <label key={o.control_id} className={styles.check}>
      <input type="checkbox" checked={ticked.has(o.control_id)} onChange={() => toggle(o.control_id)} />
      <span>{o.ref && <b>{o.ref} </b>}{o.title}</span>
    </label>
  );

  return (
    <form className={styles.form} onSubmit={submit}>
      <p className={styles.step}>1. What is the evidence?</p>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Evidence type</span>
          <select value={form.kind} onChange={set('kind')} aria-label="Evidence type">
            <option value="">— choose —</option>
            <option value="report">Assurance report (e.g. SOC 2, certification audit report)</option>
            <option value="contract_terms">Terms in the contract</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>{form.kind === 'contract_terms' ? 'Contract and clause' : 'Name of the report'}</span>
          <input value={form.title} onChange={set('title')} aria-label="Evidence title"
                 placeholder={form.kind === 'contract_terms' ? 'e.g. Master services agreement, clause 14' : 'e.g. SOC 2 Type II report 2026'} />
        </label>
        <label className={styles.field}>
          <span>{form.kind === 'contract_terms' ? 'Reference (optional)' : 'Issued by (optional)'}</span>
          <input value={form.reference || ''} onChange={set('reference')} aria-label="Evidence reference" />
        </label>
        <label className={styles.field}>
          <span>Issued on (optional)</span>
          <DateField value={form.issued_on || ''} onChange={set('issued_on')} aria-label="Issued on" />
        </label>
        <label className={styles.field}>
          <span>{form.kind === 'contract_terms' ? 'Terms end on (leave blank: they end with the contract)' : 'Valid until (required for a report)'}</span>
          <DateField value={form.expires_on || ''} onChange={set('expires_on')} aria-label="Valid until" />
        </label>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>Link to the document (optional)</span>
          <input value={form.url || ''} onChange={set('url')} placeholder="https://…" aria-label="Evidence link" />
        </label>
      </div>

      <p className={styles.step}>2. Which control objectives does this {noun} cover?</p>
      <p className={styles.hint}>
        Tick each control objective that this {noun} gives evidence for. It does not have to cover all of them — you
        can record other reports or contract terms for the rest. Any control objective that no current evidence
        covers stays open. <b>{ticked.size} ticked.</b>
      </p>

      <div className={styles.group}>
        <div className={styles.groupHead}>
          <span>Not covered by any other current evidence ({notCovered.length})</span>
          {notCovered.length > 0 && (
            <span>
              <button type="button" className={styles.linkish}
                onClick={() => setTicked(s => new Set([...s, ...notCovered.map(o => o.control_id)]))}>Tick all {notCovered.length}</button>
              {' · '}
              <button type="button" className={styles.linkish}
                onClick={() => setTicked(s => { const n = new Set(s); notCovered.forEach(o => n.delete(o.control_id)); return n; })}>Untick all</button>
            </span>
          )}
        </div>
        {notCovered.length ? <div className={styles.checks}>{notCovered.map(box)}</div>
          : <p className={styles.hint}>Every control objective is already covered by other current evidence.</p>}
      </div>

      {alreadyCovered.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span>Already covered by other current evidence ({alreadyCovered.length}) — tick these too if this {noun} also covers them</span>
          </div>
          <div className={styles.checks}>{alreadyCovered.map(box)}</div>
        </div>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.buttons}>
        <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button className={styles.secondary} type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
