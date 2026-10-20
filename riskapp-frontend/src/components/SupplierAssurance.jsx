// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createSupplierEvidence, updateSupplierEvidence, deleteSupplierEvidence } from '../api';
import { SupplierEvidenceForm } from './SupplierEvidenceForm';
import { ControlStatusPill } from './ControlStatusPill';
import { supplierTypeLabel, fmtDay } from '../utils/supplierTypes';
import styles from './SupplierRelationshipCard.module.css';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "SOC 2 report 2026 (valid until 31 Mar 2027)"
export function evidenceLabel(e) {
  const until = e.effective_expiry
    ? `${e.is_current ? 'valid until' : 'expired'} ${fmtDay(e.effective_expiry)}`
    : 'valid while the contract runs';
  return `${e.title} (${until})`;
}

// For one control objective: the current evidence covering it, and any expired.
export function coverageOf(objective, evidence) {
  const covering = evidence.filter(e => e.control_ids.includes(objective.control_id));
  return { current: covering.filter(e => e.is_current), expired: covering.filter(e => !e.is_current) };
}

// One relationship's assurance (v144): the control objectives it must meet, and
// the evidence — assurance reports and contract terms — recorded to show it. Any
// number of pieces of evidence can be recorded; a control objective is covered
// when at least one CURRENT piece covers it. What nothing covers stays open.
export function SupplierAssurance({ relationship: r, canEdit, onChanged }) {
  const [adding, setAdding]           = useState(false);
  const [editing, setEditing]         = useState(null);
  const [showCovered, setShowCovered] = useState(false);
  // Folded by default: the summary line says how it stands; open it for detail.
  const [open_, setOpen]              = useState(false);
  const [error, setError]             = useState('');
  const objectives = r.objectives || [];
  const evidence   = r.evidence || [];
  const covered    = objectives.filter(o => o.met);
  const open       = objectives.filter(o => !o.met);
  const everySupplier = objectives.filter(o => o.sources.includes('all')).length;
  // v146: an objective deployed on the system that the supplier is relied on to deliver.
  const deliveredHere = objectives.filter(o => o.sources.length === 1 && o.sources[0] === 'delivered_here').length;
  const typeOnly      = objectives.length - everySupplier - deliveredHere;
  const f    = r.assurance_finding;
  const live = ['active', 'exiting'].includes(r.status);
  // Gaps first; covered ones folded away once there is something to fold.
  const rows = open.length && covered.length && !showCovered ? open : [...open, ...covered];

  const run = async (fn) => {
    setError('');
    try { await fn(); await onChanged(); }
    catch (err) { setError(err?.response?.data?.error || 'That change was not saved.'); }
  };

  if (!objectives.length) {
    return (
      <section className={styles.body}>
        <h3 className={styles.h3}>Assurance</h3>
        <p className={styles.explain}>
          No control objectives are expected of this supplier type yet — see <Link to="/suppliers/control-sets">supplier control sets</Link>.
        </p>
      </section>
    );
  }

  const expanded = open_ || Boolean(adding || editing);
  return (
    <section className={`${styles.body} ${open.length ? styles.gap : styles.ok}`}>
      <button type="button" className={styles.foldHead} aria-expanded={expanded} onClick={() => setOpen(v => !v)}>
        <span className={styles.chevron} aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span className={styles.h3}>Assurance</span>
        <span className={styles.foldSummary}>
          <b>{covered.length} of {objectives.length}</b> control objectives met
          {open.length === 0
            ? <span className={styles.yes}> — all met</span>
            : <span className={styles.no}> — {open.length} not met</span>}
          {f && !f.accepted_until && !f.action_id && <span className={styles.no}> · open finding</span>}
          {f?.action_id && <span> · action open</span>}
          {f?.accepted_until && <span> · gap accepted until {fmtDay(f.accepted_until)}</span>}
        </span>
        <span className={styles.foldHint}>{expanded ? 'Hide details' : 'Show details'}</span>
      </button>

      {expanded && (<>
      <p className={styles.explain}>
        A control objective is met when current evidence covers it. This relationship must meet {plural(everySupplier, 'control objective')} expected of every supplier
        {typeOnly > 0 && <>, plus {typeOnly} for its supplier type, {supplierTypeLabel(r.relationship_type)}</>}
        {deliveredHere > 0 && <>, plus {deliveredHere} it is relied on to deliver on {r.system_name || 'the system'} (its security solutions say the supplier provides {deliveredHere === 1 ? 'it' : 'them'})</>}
        {' '}(<Link to="/suppliers/control-sets">supplier control sets</Link>). Evidence is an assurance report or
        terms in the contract, and one piece of evidence does not have to cover them all: record as many as you
        need. One current piece covering a control objective is enough.
      </p>

      {f ? (
        <p className={styles.finding}>
          <b>Open finding:</b> {plural(f.unmet_count, 'control objective')} not met — no current evidence covers {f.unmet_count === 1 ? 'it' : 'them'}
          {f.reason === 'expired' && ', including some whose evidence has expired'}.{' '}
          {f.accepted_until ? <>The gap has been accepted until {fmtDay(f.accepted_until)}.</>
            : f.action_id ? <>An <Link to={`/actions/${f.action_id}`}>action</Link> is open to close it.</>
            : <>Record the missing evidence, or raise an action or accept the gap on the <Link to="/findings">findings page</Link>.</>}
        </p>
      ) : !live && open.length > 0 ? (
        <p className={styles.explain}>
          This is not an open finding yet: the relationship is {r.status}, so no contract is in force.
        </p>
      ) : null}

      <h4 className={styles.h4}>Control objectives</h4>
      <table className={styles.objTable}>
        <thead><tr><th>Control objective</th><th>Met?</th><th>Met by</th></tr></thead>
        <tbody>
          {rows.map(o => {
            const c = coverageOf(o, evidence);
            return (
              <tr key={o.control_id}>
                <td>
                  {o.ref && <span className={styles.ref}>{o.ref}</span>}
                  <Link to={`/controls/${o.control_id}`}>{o.title}</Link>
                  {o.objective_status === 'not_applicable' && <> <ControlStatusPill status="not_applicable" /></>}
                </td>
                <td>{o.met ? <span className={styles.yes}>Yes</span> : <span className={styles.no}>No</span>}</td>
                <td>
                  {c.current.length > 0 ? c.current.map(evidenceLabel).join('; ')
                    : c.expired.length > 0 ? <>Only by expired evidence: {c.expired.map(evidenceLabel).join('; ')}</>
                    : 'No evidence recorded covers this'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {open.length > 0 && covered.length > 0 && (
        <button className={styles.toggle} onClick={() => setShowCovered(v => !v)}>
          {showCovered ? `Hide the ${covered.length} control objectives that are met` : `Also show the ${covered.length} control objectives that are met`}
        </button>
      )}

      <h4 className={styles.h4}>Evidence recorded ({evidence.length})</h4>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {evidence.length === 0 ? (
        <p className={styles.explain}>No assurance reports or contract terms have been recorded for this relationship.</p>
      ) : (
        <table className={styles.objTable}>
          <thead><tr><th>Evidence</th><th>Evidence type</th><th>Valid until</th><th>Covers</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {evidence.map(e => (
              <tr key={e.id}>
                <td>
                  {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}
                  {e.reference && <span className={styles.sub}>{e.reference}</span>}
                </td>
                <td>{e.kind === 'report' ? 'Assurance report' : 'Contract terms'}</td>
                <td>
                  {e.effective_expiry ? fmtDay(e.effective_expiry) : 'while the contract runs'}
                  {!e.is_current && <span className={styles.no}> — expired</span>}
                  {e.kind === 'contract_terms' && !e.expires_on && e.effective_expiry && <span className={styles.sub}>when the contract ends</span>}
                </td>
                <td>{plural(e.control_ids.length, 'control objective')}</td>
                {canEdit && (
                  <td>
                    <span className={styles.actions}>
                      <button className={styles.linkBtn} onClick={() => { setAdding(false); setEditing(e); }}>Edit</button>
                      <button className={styles.linkBtn}
                        title="Only for evidence recorded in error. Evidence that has lapsed stays on the record."
                        onClick={() => run(() => deleteSupplierEvidence(e.id))}>Delete</button>
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <SupplierEvidenceForm key={editing.id} objectives={objectives} evidence={evidence} editingId={editing.id}
          submitLabel="Save changes"
          initial={{ ...editing, reference: editing.reference || '', url: editing.url || '',
                     issued_on: editing.issued_on || '', expires_on: editing.expires_on || '' }}
          onCancel={() => setEditing(null)}
          onSubmit={async (body) => { await updateSupplierEvidence(editing.id, body); setEditing(null); await onChanged(); }} />
      )}
      {canEdit && !editing && (adding ? (
        <SupplierEvidenceForm objectives={objectives} evidence={evidence} onCancel={() => setAdding(false)}
          onSubmit={async (body) => { await createSupplierEvidence(r.id, body); setAdding(false); await onChanged(); }} />
      ) : (
        <button className={styles.secondary} onClick={() => setAdding(true)}>Record an assurance report or contract terms</button>
      ))}
      </>)}
    </section>
  );
}
