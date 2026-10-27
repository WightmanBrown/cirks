// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo } from 'react';
import { getSystems, getThreats, getUsers, getSystem, createRisk, getRiskGap } from '../api';
import { classifyControl, componentGaps, OPERATIONAL, EXCLUDED } from '../utils/controlGrouping';
import { ChipSelector } from './CiaTable';
import { RatingChip } from './RatingChip';
import { Modal } from './Modal';
import { HelpDot } from './HelpDot';
import styles from './RiskCreateModal.module.css';
import { DateField } from './DateField';


// The wizard registers a risk. It does NOT survey the system's controls.
//
// It used to: step 3 showed the coverage gap and (briefly) let the analyst
// correct it in place. That was wrong, and the owner caught it the first time it
// was used. The edits are system-scoped and save immediately, but the RISK is
// only created at the end — so an analyst who edited, hit the duplicate-risk 409
// on that system, went back and chose a different one left their corrections
// behind on the first system, silently. Worse, those corrections had already
// recomputed the probability of an existing risk they never intended to touch.
//
// Reviewing coverage belongs on the risk, where every edit has somewhere to
// land and the panel shows its effect on the score. The wizard now ends by
// taking the analyst straight there.
const STEP_SYSTEM = 1, STEP_THREAT = 2, STEP_REPLICATE = 3;
const STEP_TITLES = [
  { label: 'System', helpKey: 'risk_create.step_system' },
  { label: 'Threat, probability & rationale', helpKey: 'risk_create.step_threat' },
  { label: 'Replicate', helpKey: 'risk_create.step_replicate' },
];

// A stable signature of the actionable gap. Two systems have an "identical gap"
// for the threat when their signatures match → the rationale can be replicated.
//
// It now uses the SAME classifier as the coverage panel (`controlGrouping`), for
// two reasons. It was reading `cc.enterprise_status` — the catalogue-wide default
// on `control_components`, not the per-system health that v89 made the real
// signal — so it missed 6 genuine per-system component gaps on CIRKS-test and
// called those systems identical. And a control's own state was flattened to
// present/absent, so a system where the control is DEGRADED signed the same as
// one where it is working: different work, same verdict.
//
// This is stricter than before, so more systems now read "different gap — needs
// a rationale". That is the safe direction: the cost is typing an explanation,
// where the cost of the old behaviour was a copied rationale that did not
// describe the system it was copied onto.
export function gapSignature(g) {
  if (!g) return '';
  const parts = [];
  for (const c of g.controls) {
    const { group } = classifyControl(c);
    // Nothing to explain for either settled case. An operational control has no
    // component gaps by definition, and an EXCLUDED one is a decision already
    // taken with its reason recorded (0118) — it is "neither a gap nor a
    // contributor", so two systems that differ only in an exclusion still share
    // a gap worth describing the same way.
    if (group === OPERATIONAL || group === EXCLUDED) continue;
    parts.push(`C:${group}:${c.id}`);
    for (const cc of componentGaps(c)) parts.push(`c:${c.id}:${cc.id}`);
  }
  return parts.sort().join('|');
}

