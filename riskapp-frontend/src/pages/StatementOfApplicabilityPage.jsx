// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { getSoa, getSoaCoverage, updateSoaEntry, downloadSoaExport, getSoaVersions, createSoaVersion, downloadSoaVersionExport, getStandards, decideSoaBulk, getScopes, setDeliveryBulk } from '../api';
import { MaturityChip } from '../components/MaturityChip';
import { partialQualifier } from '../utils/implementationStatus';
import SoaFindingsPanel from '../components/SoaFindingsPanel';
import { DRIVERS, IMPLEMENTATION_LABEL, DELIVERY_MODES, DELIVERY_LABEL } from '../utils/soaVocabulary';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { Spinner } from '../components/Spinner';
import { HelpDot } from '../components/HelpDot';
import { ControlStatusPill } from '../components/ControlStatusPill';
import styles from './StatementOfApplicabilityPage.module.css';

// Risk-traceability bands (Sprint 2b) — mirrors the server's derivation so the
// badge stays live through an optimistic edit. ISO 27001:2022 6.1.3 decouples
// applicability from risk-traceability: a "baseline" control is legitimately
// applicable via a non-risk driver even though it treats no identified risk.
const BANDS = {
  treated:        { label: 'Treated',  hint: 'Treats one or more identified risks (the governed, traceable core).' },
  baseline:       { label: 'Baseline', hint: 'Implemented but treats no identified risk yet — applicable via a non-risk driver (legal/contractual/business).' },
  untraced:       { label: 'Untraced', hint: 'Applicable and not yet implemented, with no risk link — feeds the action plan.' },
  not_applicable: { label: 'Excluded', hint: 'Excluded from the ISMS.' },
};
function deriveBand(c) {
  if (!c.applicable) return 'not_applicable';
  if ((c.risks_treated ?? 0) > 0) return 'treated';
  if (c.implementation_status === 'implemented' || c.implementation_status === 'partial') return 'baseline';
  return 'untraced';
}

// A requirement's state on a standard's lens — DERIVED on the server from the
// controls mapped to it (v122). The requirement records nothing but an exclusion.
const REQ_STATES = {
  covered:  { label: 'Covered',        hint: 'At least one fully mapped control objective is applicable.' },
  partial:  { label: 'Partly covered', hint: 'Only partially mapped control objectives are applicable.' },
  excluded: { label: 'Excluded',       hint: 'Excluded for this standard, with a reason.' },
  gap:      { label: 'Gap',            hint: 'No applicable control objective meets this requirement, and it is not excluded.' },
};
const STATUS_LABEL = IMPLEMENTATION_LABEL;

// Clicking a summary figure narrows the register to the rows it counted — the
// figure and the list are then the same question asked twice (owner, 2026-09-24).
// "Applicable, not implemented" is the existing gap toggle, not a second
// mechanism, and the traceability figures drive the existing band filter.
export const STAT_FILTERS = {
  all:                   () => true,
  applicable:            c => !!c.applicable,
  not_applicable:        c => !c.applicable,
  implemented:           c => c.implementation_status === 'implemented',
  missing_justification: c => !!c.applicable && !String(c.justification || '').trim(),
  // A standard's lens counts requirement states instead.
  covered:               c => c.requirement_state === 'covered',
  partial:               c => c.requirement_state === 'partial',
  excluded:              c => c.requirement_state === 'excluded',
  gap:                   c => c.requirement_state === 'gap',
};

function computeSummary(controls) {
  const applicable = controls.filter(c => c.applicable);
  return {
    total:                      controls.length,
    applicable:                 applicable.length,
    not_applicable:             controls.length - applicable.length,
    implemented:                controls.filter(c => c.implementation_status === 'implemented').length,
    applicable_not_implemented: applicable.filter(c => c.implementation_status !== 'implemented').length,
    missing_justification:      applicable.filter(c => !c.justification || !c.justification.trim()).length,
    missing_drivers:            applicable.filter(c => !c.drivers || c.drivers.length === 0).length,
  };
}

