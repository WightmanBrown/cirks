// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { updateSoaEntry, rateControl, getScopes, updateControl } from '../api';
import { MaturityChip } from './MaturityChip';
import { maturityWord } from '../utils/ratingScale';
import { DRIVERS, IMPLEMENTATION_STATUSES, IMPLEMENTATION_LABEL, DELIVERY_MODES, DELIVERY_LABEL } from '../utils/soaVocabulary';
import { explainImplementation, partialQualifier } from '../utils/implementationStatus';
import { EffectivenessDots } from './ControlBadges';
import styles from './ObjectiveDecision.module.css';

// The objective page edits what the SoA register reports (2026-09-22). Two forms:
//
//   DecisionForm       — the SoA's own subject: does it apply, why, and drivers.
//   ImplementationForm — how our control meets it: status, a one-line "how", and
//                        maturity. Part of the control, so shown in Edit control mode.
//
// A failed save KEEPS what was typed and says so. The SoA page used to roll a
// failure back to the server's last values and lost someone's afternoon of edits;
// that lesson moved here with the editing.

export function DecisionForm({ controlId, soa, treatsLine, onSaved, onCancel }) {
  const [applies, setApplies] = useState(soa?.decided ? !!soa.applicable : true);
  const [why, setWhy]         = useState(soa?.justification ?? '');
  const [drivers, setDrivers] = useState(new Set(soa?.drivers || []));
  // Where it applies (v126): the whole organisation unless narrowed to scopes.
  const [allScopes, setAllScopes] = useState([]);
  const [narrowed, setNarrowed]   = useState((soa?.scopes || []).length > 0);
  const [scopeIds, setScopeIds]   = useState(new Set((soa?.scopes || []).map(s => s.id)));
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');

  useEffect(() => {
    getScopes().then(d => setAllScopes(d.scopes || [])).catch(() => setAllScopes([]));
  }, []);
  const toggleScope = (id) => setScopeIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggle = (d) => setDrivers(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });

  async function save() {
    if (!applies && !why.trim()) { setErr('Say why it does not apply — an exclusion needs a reason.'); return; }
    if (applies && narrowed && scopeIds.size === 0) { setErr('Choose at least one scope, or apply it to the whole organisation.'); return; }
    setBusy(true); setErr('');
    try {
      const body = { applicable: applies, justification: why, drivers: [...drivers] };
      if (applies) body.scope_ids = narrowed ? [...scopeIds] : [];
      const res = await updateSoaEntry(controlId, body);
      const scopes = applies && narrowed ? allScopes.filter(s => scopeIds.has(s.id)).map(({ id, name }) => ({ id, name })) : [];
      onSaved({ ...body, decided: true, scopes }, res.control_status);
    } catch (e) {
      setErr(e?.response?.data?.error || 'The decision was not saved. What you typed is still here — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.choice} role="radiogroup" aria-label="Does this objective apply?">
        <label><input type="radio" checked={applies} onChange={() => setApplies(true)} /> It applies — adopt it</label>
        <label><input type="radio" checked={!applies} onChange={() => setApplies(false)} /> It does not apply</label>
      </div>

      {applies && (
        <div className={styles.field}>
          <span className={styles.label}>Applies in</span>
          <div className={styles.choice} role="radiogroup" aria-label="Where it applies">
            <label><input type="radio" checked={!narrowed} onChange={() => setNarrowed(false)} /> The whole organisation</label>
            <label><input type="radio" checked={narrowed} onChange={() => setNarrowed(true)} disabled={!allScopes.length} /> Only in these scopes</label>
          </div>
          {!allScopes.length && <span className={styles.hint}>No scopes have been drawn yet (Security Controls → Scopes).</span>}
          {narrowed && (
            <div className={styles.chips}>
              {allScopes.map(s => (
                <button key={s.id} type="button" aria-pressed={scopeIds.has(s.id)}
                        className={`${styles.chip} ${styles.scopeChip} ${scopeIds.has(s.id) ? styles.chipOn : ''}`}
                        onClick={() => toggleScope(s.id)}>{s.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <label className={styles.field}>
        <span className={styles.label}>{applies ? 'Why it applies' : 'Why it does not apply (required)'}</span>
        <textarea className={styles.input} rows={2} value={why} onChange={e => setWhy(e.target.value)}
                  placeholder={applies ? 'e.g. Required by our information risk management policy' : 'e.g. We hold no cardholder data'} />
      </label>
      {applies && treatsLine && why.trim() !== treatsLine && (
        <button type="button" className={styles.linkBtn} onClick={() => { setWhy(treatsLine); setDrivers(p => new Set(p).add('risk')); }}>
          Use: “{treatsLine}”
        </button>
      )}

      <div className={styles.field}>
        <span className={styles.label}>Drivers</span>
        <div className={styles.chips}>
          {DRIVERS.map(d => (
            <button key={d} type="button" aria-pressed={drivers.has(d)}
                    className={`${styles.chip} ${drivers.has(d) ? styles.chipOn : ''}`} onClick={() => toggle(d)}>{d}</button>
          ))}
        </div>
      </div>

      {err && <p className={styles.error} role="alert">{err}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.save} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save decision'}</button>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

export function ImplementationForm({ controlId, soa, control, onSaved }) {
  const [delivery, setDelivery] = useState(control?.delivery ?? null);
  // The STATED value — what a person typed. For a control delivered on each
  // system the displayed status is derived instead (v129) and is not editable.
  const statedStatus = soa?.stated_status ?? soa?.implementation_status ?? 'not_implemented';
  const [status, setStatus] = useState(statedStatus);
  const [how, setHow]       = useState(soa?.implementation_description ?? '');
  const [level, setLevel]   = useState(control?.effectiveness ?? 0);
  const [evidence, setEvidence] = useState(control?.effectiveness_notes ?? '');
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');
  const [done, setDone]     = useState('');

  const derived = delivery === 'system';
  const statusChanged = !derived && status !== statedStatus;
  const implChanged = statusChanged || how !== (soa?.implementation_description ?? '');
  const ratingChanged = level !== (control?.effectiveness ?? 0) || evidence !== (control?.effectiveness_notes ?? '');
  const deliveryChanged = delivery !== (control?.delivery ?? null);

  async function save() {
    if (ratingChanged && level && !evidence.trim()) { setErr('Evidence is required for a maturity rating.'); return; }
    setBusy(true); setErr(''); setDone('');
    try {
      const patch = {};
      if (deliveryChanged) {
        const r = await updateControl(controlId, { delivery });
        Object.assign(patch, { control: { ...(patch.control || {}), delivery: r.control.delivery } });
      }
      if (implChanged) {
        await updateSoaEntry(controlId, {
          ...(statusChanged ? { implementation_status: status } : {}), implementation_description: how });
        Object.assign(patch, { soa: statusChanged
          ? { implementation_status: status, stated_status: status, implementation_description: how || null }
          : { implementation_description: how || null } });
      }
      if (ratingChanged && level) {
        const r = await rateControl(controlId, { effectiveness: level, effectiveness_notes: evidence.trim() });
        Object.assign(patch, { control: { ...(patch.control || {}), ...r.control } });
      }
      onSaved(patch);
      setDone('Saved.');
    } catch (e) {
      setErr(e?.response?.data?.error || 'Not saved. What you entered is still here — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <span className={styles.label}>How it is delivered — one mode only</span>
        <div className={styles.choice} role="radiogroup" aria-label="How it is delivered">
          {DELIVERY_MODES.map(m => (
            <label key={m.value} title={m.hint}>
              <input type="radio" checked={delivery === m.value} onChange={() => setDelivery(m.value)} /> {m.label}
            </label>
          ))}
        </div>
        {delivery === 'group' && (
          <span className={styles.hint}>The group is the people component linked to this objective.</span>
        )}
      </div>
      {derived ? (
        <div className={styles.field}>
          <span className={styles.label}>Implementation status</span>
          {control?.delivery === 'system' ? (
            <DerivedStatus soa={soa} />
          ) : (
            <span className={styles.hint}>Derived from the systems once saved — it is not typed for a control delivered on each system.</span>
          )}
        </div>
      ) : (
        <label className={styles.field}>
          <span className={styles.label}>Implementation status</span>
          <select className={styles.select} value={status} onChange={e => setStatus(e.target.value)}>
            {IMPLEMENTATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      )}
      <label className={styles.field}>
        <span className={styles.label}>How it is implemented, in one line (shown in the SoA)</span>
        <textarea className={styles.input} rows={2} value={how} onChange={e => setHow(e.target.value)}
                  placeholder="e.g. Provided by our endpoint management platform" />
      </label>
      <div className={styles.field}>
        <span className={styles.label}>Maturity</span>
        <div className={styles.chips} role="group" aria-label="Maturity level">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" aria-pressed={level === n} aria-label={`Maturity ${n}: ${maturityWord(n)}`}
                    className={`${styles.pick} ${level === n ? styles.pickOn : ''}`} title={maturityWord(n)}
                    onClick={() => setLevel(level === n ? 0 : n)}>
              <MaturityChip value={n} variant="number" />
            </button>
          ))}
          {level > 0 && <MaturityChip value={level} />}
        </div>
        <textarea className={styles.input} rows={2} value={evidence} onChange={e => setEvidence(e.target.value)}
                  placeholder="Evidence for this rating (required with a rating)" />
      </div>
      {err && <p className={styles.error} role="alert">{err}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.save} onClick={save} disabled={busy || (!implChanged && !ratingChanged && !deliveryChanged)}>
          {busy ? 'Saving…' : 'Save implementation'}
        </button>
        {done && <span className={styles.done} role="status">{done}</span>}
      </div>
    </div>
  );
}

// The status word, its partial reason, and the sentences saying where it comes
// from — derived from the systems, or stated by hand (v129).
function DerivedStatus({ soa }) {
  const qualifier = partialQualifier(soa);
  return (
    <span className={styles.derivedStatus}>
      <span>
        {IMPLEMENTATION_LABEL[soa?.implementation_status] ?? '—'}
        {qualifier && <span className={styles.meta}> · {qualifier}</span>}
      </span>
      {explainImplementation(soa).map(line => <span key={line} className={styles.meta}>{line}</span>)}
    </span>
  );
}

// The same facts, read-only — shown whenever the objective is adopted, so its
// maturity and implementation are visible where they are rated, not only in
// edit mode (owner feedback, 2026-09-22).
export function ImplementationView({ soa, control, fmtDate }) {
  return (
    <dl className={styles.view}>
      <dt>Delivered</dt>
      <dd>{control?.delivery ? DELIVERY_LABEL[control.delivery] : <span className={styles.none}>Not stated</span>}</dd>

      <dt>Implementation status</dt>
      <dd><DerivedStatus soa={soa} /></dd>

      <dt>How it is implemented</dt>
      <dd>{soa?.implementation_description || <span className={styles.none}>Not described</span>}</dd>

      <dt>Maturity</dt>
      <dd>
        {control?.effectiveness == null ? (
          <span className={styles.none}>Not yet assessed</span>
        ) : (
          <span className={styles.maturity}>
            <EffectivenessDots value={control.effectiveness} />
            <MaturityChip value={control.effectiveness} />
          </span>
        )}
        {control?.effectiveness_notes && <span className={styles.evidence}>{control.effectiveness_notes}</span>}
        {control?.rated_by_name && (
          <span className={styles.meta}>
            Rated by {control.rated_by_name}{control.rated_at && fmtDate ? ` on ${fmtDate(control.rated_at)}` : ''}
          </span>
        )}
      </dd>
    </dl>
  );
}