function StepIndicator({ step }) {
  return (
    <div className={styles.stepper}>
      {STEP_TITLES.map(({ label, helpKey }, i) => {
        const n = i + 1;
        const done = step > n, active = step === n;
        return (
          <div key={n} className={styles.stepItem}>
            <span className={`${styles.stepDot} ${active ? styles.stepDotActive : ''} ${done ? styles.stepDotDone : ''}`}>
              {done ? '✓' : n}
            </span>
            <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ''}`}>{label}</span>
            <HelpDot k={helpKey} placement="bottom" />
            {n < STEP_TITLES.length && <span className={`${styles.stepLine} ${done ? styles.stepLineDone : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

// `initialSystemId` / `initialThreatId` let the modal be opened already pointed
// at a system × threat pair — used by the "Assess" action on a system's
// identified-but-unassessed threats, which knows both up front. With both
// supplied the wizard opens at the gap step, since the first two steps would
// only ask the caller to re-pick what it already chose.
export function RiskCreateModal({ onClose, onCreated, initialSystemId = '', initialThreatId = '' }) {
  const [systems, setSystems] = useState([]);
  const [threats, setThreats] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [systemDetail, setSystemDetail] = useState(null);

  const [step, setStep] = useState(
    initialSystemId ? STEP_THREAT : STEP_SYSTEM
  );
  const [form, setForm] = useState({
    system_id: initialSystemId, threat_id: initialThreatId,
    probability_c: 3, probability_i: 3, probability_a: 3,
    review_date: '', rationale: '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  // A risk already assessing this threat on this system. Detected as soon as the
  // pair is known — not at Register — because by then the analyst has written a
  // rationale they are about to lose, and the only move a late 409 leaves is to
  // go back and change something.
  const [existingRiskId, setExistingRiskId] = useState(null);


  // The gap is still derived, but nothing renders it now: it exists only to
  // signature the primary risk so the Replicate step can tell which other
  // systems share the same coverage shape.
  const [gap, setGap] = useState(null);

  // Replicate step: same threat + probability applied to more systems.
  // `sig`, not `matches`: the primary gap is now editable on step 3, so a verdict
  // frozen at add-time goes stale the moment the analyst corrects the record and
  // comes back. Store each replica's own signature and compare on render.
  const [replicas, setReplicas] = useState([]); // [{ system_id, name, department_name, owner_id, sig, rationale, loading }]
  const [addSysId, setAddSysId] = useState('');

  const set = (k, v) => {
    setError('');
    // Only a different pair can clear a duplicate; typing a rationale cannot.
    if (k === 'system_id' || k === 'threat_id') setExistingRiskId(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    getSystems().then((d) => setSystems(d.systems || d)).catch(() => {});
    getThreats().then(setThreats).catch(() => {});
    getUsers().then(setUsers).catch(() => {});
  }, []);

  // Load system detail. The owner is NOT chosen here: a risk belongs to the
  // department that owns its system (v108), so it is derived on read.
  useEffect(() => {
    if (!form.system_id) { setSystemDetail(null); return; }
    getSystem(form.system_id)
      .then(setSystemDetail)
      .catch(() => setSystemDetail(null));
  }, [form.system_id]);

  // Prefill probability from the threat's baseline hint.
  useEffect(() => {
    if (!form.threat_id) return;
    const t = threats.find((x) => x.id === form.threat_id);
    if (!t) return;
    setForm((f) => ({
      ...f,
      probability_c: t.probability_c ?? f.probability_c,
      probability_i: t.probability_i ?? f.probability_i,
      probability_a: t.probability_a ?? f.probability_a,
    }));
  }, [form.threat_id, threats]);

  // Derive the control/component gap once both system + threat are chosen.
  useEffect(() => {
    if (!form.system_id || !form.threat_id) { setGap(null); return; }
    let cancelled = false;
    getRiskGap(form.system_id, form.threat_id)
      .then((d) => {
        if (cancelled) return;
        setGap(d);
        setExistingRiskId(d.existing_risk_id || null);
      })
      .catch(() => { if (!cancelled) setGap(null); });
    return () => { cancelled = true; };
  }, [form.system_id, form.threat_id]);

  const sortedSystems = useMemo(() => [...systems].sort((a, b) =>
    (a.department_name || '').localeCompare(b.department_name || '') || (a.name || '').localeCompare(b.name || '')), [systems]);

  // Mirrors the backend derivation (v108, docs/risk-ownership.md): the risks on
  // a system belong to the department that owns it, and the accountable person
  // is that department's IAO — or the SIRO where it has none. Shown, never
  // chosen, so the analyst can see who they are committing before they save.
  const derivedOwner = useMemo(() => {
    if (!systemDetail) return { name: '—', why: 'Select a system first.' };
    const dept = systemDetail.department_name || 'the owning department';
    const iaos = users.filter(u => u.department_id === systemDetail.department_id
                                && u.role === 'information_asset_owner');
    if (iaos.length) {
      return { name: iaos.map(u => u.full_name).join(', '),
               why: `Information Asset Owner for ${dept}.` };
    }
    const siros = users.filter(u => u.role === 'siro');
    if (siros.length) {
      return { name: siros.map(u => u.full_name).join(', '),
               why: `${dept} has no Information Asset Owner, so its risks are owned by the SIRO.` };
    }
    return { name: '—', why: `${dept} has no Information Asset Owner and no SIRO is configured.` };
  }, [systemDetail, users]);

  const scoreOf = (dim) => (systemDetail?.[`impact_${dim}`] ? form[`probability_${dim}`] * systemDetail[`impact_${dim}`] : null);
  const maxScore = systemDetail ? Math.max(scoreOf('c') || 0, scoreOf('i') || 0, scoreOf('a') || 0) : null;

  // The primary risk's gap signature — replicas compare against it.
  const primarySig = useMemo(() => gapSignature(gap), [gap]);
  const iaoForDept = (deptId) => users.find((u) => u.department_id === deptId && u.role === 'information_asset_owner')?.id || '';

  async function addReplica(systemId) {
    if (!systemId || systemId === form.system_id || replicas.some((r) => r.system_id === systemId)) return;
    const sys = systems.find((s) => s.id === systemId);
    setReplicas((prev) => [...prev, {
      system_id: systemId, name: sys?.name || '?', department_name: sys?.department_name || '',
      owner_id: iaoForDept(sys?.department_id), sig: null, rationale: '', loading: true,
    }]);
    try {
      const g = await getRiskGap(systemId, form.threat_id);
      const sig = gapSignature(g);
      // The same answer the primary pair gets, for free: a system that already
      // carries this risk cannot take another, and saying so here beats a
      // "likely already exist" at the end of a batch.
      setReplicas((prev) => prev.map((r) => r.system_id === systemId
        ? { ...r, sig, existingRiskId: g.existing_risk_id || null,
            rationale: sig === primarySig ? form.rationale : '', loading: false } : r));
    } catch {
      // Unknown signature — never equal to the primary's, so it reads as
      // "different gap" and asks for its own rationale. Failing towards more
      // explanation is the safe direction.
      setReplicas((prev) => prev.map((r) => (r.system_id === systemId ? { ...r, sig: null, loading: false } : r)));
    }
  }
  const removeReplica = (id) => setReplicas((prev) => prev.filter((r) => r.system_id !== id));
  const setReplicaRationale = (id, val) => setReplicas((prev) => prev.map((r) => (r.system_id === id ? { ...r, rationale: val } : r)));

  const canNext = {
    [STEP_SYSTEM]: !!form.system_id,
    [STEP_THREAT]: !!form.threat_id && !!form.rationale.trim() && !existingRiskId,
  };
  const canRegister = !!form.rationale.trim() && !existingRiskId
    && replicas.every((r) => !r.loading && (r.existingRiskId || r.rationale.trim()));
  // Count what will actually be created — a skipped replica in the button's
  // number is a promise the batch will not keep.
  const willCreate = 1 + replicas.filter((r) => !r.existingRiskId).length;
  const registerLabel = willCreate > 1 ? `Register ${willCreate} risks` : 'Register risk';

  // Register the primary risk + any replicas (one createRisk per system).
  async function register() {
    setError('');
    const jobs = [
      { system_id: form.system_id, rationale: form.rationale },
      // Skipped, not attempted: the API would refuse it and the analyst has
      // already been told.
      ...replicas.filter((r) => !r.existingRiskId)
                 .map((r) => ({ system_id: r.system_id, rationale: r.rationale, name: r.name })),
    ];
    if (jobs.some((j) => !j.rationale.trim())) { setError('Every risk needs a rationale.'); return; }
    setSaving(true);
    const results = [];
    for (const j of jobs) {
      try {
        const { id } = await createRisk({
          system_id: j.system_id, threat_id: form.threat_id,
          probability_c: form.probability_c, probability_i: form.probability_i, probability_a: form.probability_a,
          rationale: j.rationale, review_date: form.review_date || null,
        });
        results.push({ ok: true, id });
      } catch (err) {
        results.push({ ok: false, name: j.name,
          error: err.response?.data?.error || 'failed',
          existingId: err.response?.data?.existing_risk_id || null });
      }
    }
    const primary = results[0];
    if (!primary.ok) {
      setError('Could not register the risk: ' + primary.error);
      // A duplicate is not a failure so much as a redirection: the risk exists
      // and the analyst wants to be looking at it.
      setExistingRiskId(primary.existingId || null);
      setSaving(false);
      return;
    }
    const failed = results.slice(1).filter((r) => !r.ok);
    if (failed.length) {
      setError(`Risk registered, but ${failed.length} replica(s) failed (likely already exist): ${failed.map((f) => f.name).join(', ')}. Close to continue.`);
      setSaving(false);
      return;
    }
    onCreated(primary.id);
  }

  return (
    <Modal label="Register risk" onClose={onClose} busy={saving}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.headerLabel}>REGISTER RISK <HelpDot k="risk_create.title" placement="bottom" /></span>
          <button className={styles.closeBtn} onClick={onClose} disabled={saving}>✕</button>
        </div>

        <StepIndicator step={step} />

        <div className={styles.body}>
          {step === STEP_SYSTEM && (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>System at risk <span className={styles.req}>*</span></label>
              <select className={styles.select} value={form.system_id} onChange={(e) => set('system_id', e.target.value)} autoFocus>
                <option value="">— select the system this risk affects —</option>
                {sortedSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.department_name ? ` (${s.department_name})` : ''}
                    {s.impact_c != null ? ` — C${s.impact_c} I${s.impact_i} A${s.impact_a}` : ''}
                  </option>
                ))}
              </select>
              {systemDetail && (
                <p className={styles.hint}>
                  System CIA (max of linked assets): C{systemDetail.impact_c ?? '–'} I{systemDetail.impact_i ?? '–'} A{systemDetail.impact_a ?? '–'}
                </p>
              )}
            </div>
          )}

          {step === STEP_THREAT && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Threat <span className={styles.req}>*</span></label>
                <select className={styles.select} value={form.threat_id} onChange={(e) => set('threat_id', e.target.value)} autoFocus>
                  <option value="">— select the threat —</option>
                  {threats.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.threat_category ? ` (${t.threat_category})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Probability</label>
                {['c', 'i', 'a'].map((dim) => (
                  <div key={dim} className={styles.probRow}>
                    <span className={styles.probDim}>{dim === 'c' ? 'Confidentiality' : dim === 'i' ? 'Integrity' : 'Availability'}</span>
                    <ChipSelector value={form[`probability_${dim}`]} onChange={(v) => set(`probability_${dim}`, v)} wordScale="probability" />
                    {scoreOf(dim) != null && <RatingChip value={scoreOf(dim)} scale="risk" variant="number" />}
                  </div>
                ))}
                {maxScore != null && (
                  <p className={styles.hint}>Worst-case current score: <RatingChip value={maxScore} scale="risk" variant="number" /> &nbsp;(probability × the system's CIA)</p>
                )}
              </div>

              <div className={styles.optionalRow}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Risk owner</label>
                  <p className={styles.derivedOwner}>{derivedOwner.name}</p>
                  <p className={styles.hint}>{derivedOwner.why}</p>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Review date</label>
                  <DateField className={styles.inputDate} value={form.review_date} onChange={(e) => set('review_date', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {step === STEP_REPLICATE && (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Replicate this risk to other systems</label>
              <p className={styles.fieldHint}>
                Same threat &amp; probability. Where a system's gap matches this one, the rationale is copied;
                where it differs, write a fresh one. Each risk's owner defaults to that system's IAO.
              </p>
              <select
                className={styles.select}
                value={addSysId}
                onChange={(e) => { addReplica(e.target.value); setAddSysId(''); }}
              >
                <option value="">+ add a system…</option>
                {sortedSystems
                  .filter((s) => s.id !== form.system_id && !replicas.some((r) => r.system_id === s.id))
                  .map((s) => <option key={s.id} value={s.id}>{s.name}{s.department_name ? ` (${s.department_name})` : ''}</option>)}
              </select>

              {replicas.length === 0 && <p className={styles.hint}>No other systems yet — add one above, or just register the single risk.</p>}

              {replicas.map((r) => (
                <div key={r.system_id} className={styles.replicaCard}>
                  <div className={styles.replicaHead}>
                    <span className={styles.replicaName}>{r.name}{r.department_name ? ` — ${r.department_name}` : ''}</span>
                    {r.loading
                      ? <span className={styles.hint}>comparing gap…</span>
                      : r.existingRiskId
                        ? <span className={styles.chipWarn}>already assessed — will be skipped</span>
                      : r.sig === primarySig
                        ? <span className={styles.chipOk}>✓ same gap — rationale copied</span>
                        : <span className={styles.chipWarn}>different gap — needs a rationale</span>}
                    <button type="button" className={styles.replicaRemove} onClick={() => removeReplica(r.system_id)} title="Remove">✕</button>
                  </div>
                  {!r.loading && !r.existingRiskId && (
                    <textarea
                      className={styles.textarea}
                      rows={2}
                      value={r.rationale}
                      onChange={(e) => setReplicaRationale(r.system_id, e.target.value)}
                      placeholder="Why is this a risk on this system?"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Rationale carries across steps 1–3 — it's where the analyst's
              thinking lives, editable from the moment they start. */}
          {step < STEP_REPLICATE && (
            <div className={`${styles.fieldGroup} ${styles.rationaleGroup}`}>
              <label className={styles.fieldLabel}>
                Why is this a risk? <span className={styles.req}>*</span>
                <span className={styles.fieldHint}>
                  {' '}(why this threat matters on this system — the control coverage
                  comes next, on the risk itself)
                </span>
              </label>
              <textarea
                className={styles.textarea}
                rows={4}
                value={form.rationale}
                onChange={(e) => set('rationale', e.target.value)}
                placeholder="e.g. None of the phishing controls (awareness training, MFA, monitoring) are present on this system, so a phished credential would go undetected…"
              />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          {/* A pair can carry only one live risk, so there is nothing to
              register here — say so at once, say what it costs to leave, and
              offer the one move that helps. */}
          {existingRiskId && (
            <div className={styles.dupBlock}>
              <p className={styles.dupTitle}>This risk has already been assessed <HelpDot k="risk_create.duplicate" placement="bottom" /></p>
              <p className={styles.dupBody}>
                A risk for this threat on this system already exists, and a system
                and threat can only carry one. Work on the existing risk instead —
                that is where its controls, score and actions live.
                {form.rationale.trim() && (
                  <> <strong>The rationale you have written here will not be kept.</strong>{' '}
                  Copy it now if you want it.</>
                )}
              </p>
              <button
                type="button"
                className={styles.btnSubmit}
                onClick={() => onCreated(existingRiskId)}
              >Open the existing risk →</button>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={step === STEP_SYSTEM ? onClose : () => setStep(step - 1)}
            disabled={saving}
          >
            {step === STEP_SYSTEM ? 'Cancel' : '← Back'}
          </button>

          {step === STEP_SYSTEM && (
            <button type="button" className={styles.btnSubmit} onClick={() => setStep(step + 1)} disabled={!canNext[step]}>
              Next →
            </button>
          )}
          {step === STEP_THREAT && (
            <div className={styles.actionRight}>
              <button type="button" className={styles.btnGhost} onClick={() => setStep(STEP_REPLICATE)} disabled={saving || !canRegister}>
                Replicate to other systems →
              </button>
              <button type="button" className={styles.btnSubmit} onClick={register} disabled={saving || !canRegister}>
                {saving ? 'Registering…' : registerLabel}
              </button>
            </div>
          )}
          {step === STEP_REPLICATE && (
            <button type="button" className={styles.btnSubmit} onClick={register} disabled={saving || !canRegister}>
              {saving ? 'Registering…' : registerLabel}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