// framework: 'all' — the record itself, one entry per control — or the code of any
// standard in the registry, which is a derived lens on that record. Approved
// versions snapshot the record, so they live on the 'all' view.
export function StatementOfApplicabilityPage({ framework: frameworkProp }) {
  const params = useParams();
  const framework = frameworkProp || params.framework || 'all';
  const isIso = framework === 'iso27001';
  // 'all' and 'custom' are the record itself (editable); anything else is a
  // standard's derived lens. Approved versions snapshot the WHOLE record, so they
  // live on 'all' only.
  const isCustom   = framework === 'custom';
  const isStandard = framework !== 'all' && !isCustom;
  const isWholeRecord = framework === 'all';
  const { hasCapability } = useAuth();
  const navigate = useNavigate();
  const canEdit = hasCapability('controls.write');

  const [controls, setControls] = useState([]);   // flat, each tagged with .group (+ band on ISO)
  const [groupOrder, setGroupOrder] = useState([]);
  const [coverage, setCoverage] = useState(null);  // { appetite_score, untreated_risks, controls }
  const [viewLabel, setViewLabel] = useState('');
  const [summaryFromServer, setSummaryFromServer] = useState(null);
  const [standards, setStandards] = useState([]);  // for the view switcher
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  // In-flight saves, controls that just saved (for the transient tick), and
  // controls with typed-but-not-yet-committed text. Three states rather than
  // one, because "did that save?" and "is anything outstanding?" are different
  // questions and the dangerous one is text that has not been SENT yet.
  const [savingCount, setSavingCount] = useState(0);
  const [justSaved, setJustSaved]     = useState(() => new Set());
  const [editingIds, setEditingIds]   = useState(() => new Set());

  // The tick is transient: it confirms THIS save and then gets out of the way.
  // Timers are tracked so unmounting mid-fade cannot set state on a dead
  // component, and so a second save of the same control restarts its own timer
  // rather than being cut short by the first.
  const tickTimers = useRef(new Map());
  const markSaved = useCallback((controlId) => {
    setJustSaved(s => new Set(s).add(controlId));
    const timers = tickTimers.current;
    clearTimeout(timers.get(controlId));
    timers.set(controlId, setTimeout(() => {
      setJustSaved(s => { const n = new Set(s); n.delete(controlId); return n; });
      timers.delete(controlId);
    }, 2000));
  }, []);
  useEffect(() => {
    const timers = tickTimers.current;
    return () => { for (const t of timers.values()) clearTimeout(t); timers.clear(); };
  }, []);

  // Rows report their own typed-but-uncommitted state; the toolbar and the
  // navigation guard both need it, and only the row knows its draft.
  const reportEditing = useCallback((controlId, isEditing) => {
    setEditingIds(s => {
      if (isEditing === s.has(controlId)) return s;
      const n = new Set(s);
      if (isEditing) n.add(controlId); else n.delete(controlId);
      return n;
    });
  }, []);

  // Losing work to a stray click is the failure this page is prone to, so the
  // browser asks before discarding anything typed or unsaved.
  const hasPendingWork = editingIds.size > 0;
  useEffect(() => {
    if (!hasPendingWork) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasPendingWork]);

  const [busy, setBusy]       = useState(false);

  // The register is read-only; its one editing act is deciding several objectives
  // at once (2026-09-22). Everything else about an objective is edited on its page.
  const [selected, setSelected]     = useState(() => new Set());
  const [bulkApplies, setBulkApplies] = useState(true);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkDrivers, setBulkDrivers] = useState(() => new Set());
  const [bulkBusy, setBulkBusy]     = useState(false);
  const [bulkNote, setBulkNote]     = useState('');
  // Where objectives apply (v126): the scopes, for the filter and the bulk choice.
  const [scopes, setScopes]         = useState([]);
  const [scopeFilter, setScopeFilter] = useState('any');     // any | org | <scope id>
  const [bulkScope, setBulkScope]   = useState('');           // '' = whole organisation
  const [bulkDelivery, setBulkDelivery] = useState('');       // v127: set how the selected are delivered
  const [gapOnly, setGapOnly] = useState(false);
  const [statFilter, setStatFilter] = useState('all');   // a summary figure clicked (v-ui 2026-09-24)
  const [bandFilter, setBandFilter] = useState('all');

  const [versions, setVersions]   = useState([]);
  const [approveNote, setApproveNote] = useState('');
  const [approving, setApproving] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!isWholeRecord) return;
    try { const d = await getSoaVersions(); setVersions(d.versions); } catch { /* ignore */ }
  }, [isWholeRecord]);

  useEffect(() => {
    getStandards().then(d => setStandards(d.standards || [])).catch(() => setStandards([]));
    getScopes().then(d => setScopes(d.scopes || [])).catch(() => setScopes([]));
  }, []);

  // `quiet` refreshes without the loading state, so a requirement's re-derived
  // state can come back without unmounting the page (and losing scroll).
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [d, cov] = await Promise.all([
        getSoa(framework),
        // Risk traceability applies to whatever catalogue is on screen, not just
        // ISO. Asking for the same framework keeps the two halves of this page
        // describing the same controls (defect 1f: the server used to hard-filter
        // ISO, which has 0 controls loaded, so this always came back empty).
        getSoaCoverage(framework).catch(() => null),
      ]);
      const covMap = new Map((cov?.controls || []).map(c => [c.control_id, c]));
      const flat = d.groups.flatMap(g => g.controls.map(c => {
        const cv = covMap.get(c.control_id) || {};
        const merged = {
          ...c,
          group:             g.label,
          risks_treated:     cv.risks_treated ?? 0,
          systems_count:     cv.systems_count ?? 0,
          max_treated_score: cv.max_treated_score ?? null,
          any_verified:      !!cv.any_verified,
        };
        merged.band = deriveBand(merged);
        return merged;
      }));
      setControls(flat);
      setGroupOrder(d.groups.map(g => g.label));
      setCoverage(cov);
      setViewLabel(d.framework_label || '');
      setSummaryFromServer(d.summary || null);
      setError('');
    } catch (err) {
      setControls([]); setGroupOrder([]); setCoverage(null);
      setError(err?.response?.status === 404
        ? `There is no standard with the code "${framework}" in the registry.`
        : 'Could not load the Statement of Applicability.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [framework]);

  useEffect(() => { load(); loadVersions(); }, [load, loadVersions]);

  // A requirement records only its exclusion; everything else about it is derived,
  // so after a change the server's re-derivation is the truth — refresh quietly.
  async function patchRequirement(requirementId, body) {
    setSavingCount(n => n + 1);
    try {
      await updateSoaEntry(requirementId, body);
      await load({ quiet: true });
      markSaved(requirementId);
      return true;
    } catch (err) {
      setError(err?.response?.data?.error || 'That change was not saved.');
      return false;
    } finally {
      setSavingCount(n => n - 1);
    }
  }

  const toggleSelected = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setGroupSelected = (ids, on) => setSelected(prev => {
    const n = new Set(prev); ids.forEach(id => (on ? n.add(id) : n.delete(id))); return n;
  });

  async function applyBulk() {
    if (!bulkApplies && !bulkReason.trim()) {
      setError('Marking objectives not applicable needs a reason.');
      return;
    }
    setBulkBusy(true); setError(''); setBulkNote('');
    try {
      const res = await decideSoaBulk({
        control_ids: [...selected], applicable: bulkApplies,
        justification: bulkReason, drivers: [...bulkDrivers],
        ...(bulkApplies ? { scope_ids: bulkScope ? [bulkScope] : [] } : {}),
      });
      await load({ quiet: true });
      setSelected(new Set()); setBulkReason(''); setBulkDrivers(new Set());
      setBulkNote(`Decided ${res.decided} objective${res.decided === 1 ? '' : 's'}`
        + (res.justification_kept ? `; kept the justification already written on ${res.justification_kept}.` : '.'));
    } catch (err) {
      // Nothing was changed (the decision is all-or-nothing); the selection and the
      // typed reason stay so it can be tried again.
      setError(err?.response?.data?.error || 'The decision was not applied. Nothing was changed.');
    } finally {
      setBulkBusy(false);
    }
  }

  // How the selected objectives' controls are delivered (v127) — a property of the
  // control, set here for triage (e.g. every governance objective, organisation-wide).
  async function applyDelivery() {
    if (!bulkDelivery) return;
    setBulkBusy(true); setError(''); setBulkNote('');
    try {
      const res = await setDeliveryBulk([...selected], bulkDelivery);
      await load({ quiet: true });
      setSelected(new Set()); setBulkDelivery('');
      setBulkNote(`Delivery set to ${DELIVERY_LABEL[bulkDelivery].toLowerCase()} on ${res.updated} objective${res.updated === 1 ? '' : 's'}`
        + (res.unchanged ? ` (${res.unchanged} already were).` : '.'));
    } catch (err) {
      setError(err?.response?.data?.error || 'The delivery mode was not set. Nothing was changed.');
    } finally {
      setBulkBusy(false);
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    setBusy(true);
    try { const { blob, filename } = await downloadSoaExport(framework); triggerDownload(blob, filename); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await createSoaVersion(approveNote.trim() || null);
      setApproveNote('');
      await loadVersions();
    } catch (err) {
      // Surface the server's reason (e.g. "Nothing has changed since version N").
      setError(err?.response?.data?.error || 'Could not approve a new version.');
    } finally {
      setApproving(false);
    }
  }

  async function handleVersionExport(versionId) {
    try { const { blob, filename } = await downloadSoaVersionExport(versionId); triggerDownload(blob, filename); }
    catch { /* ignore */ }
  }

  // Clicking a figure again clears it, so a filter is never a trap.
  const pickStat = (key) => { setGapOnly(false); setStatFilter(f => (f === key ? 'all' : key)); };
  const pickBand = (key) => setBandFilter(b => (b === key ? 'all' : key));
  const clearRowFilters = () => { setStatFilter('all'); setGapOnly(false); setBandFilter('all'); };
  const noRowFilter = statFilter === 'all' && !gapOnly && bandFilter === 'all';
  // One predicate, used by the groups and by the "nothing matches" line, so the
  // two can never disagree about what is on screen.
  const rowFilter = (c) =>
    (STAT_FILTERS[statFilter] || STAT_FILTERS.all)(c)
    && (!gapOnly || (c.applicable && c.implementation_status !== 'implemented'))
    && (!hasCoverage || bandFilter === 'all' || c.band === bandFilter)
    && (isStandard || scopeFilter === 'any'
        || (scopeFilter === 'org'
              ? c.applicable && !(c.scopes || []).length
              : (c.scopes || []).some(sc => sc.id === scopeFilter)));

  const summary = computeSummary(controls);
  const reqSummary = isStandard ? (summaryFromServer || {}) : null;
  const viewOptions = [
    { code: 'all', name: 'All control objectives' },
    { code: 'custom', name: 'Custom control objectives' },
    ...standards.filter(s => (s.reference_count ?? 0) > 0 || s.code === framework),
  ];
  const cov = {
    treated:  controls.filter(c => c.band === 'treated').length,
    baseline: controls.filter(c => c.band === 'baseline').length,
    untraced: controls.filter(c => c.band === 'untraced').length,
  };
  const untreatedRisks = coverage?.untreated_risks || [];
  const hasCoverage    = (coverage?.controls?.length ?? 0) > 0;

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>
              {framework !== 'all' ? `Statement of Applicability — ${viewLabel || framework}` : 'Statement of Applicability'}
              {isIso
                ? <HelpDot k="soa.iso27001" placement="bottom" label="About the Statement of Applicability" />
                : isStandard
                ? <HelpDot k="soa.standard" placement="bottom" label="About the Statement of Applicability" />
                : isCustom
                ? <HelpDot k="soa.custom" placement="bottom" label="About the Statement of Applicability" />
                : <HelpDot k="soa.all_controls" placement="bottom" label="About the Statement of Applicability" />}
            </h1>
            <p className={styles.desc}>
              {isStandard
                ? <>Each standard requirement is read from the control objectives mapped to it: covered, partly covered, excluded or a gap. Applicability and status are recorded once, on the control objective, in <em>All control objectives</em>. Here you can only exclude a requirement, with a reason. </>
                : isCustom
                ? <>Your own control objectives — those mapped to no standard, filed by their own reference. Tick one <em>applicable</em> to adopt it. </>
                : <>The record: every control objective in the library. Tick one <em>applicable</em> to adopt it — it becomes a control the organisation will build, rate and implement. Each standard&apos;s view is derived from this. </>}
              {!canEdit && 'View only.'}
            </p>
          </div>
          <div className={styles.headerActions}>
            <label className={styles.viewSwitch}>
              View
              <select value={framework} onChange={e => navigate(e.target.value === 'all' ? '/soa' : `/soa/${e.target.value}`)}>
                {viewOptions.map(v => <option key={v.code} value={v.code}>{v.name}</option>)}
              </select>
            </label>
            {!canEdit && <ReadOnlyBadge reason="You need the controls.write capability to edit the SoA." />}
            <button className={styles.exportBtn} onClick={handleExport} disabled={busy || loading}>
              {busy ? 'Preparing…' : '⬇ Export CSV'}
            </button>
          </div>
        </div>

        {/* Persistent, always answerable at a glance. The error banner below
            reports a problem; this reports the STATE, including the quiet case
            where nothing is wrong and everything is safely stored. */}
        {canEdit && isStandard && (
          <div className={styles.saveStatus} aria-live="polite">
            {savingCount > 0 ? (
              <span className={styles.saveSaving}>⟳ Saving…</span>
            ) : editingIds.size > 0 ? (
              <span className={styles.saveEditing}>
                ● {editingIds.size} being edited — click away from the box to save
              </span>
            ) : (
              <span className={styles.saveClean}>✓ All changes saved</span>
            )}
          </div>
        )}

        {error && (
          <div className={styles.errorBanner} role="alert">
            {/* The banner explains WHAT went wrong; the save-status line above
                owns the count and the Retry. Two retry buttons for one action
                is worse than none — you cannot tell whether they differ. */}
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className={styles.loading}><Spinner /><span>Loading…</span></div>
        ) : (
          <>
            {isStandard ? (
            <div className={styles.summaryRow}>
              <Stat label="Requirements" value={reqSummary.total ?? 0}
                    onClick={clearRowFilters} active={noRowFilter} title="Show all requirements" />
              <Stat label="Covered" value={reqSummary.covered ?? 0} color="var(--green)"
                    onClick={() => pickStat('covered')} active={statFilter === 'covered'} />
              <Stat label="Partly covered" value={reqSummary.partial ?? 0} color="var(--amber)"
                    onClick={() => pickStat('partial')} active={statFilter === 'partial'} />
              <Stat label="Excluded" value={reqSummary.excluded ?? 0}
                    onClick={() => pickStat('excluded')} active={statFilter === 'excluded'} />
              <Stat label="Gap" value={reqSummary.gap ?? 0} color={reqSummary.gap ? 'var(--red)' : 'var(--text-muted)'}
                    onClick={() => pickStat('gap')} active={statFilter === 'gap'} />
              <Stat label="Implemented" value={reqSummary.implemented ?? 0} color="var(--green)"
                    onClick={() => pickStat('implemented')} active={statFilter === 'implemented'} />
            </div>
            ) : (
            <div className={styles.summaryRow}>
              <Stat label="Control objectives" value={summary.total}
                    onClick={clearRowFilters} active={noRowFilter} title="Show all objectives" />
              <Stat label="Applicable" value={summary.applicable}
                    onClick={() => pickStat('applicable')} active={statFilter === 'applicable'} />
              <Stat label="Not applicable" value={summary.not_applicable}
                    onClick={() => pickStat('not_applicable')} active={statFilter === 'not_applicable'} />
              <Stat label="Implemented" value={summary.implemented} color="var(--green)"
                    onClick={() => pickStat('implemented')} active={statFilter === 'implemented'} />
              {/* The same rows as the gap toggle below: one mechanism, two ways in. */}
              <Stat label="Applicable, not implemented" value={summary.applicable_not_implemented} color="var(--amber)"
                    onClick={() => { setStatFilter('all'); setGapOnly(g => !g); }} active={gapOnly} />
              <Stat label="Missing justification" value={summary.missing_justification} color={summary.missing_justification ? 'var(--amber)' : 'var(--text-muted)'}
                    onClick={() => pickStat('missing_justification')} active={statFilter === 'missing_justification'} />
            </div>
            )}

            {/* Where the SoA contradicts what is deployed (v130). The record view
                only: findings are about control objectives, not a standard's
                requirements. Re-fetched on every reload of the rows. */}
            {!isStandard && <SoaFindingsPanel refreshKey={controls} />}

            {/* Shown whenever coverage came back with something to say. An
                empty catalogue (ISO has no controls loaded) has no traceability
                to report, and a strip of zeros reads as a finding rather than an
                absence. */}
            {hasCoverage && (
            <div className={styles.covStrip}>
              <span className={styles.covStripTitle}>
                Risk traceability
                <HelpDot k="soa.coverage.risk_traceability" placement="bottom" label="About risk traceability bands" />
              </span>
              <Stat label="Treated" value={cov.treated} color="var(--green)"
                    onClick={() => pickBand('treated')} active={bandFilter === 'treated'} />
              <Stat label="Baseline" value={cov.baseline} color="var(--text-muted)"
                    onClick={() => pickBand('baseline')} active={bandFilter === 'baseline'} />
              <Stat label="Untraced" value={cov.untraced} color={cov.untraced ? 'var(--amber)' : 'var(--text-muted)'}
                    onClick={() => pickBand('untraced')} active={bandFilter === 'untraced'} />
              {/* Not a filter: these are RISKS, not objectives — they are listed
                  in full just below, so the figure does not pretend to narrow the
                  register. */}
              <Stat
                label="Untreated risks"
                value={untreatedRisks.length}
                color={untreatedRisks.length ? 'var(--red)' : 'var(--green)'}
              />
            </div>
            )}

            {hasCoverage && untreatedRisks.length > 0 && (
              <section className={styles.untreated} role="alert">
                <h2 className={styles.untreatedTitle}>
                  ⚠ {untreatedRisks.length} risk{untreatedRisks.length === 1 ? '' : 's'} above appetite
                  {coverage?.appetite_score ? ` (score ≥ ${coverage.appetite_score})` : ''} with no control treating
                  {untreatedRisks.length === 1 ? ' it' : ' them'}
                  <HelpDot k="soa.untreated_risks" placement="bottom" />
                </h2>
                <p className={styles.untreatedDesc}>
                  No control is deployed on the risk&apos;s system that addresses its threat. Either deploy a mitigating
                  control or record a documented risk acceptance.
                </p>
                <ul className={styles.untreatedList}>
                  {untreatedRisks.map(r => (
                    <li
                      key={r.risk_id}
                      className={styles.untreatedItem}
                      onClick={() => navigate(`/risks/${r.risk_id}`)}
                      title="Open risk detail"
                    >
                      <span className={styles.untreatedScore}>{r.risk_score}</span>
                      <span className={styles.untreatedMeta}>{r.threat_name} · {r.system_name}</span>
                      <span className={styles.untreatedGo}>→</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className={styles.controlsBar}>
              {!isStandard && scopes.length > 0 && (
                <label className={styles.bandFilterLabel}>
                  Applies in
                  <select className={styles.bandFilter} value={scopeFilter} onChange={e => setScopeFilter(e.target.value)}>
                    <option value="any">Anywhere</option>
                    <option value="org">The whole organisation</option>
                    {scopes.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                  </select>
                </label>
              )}
              <label className={styles.gapToggle} title="Show only applicable controls that aren't fully implemented — these are the gaps that feed the action plan.">
                <input type="checkbox" checked={gapOnly} onChange={e => setGapOnly(e.target.checked)} />
                Show only applicable &amp; not implemented ({summary.applicable_not_implemented})
              </label>
              {hasCoverage && (
              <label className={styles.bandFilterLabel}>
                Traceability
                <select className={styles.bandFilter} value={bandFilter} onChange={e => setBandFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="treated">Treated ({cov.treated})</option>
                  <option value="baseline">Baseline ({cov.baseline})</option>
                  <option value="untraced">Untraced ({cov.untraced})</option>
                </select>
              </label>
              )}
            </div>

            {isWholeRecord && (
            <section className={styles.versions}>
              <div className={styles.versionsHead}>
                <h2 className={styles.versionsTitle}>Approved versions <HelpDot k="soa.versions" placement="bottom" /></h2>
                {canEdit && (
                  <div className={styles.approveRow}>
                    <input
                      className={styles.noteInput}
                      placeholder="Note (e.g. approved at SWG 2026-06)"
                      value={approveNote}
                      onChange={e => setApproveNote(e.target.value)}
                    />
                    <button className={styles.approveBtn} onClick={handleApprove} disabled={approving}>
                      {approving ? 'Approving…' : '✓ Approve current as new version'}
                    </button>
                  </div>
                )}
              </div>
              {versions.length === 0 ? (
                <p className={styles.versionsEmpty}>No approved versions yet. The live SoA above is a working draft until approved.</p>
              ) : (
                <ul className={styles.versionList}>
                  {versions.map(v => (
                    <li key={v.id} className={styles.versionItem}>
                      <span className={styles.versionNo}>v{v.version_no}</span>
                      <span className={styles.versionMeta}>
                        {new Date(v.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {v.approved_by_name ? ` · ${v.approved_by_name}` : ''}
                        {' · '}{v.applicable_count}/{v.control_count} applicable
                        {v.note ? ` · ${v.note}` : ''}
                      </span>
                      <button className={styles.versionExport} onClick={() => handleVersionExport(v.id)}>⬇ CSV</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            )}

            {!isStandard && canEdit && selected.size > 0 && (
              <div className={styles.bulkBar} role="region" aria-label="Decide the selected objectives">
                <span className={styles.bulkCount}>{selected.size} selected</span>
                <div className={styles.bulkChoice} role="radiogroup" aria-label="Decision">
                  <label><input type="radio" checked={bulkApplies} onChange={() => setBulkApplies(true)} /> Adopt</label>
                  <label><input type="radio" checked={!bulkApplies} onChange={() => setBulkApplies(false)} /> Not applicable</label>
                </div>
                {bulkApplies && scopes.length > 0 && (
                  <label className={styles.bulkChoice}>
                    Applies in
                    <select value={bulkScope} onChange={e => setBulkScope(e.target.value)} aria-label="Applies in">
                      <option value="">the whole organisation</option>
                      {scopes.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                    </select>
                  </label>
                )}
                <textarea
                  className={styles.bulkReason} rows={1} value={bulkReason}
                  onChange={e => setBulkReason(e.target.value)}
                  placeholder={bulkApplies ? 'Reason (optional) — fills only objectives with none yet' : 'Reason (required) — fills only objectives with none yet'}
                  aria-label="Reason"
                />
                <div className={styles.bulkDrivers}>
                  {DRIVERS.map(d => (
                    <button key={d} type="button" aria-pressed={bulkDrivers.has(d)}
                      className={`${styles.driverChip} ${bulkDrivers.has(d) ? styles.driverOn : ''}`}
                      onClick={() => setBulkDrivers(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; })}>
                      {d}
                    </button>
                  ))}
                </div>
                <button type="button" className={styles.approveBtn} onClick={applyBulk} disabled={bulkBusy}>
                  {bulkBusy ? 'Applying…' : `Decide ${selected.size}`}
                </button>
                <button type="button" className={styles.linkBtn} onClick={() => setSelected(new Set())} disabled={bulkBusy}>Clear</button>
                <div className={styles.bulkDelivery}>
                  <label className={styles.bulkChoice}>
                    Delivered
                    <select value={bulkDelivery} onChange={e => setBulkDelivery(e.target.value)} aria-label="Delivered">
                      <option value="">— choose —</option>
                      {DELIVERY_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                  <button type="button" className={styles.linkBtn} onClick={applyDelivery} disabled={bulkBusy || !bulkDelivery}>
                    Set on {selected.size}
                  </button>
                </div>
              </div>
            )}
            {bulkNote && <p className={styles.bulkNote} role="status">{bulkNote}</p>}

            {/* What selecting is FOR. The bulk bar only appears once something is
                ticked, so before that the boxes explain nothing (owner, 2026-09-24). */}
            {!isStandard && canEdit && selected.size === 0 && (
              <p className={styles.selectHint}>
                Select objectives to decide several together — adopt them, or record them as not applicable with one reason.
                Each objective is also decided on its own page.
              </p>
            )}

            {controls.length > 0 && !controls.some(rowFilter) && (
              <p className={styles.noMatch} role="status">
                Nothing matches the figures you have selected.{' '}
                <button type="button" className={styles.linkBtn} onClick={clearRowFilters}>Show everything</button>
              </p>
            )}

            {groupOrder.map(label => {
              const rows = controls.filter(c => c.group === label).filter(rowFilter);
              if (!rows.length) return null;
              return (
                <section key={label} className={styles.theme}>
                  <h2 className={styles.themeTitle}>
                    {!isStandard && canEdit && (
                      <label className={styles.groupSelect}>
                        <input
                          type="checkbox" className={styles.groupCheck}
                          aria-label={`Select all ${rows.length} in ${label}`}
                          checked={rows.every(r => selected.has(r.control_id))}
                          onChange={e => setGroupSelected(rows.map(r => r.control_id), e.target.checked)}
                        />
                        <span>Select all {rows.length}</span>
                      </label>
                    )}
                    {label} <span className={styles.themeCount}>{rows.length}</span>
                    <HelpDot k="soa.group" placement="bottom" />
                  </h2>
                  <div className={styles.rows}>
                    {rows.map(c => (isStandard ? (
                      <RequirementRow key={c.control_id} req={c} canEdit={canEdit} onPatch={patchRequirement}
                              showBand={hasCoverage} justSaved={justSaved.has(c.control_id)}
                              onEditingChange={reportEditing} />
                    ) : (
                      <RegisterRow key={c.control_id} ctrl={c} showBand={hasCoverage}
                              selectable={canEdit} selected={selected.has(c.control_id)}
                              onToggle={() => toggleSelected(c.control_id)} />
                    )))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </Shell>
  );
}

function Stat({ label, value, color, onClick, active, title }) {
  const body = (
    <>
      <span className={styles.statValue} style={color ? { color } : undefined}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </>
  );
  if (!onClick) return <div className={styles.stat}>{body}</div>;
  return (
    <button type="button" aria-pressed={!!active} title={title || `Show only: ${label}`}
            className={`${styles.stat} ${styles.statBtn} ${active ? styles.statOn : ''}`} onClick={onClick}>
      {body}
    </button>
  );
}

// One objective in the register — READ-ONLY (2026-09-22). The decision, the
// justification, how it is implemented and its maturity are all edited on the
// objective's own page; the register reports them, and can only decide several
// objectives at once through the bulk bar.
function RegisterRow({ ctrl, showBand, selectable, selected, onToggle }) {
  const band = ctrl.band || 'untraced';
  const treated = (ctrl.risks_treated ?? 0) > 0;
  const decided = ctrl.status && ctrl.status !== 'not_decided';
  return (
    <div className={`${styles.row} ${ctrl.status === 'not_applicable' ? styles.rowExcluded : ''} ${selected ? styles.rowSelected : ''}`}>
      <div className={styles.rowHead}>
        {/* A bare checkbox reads as a bullet: it has to say what it does, and
            what it is for is only visible once something is ticked (owner, 2026-09-24). */}
        {selectable && (
          <label className={`${styles.rowSelect} ${selected ? styles.rowSelectOn : ''}`}>
            <input type="checkbox" className={styles.rowCheck} checked={selected} onChange={onToggle}
                   aria-label={`Select ${ctrl.ref || ''} ${ctrl.title}`.trim()} />
            <span>{selected ? 'Selected' : 'Select'}</span>
          </label>
        )}
        <span className={styles.ref}>{ctrl.ref}</span>
        <Link className={styles.ctrlTitleLink} to={`/controls/${ctrl.control_id}`}>{ctrl.title}</Link>
        <ControlStatusPill status={ctrl.status} />
        {ctrl.applicable && (
          <span className={styles.derivedStatus}
                title={ctrl.implementation_source === 'derived'
                  ? 'Derived from the systems it is delivered on, for the risks we have identified'
                  : 'Stated by hand'}>
            {STATUS_LABEL[ctrl.implementation_status]}
            {partialQualifier(ctrl) && ` · ${partialQualifier(ctrl)}`}
          </span>
        )}
        {ctrl.applicable && ctrl.effectiveness != null && <MaturityChip value={ctrl.effectiveness} />}
        {ctrl.delivery && ctrl.delivery !== 'system' && (
          <span className={styles.deliveryChip} title={DELIVERY_MODES.find(m => m.value === ctrl.delivery)?.hint}>
            {DELIVERY_LABEL[ctrl.delivery]}
          </span>
        )}
        {ctrl.applicable && (ctrl.scopes || []).length > 0 && (
          <span className={styles.scopeChip} title="Applies only in these scopes">
            in {ctrl.scopes.map(sc => sc.name).join(', ')}
          </span>
        )}
        {showBand && ctrl.applicable && (
          <span className={`${styles.bandBadge} ${styles[`band_${band}`]}`} title={BANDS[band]?.hint}>
            {BANDS[band]?.label}
            {treated && <span className={styles.bandCount}>{ctrl.risks_treated}</span>}
          </span>
        )}
      </div>

      {(ctrl.standard_refs || []).length > 0 && (
        <div className={styles.stdRefs}>
          {ctrl.standard_refs.map(r => (
            <span key={`${r.code}-${r.ref}`} className={styles.stdRef} title={r.name}>{r.name} <b>{r.ref}</b></span>
          ))}
        </div>
      )}

      {decided && (
        <p className={styles.registerLine}>
          <span className={styles.fieldLabel}>Why</span>
          {ctrl.justification
            ? <span>{ctrl.justification}</span>
            : <span className={styles.missing}>No justification recorded</span>}
        </p>
      )}
      {ctrl.applicable && ctrl.implementation_description && (
        <p className={styles.registerLine}>
          <span className={styles.fieldLabel}>How</span>
          <span>{ctrl.implementation_description}</span>
        </p>
      )}
    </div>
  );
}

// A standard's requirement. Its state, status, drivers and justification are all
// DERIVED from the controls mapped to it and shown read-only; the one thing it
// records for itself is an exclusion, which needs a reason.
function RequirementRow({ req, canEdit, onPatch, showBand, justSaved = false, onEditingChange }) {
  const explicit = req.exclusion === 'explicit';
  const [excluding, setExcluding] = useState(false);
  const [reason, setReason] = useState(explicit ? (req.justification ?? '') : '');
  useEffect(() => { setReason(explicit ? (req.justification ?? '') : ''); setExcluding(false); }, [explicit, req.justification]);

  const editing = explicit ? reason !== (req.justification ?? '') : (excluding && reason.trim() !== '');
  useEffect(() => { onEditingChange?.(req.control_id, editing); }, [editing, req.control_id, onEditingChange]);
  useEffect(() => () => onEditingChange?.(req.control_id, false), [req.control_id, onEditingChange]);

  const state = REQ_STATES[req.requirement_state] || REQ_STATES.gap;
  const band = req.band || 'untraced';
  const mapped = req.mapped_controls || [];

  return (
    <div className={`${styles.row} ${req.requirement_state === 'excluded' ? styles.rowExcluded : ''}`}>
      <div className={styles.rowHead}>
        <span className={styles.ref}>{req.ref}</span>
        <span className={styles.ctrlTitle}>{req.title}</span>
        <span className={`${styles.reqState} ${styles[`req_${req.requirement_state}`]}`} title={state.hint}>{state.label}</span>
        {showBand && req.applicable && (
          <span className={`${styles.bandBadge} ${styles[`band_${band}`]}`} title={BANDS[band]?.hint}>{BANDS[band]?.label}</span>
        )}
        {req.applicable && <span className={styles.derivedStatus}>{STATUS_LABEL[req.implementation_status]}</span>}
        {justSaved && <span className={styles.savedTick} title="Saved">✓</span>}
      </div>

      <p className={styles.ctrlDesc}>{req.description}</p>

      <div className={styles.mapped}>
        <span className={styles.fieldLabel}>Met by</span>
        {mapped.length === 0 ? (
          <span className={styles.mappedNone}>No control objective is mapped to this requirement.</span>
        ) : (
          <ul className={styles.mappedList}>
            {mapped.map(m => (
              <li key={m.control_id} className={styles.mappedItem}>
                <span className={styles.mappedTitle}>{m.title}</span>
                <span className={styles.mappedMeta}>
                  {m.coverage === 'full' ? 'full' : 'partial'} ·{' '}
                  {!m.decided ? 'not yet decided' : m.applicable ? STATUS_LABEL[m.implementation_status] : 'not applicable'}
                </span>
                {m.implementation_description && <span className={styles.mappedImpl}>{m.implementation_description}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {req.exclusion === 'inherited' && (
        <p className={styles.inherited}>
          Excluded because every control objective mapped to it is not applicable
          {req.justification ? <>: {req.justification}</> : ' — and none of them records why.'}
        </p>
      )}

      {explicit ? (
        <div className={styles.justification}>
          <span className={styles.fieldLabel}>Excluded because</span>
          <textarea
            className={styles.justInput} rows={1} value={reason} disabled={!canEdit}
            onChange={e => setReason(e.target.value)}
            onBlur={() => { if (reason.trim() && reason !== (req.justification ?? '')) onPatch(req.control_id, { excluded: true, justification: reason }); }}
          />
          {canEdit && (
            <button type="button" className={styles.autoJustBtn} onClick={() => onPatch(req.control_id, { excluded: false })}>
              Withdraw exclusion
            </button>
          )}
        </div>
      ) : canEdit && (excluding ? (
        <div className={styles.justification}>
          <span className={styles.fieldLabel}>Exclude because</span>
          <textarea
            className={styles.justInput} rows={1} value={reason} autoFocus
            placeholder="Why does this requirement not apply to us?"
            onChange={e => setReason(e.target.value)}
          />
          <button type="button" className={styles.autoJustBtn} disabled={!reason.trim()}
                  onClick={() => onPatch(req.control_id, { excluded: true, justification: reason })}>
            Exclude
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => { setExcluding(false); setReason(''); }}>Cancel</button>
        </div>
      ) : (
        <button type="button" className={styles.linkBtn} onClick={() => setExcluding(true)}>
          Exclude for this standard…
        </button>
      ))}
    </div>
  );
}
