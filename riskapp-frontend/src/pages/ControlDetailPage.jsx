// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth }          from '../context/AuthContext';
import { getControl, updateControl, getThreats, linkControlThreat, unlinkControlThreat, getUsers, updateControlMaturityCap } from '../api';
import { Shell }            from '../components/Shell';
import { BackButton }       from '../components/BackButton';
import { EntityKind }       from '../components/EntityKind';
import { Spinner }          from '../components/Spinner';
import { EffectivenessDots } from '../components/ControlBadges';
import { HelpDot }          from '../components/HelpDot';
import { MaturityChip }     from '../components/MaturityChip';
import styles               from './ControlDetailPage.module.css';
import { personLabel } from '../utils/roles';
import { OBJECTIVE_STATUS } from '../utils/objectiveStatus';
import { DecisionForm, ImplementationForm, ImplementationView } from '../components/ObjectiveDecision';
import SoaFindingsPanel from '../components/SoaFindingsPanel';
import WithdrawControlDialog from '../components/WithdrawControlDialog';
import ControlDeployments from '../components/ControlDeployments';
import { DeliveryPatternsSection } from '../components/DeliveryPatternsSection';

// The control OBJECTIVE page (terms agreed 2026-09-21 — docs/terminology.md).
//
// It answers three questions, in this order, for anyone who opens it:
//   1. What does this objective ask?          (description, standard requirements it meets)
//   2. How well is it being met?              (a read-out: adopted? implemented? maturity,
//                                              deployment, risks treated — edited in the SoA)
//   3. What is our control, the thing that    (components, relationships, threat links —
//      meets it?                                only once the objective is ADOPTED, read-only
//                                              until a controls.write holder chooses to edit)
// It used to open straight onto editable engineering panels, for every role and for
// objectives nobody had adopted — including governance objectives such as GV.OC-01,
// where components and a component graph mean nothing.

const FRAMEWORK_LABELS = {
  iso27001: 'ISO 27001',
  cis_v8:   'CIS v8',
  nist_csf: 'NIST CSF',
  custom:   'Custom',
};

const APPLICABILITY_TIPS = {
  baseline: 'Part of the mandatory minimum control set — applies to all systems regardless of risk profile.',
  specific:  'Applied in response to a specific risk — supplements the baseline control set.',
};

const IMPL_LABEL = {
  not_implemented: 'Not implemented',
  planned:         'Planned',
  partial:         'Partial',
  implemented:     'Implemented',
};

// Per-system deployment statuses, in the order a reader wants them.
const DEPLOY_STATUSES = [
  ['operational', 'operational'],
  ['degraded',    'degraded'],
  ['missing',     'missing'],
  ['unknown',     'status unknown'],
];

