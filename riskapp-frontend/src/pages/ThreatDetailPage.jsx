// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getThreat, getThreatControls, linkThreatControl, unlinkThreatControl, updateThreat, archiveThreat, getControls,
         getSystems, identifyThreatOnSystem, unidentifyThreatOnSystem } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { EntityKind } from '../components/EntityKind';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { useViewMode } from '../hooks/useViewMode';
import { RatingScaleRow } from '../components/RatingScaleRow';
import { RatingChip } from '../components/RatingChip';
import { RiskCreateModal } from '../components/RiskCreateModal';
import { ChipSelector } from '../components/CiaTable';
import { FrameworkRef, TypePill, EffectivenessDots } from '../components/ControlBadges';
import styles from './ThreatDetailPage.module.css';

const CAN_WRITE = new Set(['ciso', 'risk_analyst', 'security_consultant', 'admin']);

const CATEGORIES = [
  { value: 'accidental',    label: 'Accidental' },
  { value: 'deliberate',    label: 'Deliberate' },
  { value: 'environmental', label: 'Environmental' },
];
const SOURCES = [
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
  { value: 'natural',  label: 'Natural' },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ThreatDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user, hasCapability } = useAuth();
  const canWrite = CAN_WRITE.has(user?.role);

  const viewMode = useViewMode();
  const isExpert = viewMode.isExpert;

  const [threat,   setThreat]  = useState(null);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');
  const [editing,  setEditing] = useState(false);
  const [form,     setForm]    = useState(null);
  const [saving,   setSaving]  = useState(false);
  const [archiving,setArch]    = useState(false);
  const [saveErr,  setSaveErr] = useState('');
  const [controls, setControls] = useState([]);
  const [ctrlSearch,  setCtrlSearch]  = useState('');
  const [ctrlResults, setCtrlResults] = useState([]);
  const [ctrlBusy,    setCtrlBusy]    = useState(false);
  const [ctrlErr,     setCtrlErr]     = useState('');

  // Identification: which systems this threat applies to. Gated on risks.write
  // rather than threats.write — declaring an exposure is a risk-register act,
  // and the API guards it the same way.
  const canIdentify = hasCapability('risks.write');
  const [allSystems,    setAllSystems]    = useState([]);
  const [addSystemId,   setAddSystemId]   = useState('');
  const [identifying,   setIdentifying]   = useState(false);
  const [identifyError, setIdentifyError] = useState('');
  // Assessing from here opens the risk wizard already pointed at this
  // threat × system pair — the same entry point the system page offers.
  const [assessSystem, setAssessSystem] = useState(null);

  const systems = threat?.systems || [];
  const identifiedIds = new Set(systems.map(s => s.id));
  const availableSystems = allSystems
    .filter(s => !identifiedIds.has(s.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function handleIdentify() {
    if (!addSystemId) return;
    setIdentifying(true); setIdentifyError('');
    try {
      await identifyThreatOnSystem(id, addSystemId);
      setAddSystemId('');
      load();
    } catch (err) {
      setIdentifyError(err.response?.data?.error || 'Could not identify this threat on that system.');
    } finally { setIdentifying(false); }
  }

  async function handleUnidentify(s) {
    setIdentifyError('');
    try {
      await unidentifyThreatOnSystem(id, s.id);
      load();
    } catch (err) {
      // The API refuses once a risk has ever existed; surface its explanation
      // rather than a generic failure, since it names the right way out.
      setIdentifyError(err.response?.data?.error || 'Could not remove this identification.');
    }
  }

  function load() {
    setLoading(true); setError('');
    getThreat(id)
      .then(d => {
        setThreat(d);
        setForm({
          name:                         d.name || '',
          description:                  d.description || '',
          threat_category:              d.threat_category,
          source:                       d.source,
          reference_code:               d.reference_code || '',
          probability_c:                d.probability_c,
          probability_i:                d.probability_i,
          probability_a:                d.probability_a,
          default_baseline_probability: d.default_baseline_probability ?? '',
          probability_notes:            d.probability_notes || '',
        });
      })
      .catch(err => setError(err.response?.data?.error || 'Could not load threat.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadControls() {
    getThreatControls(id)
      .then(c => setControls(c || []))
      .catch(() => setControls([]));
  }

  useEffect(() => { loadControls(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Systems available to identify against — loaded once; the panel filters out
  // the ones already identified.
  useEffect(() => {
    if (!canIdentify) return;
    getSystems()
      .then(d => setAllSystems(d.systems || d || []))
      .catch(() => setAllSystems([]));
  }, [canIdentify]);

  // Debounced search for controls to add to this threat's catalogue.
  useEffect(() => {
    if (!canWrite || ctrlSearch.trim().length < 2) { setCtrlResults([]); return; }
    const linkedIds = new Set(controls.map(c => c.id));
    let cancelled = false;
    const t = setTimeout(async () => {
      setCtrlBusy(true);
      try {
        const { controls: found } = await getControls({ q: ctrlSearch.trim() });
        if (!cancelled) setCtrlResults((found || []).filter(c => !linkedIds.has(c.id)));
      } catch { if (!cancelled) setCtrlResults([]); }
      finally { if (!cancelled) setCtrlBusy(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ctrlSearch, controls, canWrite]);

  async function handleAddControl(controlId) {
    setCtrlErr('');
    try {
      await linkThreatControl(id, controlId);
      setCtrlSearch(''); setCtrlResults([]);
      loadControls();
    } catch (err) {
      setCtrlErr(err.response?.data?.error || 'Failed to link control.');
    }
  }

  async function handleRemoveControl(controlId) {
    setCtrlErr('');
    try {
      await unlinkThreatControl(id, controlId);
      setControls(prev => prev.filter(c => c.id !== controlId));
    } catch (err) {
      setCtrlErr(err.response?.data?.error || 'Failed to remove control.');
    }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function setProbAll(v) {
    setForm(f => ({ ...f, probability_c: v, probability_i: v, probability_a: v }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setSaveErr('Name is required.'); return; }
    setSaving(true); setSaveErr('');
    try {
      await updateThreat(id, {
        ...form,
        default_baseline_probability:
          form.default_baseline_probability === '' ? null : parseInt(form.default_baseline_probability),
      });
      setEditing(false);
      load();
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Save failed.');
    } finally { setSaving(false); }
  }

  async function handleArchive() {
    if (!window.confirm(`Archive "${threat?.name}"? It will no longer appear in the catalogue.`)) return;
    setArch(true);
    try {
      await archiveThreat(id);
      navigate('/threats');
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Archive failed.');
      setArch(false);
    }
  }

  if (loading) return <Shell><div className={styles.page}><BackButton /><p className={styles.muted}>Loading…</p></div></Shell>;
  if (error)   return <Shell><div className={styles.page}><BackButton /><p className={styles.error}>{error}</p></div></Shell>;
  if (!threat) return null;

  const usage = threat.usage_count ?? 0;
  const prob1d = Math.max(form?.probability_c ?? 0, form?.probability_i ?? 0, form?.probability_a ?? 0);

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.titleRow}>
          <BackButton />
          <div className={styles.viewModeSlot}>
            <ViewModeToggle {...viewMode} />
          </div>
        </div>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>
              {threat.name}<EntityKind kind="threat" />
            </h1>
            <div className={styles.meta}>
              <span className={styles.metaChip}>
                {CATEGORY_LABEL[threat.threat_category] || threat.threat_category}
              </span>
              <span className={styles.metaChip}>{threat.source}</span>
              {threat.reference_code && (
                <span className={styles.refCode}>{threat.reference_code}</span>
              )}
              <span className={styles.metaMuted}>
                {usage} active risk{usage !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          {canWrite && !editing && (
            <button className={styles.btnPrimary} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>

        {threat.description && (
          <p className={styles.desc}>{threat.description}</p>
        )}

        {/* ── Probability panel ──────────────────────────────────────────── */}
        <section className={styles.panel}>
          <span className={styles.panelTitle}>Probability hint</span>
          <p className={styles.panelHint}>
            Informed guess at this threat's typical probability. Used to pre-populate
            the risk authoring form — actual probability is set per risk by the analyst.
          </p>

          {editing ? (
            <form onSubmit={handleSave}>
              {/* Core fields */}
              <div className={styles.fieldGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Name <span className={styles.req}>*</span></label>
                  <input className={styles.input} value={form.name}
                    onChange={e => set('name', e.target.value)} />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Reference code</label>
                  <input className={styles.input} value={form.reference_code}
                    onChange={e => set('reference_code', e.target.value)} placeholder="ISO27005-T1.1" />
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Category</label>
                  <select className={styles.select} value={form.threat_category}
                    onChange={e => set('threat_category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Source</label>
                  <select className={styles.select} value={form.source}
                    onChange={e => set('source', e.target.value)}>
                    {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
                <label className={styles.fieldLabel}>Description</label>
                <textarea className={styles.textarea} rows={3}
                  value={form.description} onChange={e => set('description', e.target.value)} />
              </div>

              {/* Probability — business: single word ladder; expert: 3 × chip selector */}
              <div className={styles.probSection}>
                <span className={styles.probSectionLabel}>Probability</span>
                {isExpert ? (
                  <div className={styles.probExpertGrid}>
                    {['c', 'i', 'a'].map(dim => {
                      const label = dim === 'c' ? 'Confidentiality' : dim === 'i' ? 'Integrity' : 'Availability';
                      return (
                        <div key={dim} className={styles.probDimRow}>
                          <span className={styles.probDimLabel}>{label}</span>
                          <ChipSelector
                            value={form[`probability_${dim}`]}
                            onChange={v => set(`probability_${dim}`, v)}
                            wordScale="probability"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.probBusinessRow}>
                    <ChipSelector value={prob1d} onChange={setProbAll} wordScale="probability" />
                  </div>
                )}
              </div>

              <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
                <label className={styles.fieldLabel}>Probability notes</label>
                <textarea className={styles.textarea} rows={2}
                  value={form.probability_notes} onChange={e => set('probability_notes', e.target.value)}
                  placeholder="Why these baselines? Any data source?" />
              </div>

              {saveErr && <p className={styles.error}>{saveErr}</p>}

              <div className={styles.formActions}>
                {canWrite && (
                  <button type="button" className={styles.btnDanger} onClick={handleArchive}
                    disabled={saving || archiving || usage > 0}
                    title={usage > 0 ? `${usage} risk(s) reference this threat — archive blocked` : ''}>
                    {archiving ? 'Archiving…' : 'Archive'}
                  </button>
                )}
                <div className={styles.formActionsRight}>
                  <button type="button" className={styles.btnSecondary}
                    onClick={() => { setEditing(false); setSaveErr(''); }}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.btnPrimary} disabled={saving || archiving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className={styles.probDisplay}>
              {isExpert ? (
                <div className={styles.probExpertGrid}>
                  {['c', 'i', 'a'].map(dim => {
                    const label = dim === 'c' ? 'Confidentiality' : dim === 'i' ? 'Integrity' : 'Availability';
                    return (
                      <div key={dim} className={styles.probDimRow}>
                        <span className={styles.probDimLabel}>{label}</span>
                        <RatingScaleRow value={threat[`probability_${dim}`]} scale="probability" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <RatingScaleRow value={prob1d} scale="probability" />
              )}
              {threat.probability_notes && (
                <p className={styles.probNotes}>{threat.probability_notes}</p>
              )}
            </div>
          )}
        </section>

        {/* ── Metadata ──────────────────────────────────────────────────── */}
        {!editing && (
          <section className={styles.panel}>
            <span className={styles.panelTitle}>Metadata</span>
            <div className={styles.metaGrid}>
              <span className={styles.metaGridLabel}>Category</span>
              <span>{CATEGORY_LABEL[threat.threat_category] || threat.threat_category}</span>
              <span className={styles.metaGridLabel}>Source</span>
              <span>{threat.source}</span>
              {threat.reference_code && <>
                <span className={styles.metaGridLabel}>Reference</span>
                <span className={styles.refCode}>{threat.reference_code}</span>
              </>}
              <span className={styles.metaGridLabel}>Active risks</span>
              <span>{usage} risk{usage !== 1 ? 's' : ''}</span>
              {threat.probability_set_at && <>
                <span className={styles.metaGridLabel}>Probability set</span>
                <span>{fmtDate(threat.probability_set_at)}{threat.probability_set_by_name ? ` by ${threat.probability_set_by_name}` : ''}</span>
              </>}
            </div>
          </section>
        )}

        {/* ── Systems affected (identification) ──────────────────────────── */}
        {!editing && (
          <section className={styles.panel}>
            <span className={styles.panelTitle}>Systems affected</span>
            <p className={styles.panelHint}>
              Systems this threat has been identified against. Identifying an exposure
              here does not score it — each system is assessed separately, which is what
              produces its risk.
            </p>

            {canIdentify && (
              <div className={styles.addRow}>
                <select
                  className={styles.select}
                  value={addSystemId}
                  onChange={e => setAddSystemId(e.target.value)}
                >
                  <option value="">Identify on a system…</option>
                  {availableSystems.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.department_name ? ` — ${s.department_name}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.btnSecondary}
                  disabled={!addSystemId || identifying}
                  onClick={handleIdentify}
                >
                  {identifying ? 'Adding…' : 'Identify'}
                </button>
              </div>
            )}
            {identifyError && <p className={styles.errorMsg}>{identifyError}</p>}

            {systems.length === 0 ? (
              <p className={styles.muted}>This threat is not identified against any system yet.</p>
            ) : (
              <ul className={styles.controlList}>
                {systems.map(s => {
                  // The WHOLE row is the click target — .controlRow styles it as
                  // clickable (pointer + hover), so anything less is a dead
                  // affordance. Destination follows the row's state: an assessed
                  // row opens its risk, an unassessed one opens the assessment
                  // for this exact pair, which is the obvious next step.
                  const openRow = () => {
                    if (s.assessed) {
                      navigate(`/risks/${s.validation_status === 'validated' ? 'current' : 'future'}?selected=${s.risk_id}`);
                    } else if (canIdentify) {
                      setAssessSystem(s);
                    } else {
                      navigate(`/systems/${s.id}`);
                    }
                  };
                  // Inner buttons must not also fire the row.
                  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

                  return (
                    <li
                      key={s.id}
                      className={styles.controlRow}
                      role="button"
                      tabIndex={0}
                      onClick={openRow}
                      onKeyDown={e => e.key === 'Enter' && openRow()}
                      title={s.assessed ? 'Open the risk for this system' : 'Assess this threat on this system'}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {s.name}
                        <span className={styles.muted} style={{ marginLeft: 8, fontSize: 12 }}>
                          {s.department_name}
                        </span>
                      </div>

                      {s.assessed ? (
                        <>
                          <RatingChip value={s.risk_score} scale="risk" variant={isExpert ? 'number' : 'word'} />
                          <button className={styles.btnSecondary} onClick={stop(openRow)}>
                            View risk →
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={s.stale ? styles.staleTag : styles.pendingTag}>
                            {s.stale ? 'Unassessed — overdue' : 'Not assessed'}
                          </span>
                          {canIdentify && (
                            <button className={styles.btnPrimary} onClick={stop(() => setAssessSystem(s))}>
                              Assess →
                            </button>
                          )}
                          {/* Un-identifying is only for mis-links. The API refuses it
                              once any risk has existed for the pair, so the button is
                              absent rather than disabled — offering an action that
                              will be rejected is worse than not offering it. */}
                          {canIdentify && s.can_unlink && (
                            <button
                              className={styles.btnGhost}
                              title="Remove — only possible because this pair has never been assessed"
                              onClick={stop(() => handleUnidentify(s))}
                            >
                              Remove
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* ── Mitigating controls (catalogue) ───────────────────────────── */}
        {!editing && (
          <section className={styles.panel}>
            <span className={styles.panelTitle}>Mitigating controls</span>
            <p className={styles.panelHint}>
              Controls known to address this threat. Apply them to a system from a
              risk's “Controls against this threat” panel.
            </p>
            {controls.length === 0 ? (
              <p className={styles.muted}>No controls linked to this threat yet.</p>
            ) : (
              <ul className={styles.controlList}>
                {controls.map(c => (
                  <li
                    key={c.id}
                    className={styles.controlRow}
                    onClick={() => navigate(`/controls/${c.id}?from=threat`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && navigate(`/controls/${c.id}?from=threat`)}
                  >
                    <FrameworkRef framework={c.framework} frameworkRef={c.framework_ref} />
                    <span className={styles.controlTitle}>{c.title}</span>
                    <TypePill type={c.control_type} />
                    {c.effectiveness != null && <EffectivenessDots value={c.effectiveness} />}
                    {canWrite && (
                      <button
                        className={styles.controlRemove}
                        onClick={e => { e.stopPropagation(); handleRemoveControl(c.id); }}
                        title="Remove from this threat"
                        aria-label={`Remove control: ${c.title}`}
                      >×</button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {ctrlErr && <p className={styles.error}>{ctrlErr}</p>}

            {canWrite && (
              <div className={styles.addControlBlock}>
                <input
                  className={styles.input}
                  placeholder="Search controls to link (min 2 chars)…"
                  value={ctrlSearch}
                  onChange={e => setCtrlSearch(e.target.value)}
                />
                {ctrlBusy && <p className={styles.muted}>Searching…</p>}
                {!ctrlBusy && ctrlResults.length > 0 && (
                  <ul className={styles.controlList}>
                    {ctrlResults.slice(0, 10).map(c => (
                      <li key={c.id} className={styles.controlResultRow}>
                        <FrameworkRef framework={c.framework} frameworkRef={c.framework_ref} />
                        <span className={styles.controlTitle}>{c.title}</span>
                        <TypePill type={c.control_type} />
                        <button className={styles.controlAdd} onClick={() => handleAddControl(c.id)}>Add</button>
                      </li>
                    ))}
                  </ul>
                )}
                {!ctrlBusy && ctrlSearch.trim().length >= 2 && ctrlResults.length === 0 && (
                  <p className={styles.muted}>No matching controls found.</p>
                )}
              </div>
            )}
          </section>
        )}

        {assessSystem && (
          <RiskCreateModal
            initialSystemId={assessSystem.id}
            initialThreatId={id}
            onClose={() => setAssessSystem(null)}
            onCreated={(id) => { setAssessSystem(null); navigate(`/risks/${id}?panel=coverage`); }}
          />
        )}
      </div>
    </Shell>
  );
}