// Scrolling is a nicety and must never be the reason something breaks: jsdom has
// no scrollIntoView, and the call lands inside a requestAnimationFrame, so it
// threw only when the frame beat the end of a test — CI caught it, having been
// lucky twice before that (2026-09-25).
function revealDecision(el) {
  if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function ControlDetailPage() {
  const { id }     = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasCapability } = useAuth();
  const canWrite   = hasCapability('controls.write');
  const [control,  setControl]  = useState(null);
  const [threats,  setThreats]  = useState([]);
  const [soa,      setSoa]      = useState(null);
  const [readout,  setReadout]  = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [deliveryPatterns, setDeliveryPatterns] = useState([]);
  const [deliveryBySystem, setDeliveryBySystem] = useState([]);
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [editingControl, setEditingControl] = useState(false);
  const [editingDecision, setEditingDecision] = useState(false);
  const decisionRef = useRef(null);
  const [withdrawing, setWithdrawing] = useState(false);
  // Bumped to refetch after a change the server derives from (delivery → reach).
  const [reloadKey, setReloadKey] = useState(0);
  // `?decide=1` — a finding says "change the decision", so it links straight to
  // the open form rather than to the page it is somewhere on (owner, 2026-09-24).
  useEffect(() => {
    if (searchParams.get('decide') !== '1' || !canWrite) return;
    setEditingDecision(true);
    const next = new URLSearchParams(searchParams);
    next.delete('decide');
    setSearchParams(next, { replace: true });
    requestAnimationFrame(() => revealDecision(decisionRef.current));
  }, [searchParams, setSearchParams, canWrite]);

  // A new identity whenever the facts a finding depends on change (v130).
  const findingsKey = useMemo(() => ({}), [soa, threats, control?.delivery]); // eslint-disable-line react-hooks/exhaustive-deps
  // The objective's own words — editable after creation (a typo used to be
  // permanent). A failed save keeps what was typed.
  const [wordsEditing, setWordsEditing] = useState(false);
  const [titleDraft, setTitleDraft]     = useState('');
  const [descDraft, setDescDraft]       = useState('');
  const [wordsErr, setWordsErr]         = useState('');
  const [wordsBusy, setWordsBusy]       = useState(false);
  async function saveWords() {
    if (!titleDraft.trim()) { setWordsErr('The title cannot be blank.'); return; }
    setWordsBusy(true); setWordsErr('');
    try {
      const data = await updateControl(id, { title: titleDraft, description: descDraft });
      setControl(prev => ({ ...prev, title: data.control.title, description: data.control.description }));
      setWordsEditing(false);
    } catch (e) {
      setWordsErr(e?.response?.data?.error || 'Not saved. What you typed is still here — try again.');
    } finally {
      setWordsBusy(false);
    }
  }

  const [allThreats,      setAllThreats]      = useState([]);
  const [showLinkForm,    setShowLinkForm]    = useState(false);
  const [linkForm,        setLinkForm]        = useState({ threat_id: '', notes: '' });
  const [linkErr,         setLinkErr]         = useState('');
  const [linkBusy,        setLinkBusy]        = useState(false);

  const [baselineSaving, setBaselineSaving] = useState(false);

  async function handleLinkThreat() {
    setLinkErr('');
    if (!linkForm.threat_id) { setLinkErr('Select a threat.'); return; }
    setLinkBusy(true);
    try {
      const row = await linkControlThreat(id, linkForm);
      setThreats((prev) => [...prev, row]);
      setShowLinkForm(false);
      setLinkForm({ threat_id: '', notes: '' });
    } catch (err) {
      setLinkErr(err.response?.data?.error || 'Failed to link threat.');
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleUnlinkThreat(linkId) {
    try {
      await unlinkControlThreat(id, linkId);
      setThreats((prev) => prev.filter((t) => t.id !== linkId));
    } catch {
      // silently ignore — row remains visible
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [data, allT, allU] = await Promise.all([
          getControl(id),
          getThreats(),
          getUsers().catch(() => []),
        ]);
        if (!cancelled) {
          setControl(data.control);
          setThreats(data.threats);
          setSoa(data.soa || null);
          setReadout(data.readout || null);
          setDeployments(data.deployments || []);
          setDeliveryPatterns(data.delivery_patterns || []);
          setDeliveryBySystem(data.delivery_by_system || []);
          setAllThreats(allT);
          setUsers(Array.isArray(allU) ? allU : (allU?.users || []));
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.status === 404
              ? 'Control objective not found.'
              : err.response?.data?.error || 'Failed to load control objective.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  async function handleBaselineToggle(newValue) {
    setBaselineSaving(true);
    try {
      const data = await updateControl(id, { is_baseline: newValue });
      setControl(prev => ({ ...prev, ...data.control }));
    } catch {
      // silent — badge will revert visually on next load
    } finally {
      setBaselineSaving(false);
    }
  }

  // A custom objective's own reference (v123). Unique across the library; the
  // server says so if it clashes, and the message is shown as-is.
  const [refEditing, setRefEditing] = useState(false);
  const [refDraft, setRefDraft]     = useState('');
  const [refError, setRefError]     = useState('');
  async function handleRefSave() {
    setRefError('');
    try {
      const data = await updateControl(id, { reference_code: refDraft });
      setControl(prev => ({ ...prev, ...data.control, framework_ref: data.control.reference_code }));
      setRefEditing(false);
    } catch (err) {
      setRefError(err?.response?.data?.error || 'Could not save the reference.');
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className={styles.page}>
          <div className={styles.loadingState}>
            <Spinner />
            <span>Loading control objective…</span>
          </div>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className={styles.page}>
          <BackButton fallback="/controls" />
          <div className={styles.errorBanner} role="alert">⚠ {error}</div>
        </div>
      </Shell>
    );
  }

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const createdDate = fmtDate(control.created_at);
  const soaPath     = control.framework === 'custom' ? '/soa/custom' : '/soa';
  const adopted     = !!soa?.applicable;

  return (
    <Shell>
      <div className={styles.page}>

        {/* Back link */}
        <BackButton fallback="/controls" />

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerMeta}>
              <span className={styles.frameworkBadge}>
                {FRAMEWORK_LABELS[control.framework] ?? control.framework_label ?? control.framework}
              </span>
              {control.framework === 'custom' && canWrite ? (
                refEditing ? (
                  <span className={styles.refEdit}>
                    <input
                      className={styles.refInput} value={refDraft} maxLength={100} autoFocus
                      placeholder="e.g. ORG-AC-01" aria-label="Reference"
                      onChange={e => setRefDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRefSave(); if (e.key === 'Escape') setRefEditing(false); }}
                    />
                    <button className={styles.refBtn} onClick={handleRefSave}>Save</button>
                    <button className={styles.refBtnQuiet} onClick={() => { setRefEditing(false); setRefError(''); }}>Cancel</button>
                    {refError && <span className={styles.refError} role="alert">{refError}</span>}
                  </span>
                ) : (
                  <button
                    className={styles.refCodeBtn}
                    title="Set this objective's own reference"
                    onClick={() => { setRefDraft(control.reference_code ?? ''); setRefEditing(true); }}
                  >
                    {control.framework_ref || '+ reference'} ✎
                  </button>
                )
              ) : control.framework_ref && (
                <span className={styles.refCode}>{control.framework_ref}</span>
              )}
              <StatusPill status={control.status} />
              {canWrite ? (
                <ApplicabilityToggle
                  isBaseline={control.is_baseline}
                  saving={baselineSaving}
                  onChange={handleBaselineToggle}
                />
              ) : (
                <ApplicabilityBadge isBaseline={control.is_baseline} />
              )}
            </div>
            <h1 className={styles.title}>{control.title}<EntityKind kind="control objective" /></h1>
          </div>
        </div>

        {/* 1 · What it asks  ·  2 · How well it is met */}
        <div className={styles.grid}>

          <div className={styles.col}>
            <Section title="What it asks">
              {wordsEditing ? (
                <div className={styles.wordsForm}>
                  <label className={styles.wordsField}>
                    <span className={styles.readoutLabel}>Title</span>
                    <input className={styles.wordsInput} value={titleDraft} maxLength={500}
                           onChange={e => setTitleDraft(e.target.value)} aria-label="Title" />
                  </label>
                  <label className={styles.wordsField}>
                    <span className={styles.readoutLabel}>Description</span>
                    <textarea className={styles.wordsInput} rows={4} value={descDraft}
                              onChange={e => setDescDraft(e.target.value)} aria-label="Description" />
                  </label>
                  {wordsErr && <p className={styles.errorMsg} role="alert">{wordsErr}</p>}
                  <div className={styles.wordsActions}>
                    <button type="button" className={styles.btnSave} onClick={saveWords} disabled={wordsBusy}>
                      {wordsBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className={styles.btnSecondary} onClick={() => { setWordsEditing(false); setWordsErr(''); }} disabled={wordsBusy}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={styles.description}>
                    {control.description || <span className={styles.empty}>No description provided.</span>}
                  </p>
                  {canWrite && (
                    <button type="button" className={styles.wordsEditBtn}
                            onClick={() => { setTitleDraft(control.title); setDescDraft(control.description ?? ''); setWordsErr(''); setWordsEditing(true); }}>
                      Edit wording
                    </button>
                  )}
                </>
              )}
              <dl className={styles.dl}>
                <dt>Type</dt>
                <dd><span className={styles.typePill}>{control.control_type}</span></dd>
                <dt>Added</dt>
                <dd>{createdDate ?? '—'}{control.created_by_name ? ` by ${control.created_by_name}` : ''}</dd>
              </dl>
            </Section>

            <Section title="Standard requirements it meets">
              {(control.standard_refs || []).length === 0 ? (
                <p className={styles.empty}>
                  None — this is a custom objective, mapped to no standard.
                </p>
              ) : (
                <ul className={styles.reqList}>
                  {control.standard_refs.map(r => (
                    <li key={`${r.standard}-${r.ref}`}>
                      <span className={styles.reqStd}>{r.standard_name ?? r.standard}</span>
                      <Link className={styles.reqRef} to={`/soa/${r.standard}`}>{r.ref}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className={styles.col}>
            <Section title="How well it is met" helpKey="controls.maturity">
              <Readout
                control={control} soa={soa} readout={readout}
                soaPath={soaPath} fmtDate={fmtDate}
              />
            </Section>
          </div>
        </div>

        {/* The valid ways this objective is delivered, and how each system is (v145). */}
        <div className={styles.cols}>
          <div className={styles.col}>
            <Section title="Security solutions">
              <DeliveryPatternsSection controlId={id} patterns={deliveryPatterns}
                canEdit={canWrite} onChanged={(p) => { setDeliveryPatterns(p); setReloadKey(k => k + 1); }} />
              {/* One list per system: how it is delivered there, and why it is
                  there. Was two panels over the same systems (owner, 2026-10-06). */}
              <h3 className={styles.subHeading}>On each system: how it is delivered, and why it is there</h3>
              {deployments.length === 0
                ? <p className={styles.readoutNote}>Not recorded on any system.</p>
                : <ControlDeployments deployments={deployments} deliveryBySystem={deliveryBySystem} />}
            </Section>
          </div>
        </div>

        {/* What this objective's SoA decision contradicts (v130); renders nothing
            when there is nothing to say. Re-fetched when the decision or the
            threat links change, since those are the acts that resolve it. */}
        <SoaFindingsPanel controlId={id} refreshKey={findingsKey} canDecide={canWrite}
                          onDecide={() => {
                            setEditingDecision(true);
                            requestAnimationFrame(() => revealDecision(decisionRef.current));
                          }} />

        {/* The decision — the SoA's own subject, edited here (2026-09-22). The SoA
            page reports it and can decide several at once, but this is where one
            objective's decision is made and explained. */}
        <Section title="Decision — Statement of Applicability" anchorRef={decisionRef}>
          {editingDecision ? (
            <DecisionForm
              controlId={id}
              soa={soa}
              treatsLine={readout?.risks_treated
                ? `Applicable — treats ${readout.risks_treated} identified risk${readout.risks_treated === 1 ? '' : 's'} across ${readout.systems_with_risks_treated} system${readout.systems_with_risks_treated === 1 ? '' : 's'}.`
                : ''}
              onCancel={() => setEditingDecision(false)}
              onSaved={(saved, status) => {
                setSoa(prev => ({ ...(prev || {}), ...saved }));
                if (status) setControl(prev => ({ ...prev, status }));
                setEditingDecision(false);
              }}
            />
          ) : (
            <div className={styles.decisionRead}>
              <p className={styles.decisionLine}>
                {!soa?.decided ? 'Not decided yet.' : soa.applicable ? 'Adopted — it applies.' : 'Does not apply.'}
                {soa?.justification && <span className={styles.readoutNote}> {soa.justification}</span>}
              </p>
              {soa?.applicable && (
                <p className={styles.readoutMeta}>
                  Applies in: {(soa.scopes || []).length
                    ? soa.scopes.map((s, i) => <span key={s.id}>{i ? ', ' : ''}<Link to={`/scopes/${s.id}`}>{s.name}</Link></span>)
                    : 'the whole organisation'}
                </p>
              )}
              {(soa?.drivers || []).length > 0 && (
                <p className={styles.readoutMeta}>Drivers: {soa.drivers.join(', ')}</p>
              )}
              {canWrite && (
                <button type="button" className={styles.btnSecondary} onClick={() => setEditingDecision(true)}>
                  {soa?.decided ? 'Change decision' : 'Decide'}
                </button>
              )}
            </div>
          )}
        </Section>

        {/* 3 · Our control — the thing that meets the objective */}
        <div className={styles.controlHeader}>
          <h2 className={styles.controlTitle}>Our control</h2>
          {adopted && canWrite && (
            <button
              type="button"
              className={editingControl ? styles.btnSave : styles.btnSecondary}
              onClick={() => { setEditingControl(e => !e); setShowLinkForm(false); }}
            >
              {editingControl ? 'Done editing' : 'Edit control'}
            </button>
          )}
          {/* Taking it out of use: one act, a reason, and a preview of which
              risks rise when it goes (v131). Only where there is something to
              withdraw, and never for a control delivered once — that is an SoA
              decision, which the endpoint refuses. */}
          {canWrite && !editingControl && control?.delivery !== 'organisation' && control?.delivery !== 'group'
            && (readout?.deployed_systems > 0 || threats.length > 0) && (
            <button type="button" className={styles.btnDanger} onClick={() => setWithdrawing(true)}>
              Withdraw from use
            </button>
          )}
        </div>

        {!adopted ? (
          <p className={styles.notAdopted}>
            {soa?.decided
              ? 'This objective has been judged not applicable, so there is no control to show.'
              : 'This objective has not been adopted yet.'}{' '}
            Adopt it in the <Link to={soaPath}>Statement of Applicability</Link> to build the control that meets it.
          </p>
        ) : (
          <>
            {/* How the control meets the objective: status, the one-line "how" the
                SoA shows, and maturity. Edited with the rest of the control. */}
            <Section title="Implementation">
              {editingControl ? (
                <ImplementationForm
                  controlId={id} soa={soa} control={control}
                  onSaved={({ soa: s2, control: c2 }) => {
                    if (s2) setSoa(prev => ({ ...(prev || {}), ...s2 }));
                    if (c2) setControl(prev => ({ ...prev, ...c2 }));
                    // The reach it reports is derived on the server from the mode.
                    if (c2 && 'delivery' in c2) setReloadKey(k => k + 1);
                  }}
                />
              ) : (
                <ImplementationView soa={soa} control={control} fmtDate={fmtDate} />
              )}
            </Section>

            {/* The owner is shown in the read-out above; changing it is part of
                editing the control. */}
            {editingControl && (
              <MaturityCeilingSection
                control={control}
                users={users}
                canWrite={canWrite}
                onSaved={(patch) => setControl(prev => ({ ...prev, ...patch }))}
              />
            )}

            <Section title={`Threats it counters${threats.length ? ` (${threats.length})` : ''}`}>
              {editingControl && !showLinkForm && (
                <div className={styles.threatHeader}>
                  <span />
                  <button className={styles.btnLink} onClick={() => { setShowLinkForm(true); setLinkErr(''); }}>
                    + Link threat
                  </button>
                </div>
              )}

              {editingControl && showLinkForm && (
                <div className={styles.linkForm}>
                  <div className={styles.linkFormField}>
                    <label className={styles.linkFormLabel}>Threat</label>
                    <select
                      className={styles.linkFormSelect}
                      value={linkForm.threat_id}
                      onChange={(e) => setLinkForm((f) => ({ ...f, threat_id: e.target.value }))}
                    >
                      <option value="">— select —</option>
                      {allThreats
                        .filter((t) => !threats.some((linked) => linked.threat_id === t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                  </div>
                  <div className={styles.linkFormField}>
                    <label className={styles.linkFormLabel}>Notes (optional)</label>
                    <input
                      className={styles.linkFormInput}
                      value={linkForm.notes}
                      onChange={(e) => setLinkForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="e.g. partially mitigates via compensating control"
                    />
                  </div>
                  {linkErr && <p className={styles.linkErr}>{linkErr}</p>}
                  <div className={styles.linkFormButtons}>
                    <button className={styles.btnSecondary} onClick={() => setShowLinkForm(false)}>Cancel</button>
                    <button className={styles.btnSave} onClick={handleLinkThreat} disabled={linkBusy}>
                      {linkBusy ? 'Linking…' : 'Link threat'}
                    </button>
                  </div>
                </div>
              )}

              {threats.length === 0 ? (
                !showLinkForm && <p className={styles.empty}>No threats linked.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <Th>Threat</Th>
                        <Th>Category</Th>
                        <Th>Source</Th>
                        <Th>Notes</Th>
                        {editingControl && <Th />}
                      </tr>
                    </thead>
                    <tbody>
                      {threats.map((t) => (
                        <tr key={t.id} className={styles.row}>
                          <td className={`${styles.td} ${styles.tdThreat}`}>{t.threat_name}</td>
                          <td className={styles.td}>
                            <span className={styles.category}>{t.threat_category.replace(/_/g, ' ')}</span>
                          </td>
                          <td className={styles.td}>{t.threat_source}</td>
                          <td className={`${styles.td} ${styles.tdNotes}`}>
                            {t.notes || <span className={styles.empty}>—</span>}
                          </td>
                          {editingControl && (
                            <td className={`${styles.td} ${styles.tdCenter}`}>
                              <button className={styles.btnUnlink} onClick={() => handleUnlinkThreat(t.id)} title="Unlink" aria-label={`Unlink threat: ${t.threat_name}`}>×</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}

      </div>
      {/* Taking it out of use (v131): the dialog previews what would go, and
          which risks rise, before asking for the reason. */}
      {withdrawing && (
        <WithdrawControlDialog
          controlId={id}
          title={control?.title}
          onClose={() => setWithdrawing(false)}
          onDone={() => { setWithdrawing(false); setReloadKey(k => k + 1); }}
        />
      )}
    </Shell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

// How well the objective is being met, in one place, for anyone who opens it.
// Nothing here is edited on this page: adoption, justification, implementation
// and maturity are recorded in the Statement of Applicability, deployment on the
// systems themselves.
function Readout({ control, soa, readout, soaPath, fmtDate }) {
  const adopted = !!soa?.applicable;
  const byStatus = readout?.by_status || {};
  const excluded = byStatus.not_applicable || 0;
  const deployed = readout?.deployed_systems ?? 0;

  return (
    <div className={styles.readout}>
      <div className={styles.readoutRow}>
        <span className={styles.readoutLabel}>Adopted</span>
        <span>
          {adopted
            ? <span className={styles.adoptedYes}>Yes</span>
            : soa?.decided
              ? <span className={styles.adoptedNo}>No — not applicable</span>
              : <span className={styles.adoptedUndecided}>Not yet decided</span>}
          {soa?.justification && <span className={styles.readoutNote}>{soa.justification}</span>}
        </span>
      </div>

      {adopted && (
        <>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Implemented</span>
            <span>
              {IMPL_LABEL[soa.implementation_status] ?? soa.implementation_status}
              {soa.implementation_description && (
                <span className={styles.readoutNote}>{soa.implementation_description}</span>
              )}
            </span>
          </div>

          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Maturity</span>
            <span>
              {control.effectiveness === null ? (
                <span className={styles.readoutMuted}>Not yet assessed</span>
              ) : (
                <span className={styles.ratingRow}>
                  <EffectivenessDots value={control.effectiveness} />
                  <MaturityChip value={control.effectiveness} />
                </span>
              )}
              {control.effectiveness_notes && <span className={styles.readoutNote}>{control.effectiveness_notes}</span>}
              {control.rated_by_name && (
                <span className={styles.readoutMeta}>
                  Rated by {control.rated_by_name}{control.rated_at ? ` on ${fmtDate(control.rated_at)}` : ''}
                </span>
              )}
            </span>
          </div>

          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Deployed</span>
            <span>
              {/* By how it is delivered (v127), against where it APPLIES (v126). */}
              {control.delivery === 'organisation' ? (
                <span>Delivered organisation-wide — reaches all {readout?.reach_systems ?? 0} system{readout?.reach_systems === 1 ? '' : 's'} where it applies</span>
              ) : control.delivery === 'group' ? (
                (readout?.groups || []).length === 0 ? (
                  <span className={styles.outside}>For a group — but no group is linked yet</span>
                ) : (
                  <span>
                    For {readout.groups.map(g => g.name).join(', ')} — reaches {readout.reach_systems} system{readout.reach_systems === 1 ? '' : 's'} where it applies
                  </span>
                )
              ) : (readout?.expected_systems ?? 0) === 0 ? (
                <span className={styles.readoutMuted}>Expected on no system — its scopes are empty</span>
              ) : (
                <span>
                  On {readout.deployed_expected} of {readout.expected_systems} system{readout.expected_systems === 1 ? '' : 's'} where it applies
                  {(soa.scopes || []).length ? ` (${soa.scopes.map(s => s.name).join(', ')})` : ' (the whole organisation)'}
                </span>
              )}
              {!control.delivery && (
                <span className={styles.readoutMeta}>How it is delivered is not stated — organisation-wide, for a group, or on each system (Edit control).</span>
              )}
              {deployed > 0 && (
                <span className={styles.deployChips}>
                  {DEPLOY_STATUSES.filter(([s]) => byStatus[s]).map(([s, label]) => (
                    <span key={s} className={`${styles.deployChip} ${styles[`deploy_${s}`] ?? ''}`}>
                      {byStatus[s]} {label}
                    </span>
                  ))}
                </span>
              )}
              {(readout?.deployed_outside ?? 0) > 0 && (
                <span className={styles.outside}>
                  Also on {readout.deployed_outside} system{readout.deployed_outside === 1 ? '' : 's'} outside where it applies
                </span>
              )}
              {excluded > 0 && (
                <span className={styles.readoutMeta}>Excluded, with a reason, on {excluded} system{excluded === 1 ? '' : 's'}</span>
              )}
            </span>
          </div>

          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Risks treated</span>
            <span>
              {(readout?.risks_treated ?? 0) === 0
                ? <span className={styles.readoutMuted}>None identified</span>
                : `${readout.risks_treated} active risk${readout.risks_treated === 1 ? '' : 's'} across ${readout.systems_with_risks_treated} system${readout.systems_with_risks_treated === 1 ? '' : 's'}`}
            </span>
          </div>
        </>
      )}

      <div className={styles.readoutRow}>
        <span className={styles.readoutLabel}>Responsible</span>
        <span>{control.owner_name || <>CISO <span className={styles.readoutMuted}>(default)</span></>}</span>
      </div>

      <Link className={styles.soaLink} to={soaPath}>
        See it in the Statement of Applicability →
      </Link>
    </div>
  );
}

// Responsible owner + maturity ceiling. The owner declares the highest maturity any
// deployment of this control may claim, with a reason — a hard cap enforced server-
// side on the per-system maturity ratings. Editable by a control editor (controls.write)
// or the control's named owner; (re)assigning the owner needs controls.write.
function MaturityCeilingSection({ control, users, canWrite, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [ownerId, setOwnerId] = useState(control.owner_user_id ?? '');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  function open() {
    setOwnerId(control.owner_user_id ?? '');
    setErr('');
    setEditing(true);
  }

  async function save() {
    setSaving(true); setErr('');
    try {
      const data = await updateControlMaturityCap(control.id, { owner_user_id: ownerId || null });
      onSaved(data.control);
      setEditing(false);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Responsible owner">
      {editing ? (
        <div className={styles.ceilingForm}>
          <label className={styles.ceilingField}>
            <span className={styles.ceilingLabel}>Responsible owner</span>
            <select className={styles.ceilingSelect} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">— CISO (default) —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{personLabel(u)}</option>
              ))}
            </select>
            <span className={styles.ceilingHint}>Unassigned controls are the CISO&apos;s responsibility by default; delegate to an asset owner/manager (e.g. staff training → HR). The owner sets the control&apos;s organisation-wide maturity.</span>
          </label>
          {err && <span className={styles.ratingFormError}>{err}</span>}
          <div className={styles.ratingFormActions}>
            <button className={styles.ratingFormSave} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className={styles.ratingFormCancel} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className={styles.ceilingCard}>
          <dl className={styles.dl}>
            <dt>Responsible<HelpDot k="controls.owner" placement="top" label="About the responsible owner" /></dt>
            <dd>{control.owner_name || <span className={styles.ceilingDefault}>CISO <span className={styles.empty}>(default)</span></span>}</dd>
          </dl>
          {canWrite ? (
            <button className={styles.rateEditBtn} onClick={open}>
              {control.owner_name ? 'Edit' : 'Set owner'}
            </button>
          ) : (
            <p className={styles.ceilingHint}>Only a control editor can change this.</p>
          )}
        </div>
      )}
    </Section>
  );
}

// Always open: "Our control" is read top to bottom, and folded sections hid
// what the page is for (owner feedback, 2026-09-22).
function Section({ title, children, helpKey, helpPlacement = 'bottom', anchorRef }) {
  const dot = helpKey && (
    <HelpDot k={helpKey} placement={helpPlacement} label={typeof title === 'string' ? `About ${title}` : undefined} />
  );
  return (
    <div className={styles.section} ref={anchorRef}>
      <h2 className={styles.sectionTitle}>{title}{dot}</h2>
      {children}
    </div>
  );
}

function Th({ children, center }) {
  return (
    <th className={`${styles.th} ${center ? styles.thCenter : ''}`}>{children}</th>
  );
}

// The objective's DERIVED status (v124) — see utils/objectiveStatus.js.
function StatusPill({ status }) {
  const tone = {
    good:      styles.statusActive,
    attention: styles.statusUnderReview,
    neutral:   styles.statusPlanned,
    muted:     styles.statusNotApplicable,
  };
  const s = OBJECTIVE_STATUS[status];
  return (
    <span className={`${styles.statusPill} ${s ? tone[s.tone] : ''}`} title={s?.hint}>
      {s?.label ?? status}
    </span>
  );
}

function ApplicabilityBadge({ isBaseline }) {
  const label = isBaseline ? 'Baseline' : 'Specific';
  const tip   = isBaseline ? APPLICABILITY_TIPS.baseline : APPLICABILITY_TIPS.specific;
  return (
    <span className={`${styles.applicabilityBadge} ${isBaseline ? styles.applicabilityBaseline : styles.applicabilitySpecific}`}>
      {label}
      <span className={styles.tooltip}>{tip}</span>
    </span>
  );
}

function ApplicabilityToggle({ isBaseline, saving, onChange }) {
  return (
    <span className={styles.applicabilityToggle} title="Click to change applicability">
      <button
        className={`${styles.applicabilityOption} ${!isBaseline ? styles.applicabilityOptionActive : ''}`}
        onClick={() => !isBaseline || onChange(false)}
        disabled={saving || !isBaseline}
        type="button"
      >
        Specific
      </button>
      <button
        className={`${styles.applicabilityOption} ${isBaseline ? styles.applicabilityOptionActive : ''}`}
        onClick={() => isBaseline || onChange(true)}
        disabled={saving || isBaseline}
        type="button"
      >
        Baseline
      </button>
    </span>
  );
}


