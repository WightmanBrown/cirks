// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { PatternChip } from '../components/PatternChip';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import DeliveredControlChip, { isDeliveredOnce } from '../components/DeliveredControlChip';
import SharedComponentChip, { isShared } from '../components/SharedComponentChip';
import { useAuth }                           from '../context/AuthContext';
import {
  getRisk, updateRisk, archiveRisk, validateRisk,
  resubmitRisk, discardRisk,
  linkRiskComponent, unlinkRiskComponent, searchComponents,
  linkRiskControl, getControls,
  getSystem, linkSystemComponent, getRiskGap,
  setSystemControlStatus, setSystemComponentStatus,
  setRiskControlProbability, linkThreatControl, unlinkThreatControl,
} from '../api';
import { RiskGraph }                         from '../components/RiskGraph';
import { ComponentPill, TypeBadge }          from '../components/ComponentPill';
import { Shell }                             from '../components/Shell';
import { HelpDot }                           from '../components/HelpDot';
import { BackButton }                        from '../components/BackButton';
import { EntityKind }                        from '../components/EntityKind';
import { ExceptionFormModal }                from '../components/ExceptionFormModal';
import { scoreColorClass, chipClass }        from '../utils/riskColors';
import { getComponentColor }                 from '../utils/componentColors';
import {
  ChipSelector, CiaLine, ProbabilityLine, SuggestedProbRow, CiaTableHeader,
} from '../components/CiaTable';
import {
  FrameworkRef, TypePill, EffectivenessDots,
} from '../components/ControlBadges';
import { RiskPIG } from '../components/ProbabilityImpactGrid';
import { patchRiskTreatment, getUsers,
         getResidualHistory,
         getRiskActions, getActionItemCandidates, createGapAction,
         acceptAction, completeActionItem } from '../api';
import { mayCompleteItem } from '../utils/itemCompletion';
import { coverageDrivers, driverDims, penalisedDims } from '../utils/coverageDriver';
import { coverageForecast, gapPlanning, gapCounts, absentNextSteps } from '../utils/coverageForecast';
import { collapse, expand, isMixed, tripleText } from '../utils/singleProbability';
import { groupControls, classifyControl, componentGaps,
         OPERATIONAL, IMPAIRED, MISSING, EXCLUDED } from '../utils/controlGrouping';
import { useViewMode } from '../hooks/useViewMode';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { RatingChip } from '../components/RatingChip';
import { RatingScaleRow } from '../components/RatingScaleRow';
import { MaturityChip } from '../components/MaturityChip';
import { InfoTip } from '../components/InfoTip';
import { ComponentModal } from '../components/ComponentModal';
import styles from './RiskDetailPage.module.css';
import { personLabel } from '../utils/roles';
import { componentTypeShort, COMPONENT_TYPE_LABEL, componentStatusLabel } from '../utils/componentTypes';
import { DateField } from '../components/DateField';
import { solutionSummary, solutionStateLabel } from '../utils/securitySolutions';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CLASS = {
  pending:   styles.statusPending,
  returned:  styles.statusReturned,
  validated: styles.statusValidated,
};


// Score colours come from the shared riskColors palette so risk-score chips
// across the app stay consistent with the Risk Heatmap (future view).
const scoreClass = scoreColorClass;

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Probability slider ────────────────────────────────────────────────────────


// ── Page ──────────────────────────────────────────────────────────────────────

export function RiskDetailPage() {
  const { id }        = useParams();
  // The risk-creation wizard hands over here (?panel=coverage) instead of asking
  // the analyst to survey controls before the risk exists. Arriving on a folded
  // panel would hide the very thing they were sent to do.
  const [searchParams] = useSearchParams();
  const focusCoverage  = searchParams.get('panel') === 'coverage';
  const navigate      = useNavigate();
  const { user, hasCapability } = useAuth();

  const [risk,       setRisk]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  // Which risk-row panel is currently being edited (only one at a time, since
  // all three share one form + one save endpoint): null | 'rationale' | 'context' | 'currentRisk'
  const [editingPanel, setEditingPanel] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState('');
  const [showValidate,  setShowValidate]  = useState(false);
  const [validateAction, setValidateAction] = useState('validate');
  const [validateNotes,  setValidateNotes]  = useState('');
  const [validateError,  setValidateError]  = useState('');
  const [validateBusy,   setValidateBusy]   = useState(false);
  const [toast,      setToast]      = useState(null);
  const { mode: viewMode, canUseExpert, setMode: setViewMode,
          saveDefault, isDirty: viewModeDirty } = useViewMode();
  const simpleMode = viewMode !== 'expert';



  // Edit form state
  const [form, setForm] = useState({});

  // Extracts editable form fields from a risk API response. Used both when
  // loading fresh data and when cancelling an edit (to discard unsaved changes).
  function formFromRisk(data) {
    return {
      probability_c: data.probability_c,
      probability_i: data.probability_i,
      probability_a: data.probability_a,
      inherent_probability_c: data.inherent_probability_c ?? data.threat_prob_c ?? data.probability_c,
      inherent_probability_i: data.inherent_probability_i ?? data.threat_prob_i ?? data.probability_i,
      inherent_probability_a: data.inherent_probability_a ?? data.threat_prob_a ?? data.probability_a,
      residual_impact_c: data.residual_impact_c ?? data.impact_c,
      residual_impact_i: data.residual_impact_i ?? data.impact_i,
      residual_impact_a: data.residual_impact_a ?? data.impact_a,
      inherent_impact_rationale:       data.inherent_impact_rationale       || '',
      inherent_probability_rationale:  data.inherent_probability_rationale  || '',
      residual_impact_rationale:       data.residual_impact_rationale       || '',
      residual_probability_rationale:  data.residual_probability_rationale  || '',
      treatment_decision:  data.treatment_decision || '',
      no_action_required:  data.no_action_required || false,
      rationale:    data.rationale || '',
      review_date:  data.review_date ? data.review_date.slice(0, 10) : '',
    };
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getRisk(id);
      setRisk(data);
      setForm(formFromRisk(data));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load risk.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function handleFormChange(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    setSaveErr('');
    if (!form.rationale.trim()) { setSaveErr('Rationale is required.'); return; }
    setSaving(true);
    try {
      await updateRisk(id, {
        // Probability is derived from the per-control judgements on the Threat
        // Coverage panel — no longer a manual lever here (backend ignores it too).
        inherent_probability_c: form.inherent_probability_c,
        inherent_probability_i: form.inherent_probability_i,
        inherent_probability_a: form.inherent_probability_a,
        // Impact is derived from the system's assets (Option A) — never sent from here.
        inherent_probability_rationale:  form.inherent_probability_rationale  || null,
        residual_probability_rationale:  form.residual_probability_rationale  || null,
        treatment_decision:  form.treatment_decision || null,
        no_action_required:  Boolean(form.no_action_required),
        rationale:    form.rationale,
        review_date:  form.review_date || null,
      });
      await load();
      setEditingPanel(null);
      showToast('Risk updated.');
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm('Archive this risk? It will no longer appear in reports.')) return;
    try {
      await archiveRisk(id);
      navigate(-1);
    } catch (err) {
      showToast(err.response?.data?.error || 'Archive failed.', 'error');
    }
  }

  async function handleResubmit() {
    if (!window.confirm('Resubmit this risk for validation? It will return to the CISO’s queue.')) return;
    try {
      await resubmitRisk(id);
      load();
      showToast('Risk resubmitted for validation.');
    } catch (err) {
      showToast(err.response?.data?.error || 'Resubmit failed.', 'error');
    }
  }

  async function handleDiscard() {
    const reason = window.prompt('Discard this returned risk? It will be archived. Optionally note a reason:');
    if (reason === null) return; // cancelled
    try {
      await discardRisk(id, { notes: reason });
      navigate(-1);
    } catch (err) {
      showToast(err.response?.data?.error || 'Discard failed.', 'error');
    }
  }

  async function handleValidateSubmit() {
    if (validateAction === 'return' && validateNotes.trim().length < 10) {
      setValidateError('Return notes are required (min 10 characters).');
      return;
    }
    setValidateError('');
    setValidateBusy(true);
    try {
      await validateRisk(risk.id, {
        action: validateAction,
        notes: validateAction === 'return' ? validateNotes.trim() : undefined,
      });
      setShowValidate(false);
      setValidateNotes('');
      load();
      showToast(`Risk ${validateAction === 'validate' ? 'validated' : 'returned'}.`);
    } catch (err) {
      setValidateError(err.response?.data?.error || 'Action failed. Please try again.');
    } finally {
      setValidateBusy(false);
    }
  }

  function showToast(message, variant = 'success') {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 4000);
  }




  const canEdit = risk && (
    user?.role === 'ciso' || user?.role === 'admin' ||
    (user?.role === 'risk_analyst' && ['pending', 'returned'].includes(risk.validation_status))
  );

  const canValidate = risk && user?.role === 'ciso' &&
    ['pending', 'returned'].includes(risk.validation_status);

  const canArchive = risk && (user?.role === 'ciso' || user?.role === 'admin');

  // Rework affordances on a returned risk. Originator = composer (identified_by)
  // or the derived owner of its department, mirroring the backend guard.
  const isOriginator = risk &&
    (risk.identified_by_id === user?.id || (risk.owner_user_ids || []).includes(user?.id));
  const isReturned = risk && risk.validation_status === 'returned';
  // Resubmit (returned → pending): the originating analyst, or a ciso/admin acting
  // on their behalf (resubmit_risk's role gate was dropped in v74).
  const canResubmit = isReturned &&
    ((user?.role === 'risk_analyst' && isOriginator) ||
     user?.role === 'ciso' || user?.role === 'admin');
  // Discard (archive a returned risk): analyst-only — ciso/admin use Archive, which
  // works in any state.
  const canDiscard = isReturned && user?.role === 'risk_analyst' && isOriginator;

  // Per-panel edit flags (one risk-row panel editable at a time).
  const anyEditing       = editingPanel !== null;
  const editingRationale = editingPanel === 'rationale';
  const editingContext   = editingPanel === 'context';

  // Cancel any in-progress risk-row edit and discard unsaved changes.
  function handleCancel() {
    setEditingPanel(null);
    setSaveErr('');
    if (risk) setForm(formFromRisk(risk));
  }

  return (
    <Shell>
      <div className={styles.page}>

        {/* ── header ── */}
        <div className={styles.pageHeader}>
          <BackButton fallback="/dashboard" />
          <div className={styles.headingGroup}>
            <h1 className={styles.heading}>
              {risk
                ? <>{risk.system_name} <span className={styles.headingThreat}>{risk.threat_name}</span><EntityKind kind="risk" /> <HelpDot k="risk.detail.title" placement="bottom" /></>
                : 'Risk Detail'
              }
            </h1>
            {risk && (
              <span className={`${styles.statusBadge} ${STATUS_CLASS[risk.validation_status] || ''}`}>
                {risk.validation_status}
              </span>
            )}
          </div>
          <div className={styles.headerActions}>
            {risk && (
              <ViewModeToggle
                mode={viewMode}
                setMode={setViewMode}
                canUseExpert={canUseExpert}
                isDirty={viewModeDirty}
                saveDefault={saveDefault}
              />
            )}
            {canValidate && !anyEditing && (
              <button
                className={styles.btnValidate}
                onClick={() => { setShowValidate(v => !v); setValidateError(''); }}
              >
                {showValidate ? 'Cancel' : 'Validate / Return'}
              </button>
            )}
            {canResubmit && !anyEditing && (
              <button className={styles.btnValidate} onClick={handleResubmit}>Resubmit for validation</button>
            )}
            {canDiscard && !anyEditing && (
              <button className={styles.btnArchive} onClick={handleDiscard}>Discard</button>
            )}
            {canArchive && !anyEditing && (
              <button className={styles.btnArchive} onClick={handleArchive}>Archive</button>
            )}
          </div>
        </div>

        {loading && <div className={styles.loadingBar} />}
        {!loading && error && !risk && <p className={styles.errorMsg}>{error}</p>}

        {/* ── Inline validation panel ── */}
        {risk && canValidate && (
          <ValidationPanel
            risk={risk}
            open={showValidate}
            action={validateAction}
            notes={validateNotes}
            error={validateError}
            busy={validateBusy}
            onActionChange={a => { setValidateAction(a); setValidateError(''); }}
            onNotesChange={setValidateNotes}
            onSubmit={handleValidateSubmit}
          />
        )}

        {risk && (
          <div className={styles.body}>

            {/* ── rationale ── */}
            <section className={`${styles.card} ${editingRationale ? styles.cardEditing : ''}`}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Rationale <HelpDot k="risk.detail.rationale" placement="bottom" /></h2>
                <div className={styles.cardHeaderActions}>
                  <PanelEditButtons
                    canEdit={canEdit}
                    editing={editingRationale}
                    onEdit={() => setEditingPanel('rationale')}
                    onCancel={handleCancel}
                    onSave={handleSave}
                    saving={saving}
                  />
                </div>
              </div>
              <p className={styles.cardHint}>What is the risk we are rating?</p>
              {editingRationale
                ? <textarea
                    className={styles.textarea}
                    value={form.rationale}
                    onChange={e => handleFormChange('rationale', e.target.value)}
                    rows={4}
                  />
                : <p className={styles.rationaleText}>{risk.rationale || '—'}</p>
              }
              {editingRationale && saveErr && <p className={styles.saveErr}>{saveErr}</p>}
            </section>

            {/* ── return notes (shown when risk has been returned by CISO) ── */}
            {risk.validation_notes && (
              <section className={`${styles.card} ${styles.cardReturned}`}>
                <h2 className={styles.cardTitle}>Return Notes <HelpDot k="risk.detail.return_notes" placement="bottom" /></h2>
                <p className={styles.rationaleText}>{risk.validation_notes}</p>
              </section>
            )}

            {/* ── context card ── */}
            <section className={`${styles.card} ${editingContext ? styles.cardEditing : ''}`}>
              <div className={styles.cardHeaderRow}>
                <h2 className={styles.cardTitle}>Context <HelpDot k="risk.detail.context" placement="bottom" /></h2>
                <div className={styles.cardHeaderActions}>
                  <PanelEditButtons
                    canEdit={canEdit}
                    editing={editingContext}
                    onEdit={() => setEditingPanel('context')}
                    onCancel={handleCancel}
                    onSave={handleSave}
                    saving={saving}
                  />
                </div>
              </div>
              <p className={styles.cardHint}>What are the things associated with this risk?</p>
              <div className={styles.metaGrid}>
                <MetaRow
                  label="System"
                  value={risk.system_name
                    ? `${risk.system_name} (C${risk.impact_c ?? '–'} I${risk.impact_i ?? '–'} A${risk.impact_a ?? '–'})`
                    : '—'
                  }
                />
                <MetaRow label="Threat"     value={risk.threat_name} />
                <MetaRow label="Category"   value={risk.threat_category} />
                <MetaRow label="Department" value={risk.department_name} />
                <MetaRow
                  label="Exposed information assets"
                  value={
                    (risk.system_assets || []).length > 0
                      ? (
                        <span className={styles.assetList}>
                          {risk.system_assets.map(a => (
                            <span key={a.id} className={styles.assetListItem}>
                              {a.name} (C{a.c ?? '–'} I{a.i ?? '–'} A{a.a ?? '–'})
                            </span>
                          ))}
                        </span>
                      )
                      : '— (none linked to system)'
                  }
                />
                <MetaRow label="Identified by" value={risk.identified_by_name} />
                {/* Derived (v108): a risk belongs to the department that owns its
                    system, so the owner is that department's IAO — or the SIRO
                    where it has none. Not editable, and there is nothing to
                    reassign: a risk moves owner when its SYSTEM moves. */}
                <MetaRow
                  label="Risk Owner"
                  value={
                    <span className={styles.ownerRow}>
                      {risk.owner_name || '\u2014'}
                      {risk.owner_is_siro_fallback && (
                        <span
                          className={styles.ownerFallback}
                          title={`${risk.department_name || 'This department'} has no Information Asset Owner, so its risks are owned by the SIRO.`}
                        >via SIRO</span>
                      )}
                    </span>
                  }
                />
                <MetaRow label="Review date"
                  value={editingContext
                    ? (
                      <DateField
                        className={styles.inputDate}
                        value={form.review_date}
                        onChange={e => handleFormChange('review_date', e.target.value)}
                      />
                    )
                    : fmtDate(risk.review_date)
                  }
                />
                {!editingContext && (
                  <>
                    <MetaRow label="Created" value={fmtDate(risk.created_at)} />
                    {risk.validated_at    && <MetaRow label="Validated"    value={fmtDate(risk.validated_at)} />}
                    {risk.validated_by_name && <MetaRow label="Validated by" value={risk.validated_by_name} />}
                  </>
                )}
              </div>
              {editingContext && saveErr && <p className={styles.saveErr}>{saveErr}</p>}
            </section>

            {/* ── Panel 1: Current risk (read-only — probability is derived from
                   the per-control judgements in the Threat Coverage panel) ── */}
            <ResidualRiskPanel
              risk={risk} form={form}
              simpleMode={simpleMode}
            />

            {/* ── Panel 2: Risk history ── (expert concept; hidden in business view) */}
            {!simpleMode && <ResidualHistoryPanel riskId={risk.id} />}

            {/* ── linked components (own in-panel Edit/Done toggle; live writes) ── */}
            <LinkedComponentsSection
              risk={risk}
              canEdit={user?.role === 'ciso' || user?.role === 'risk_analyst' || user?.role === 'admin'}
              onChange={load}
            />

            {/* ── Panel 3: Mitigating controls (own in-panel Edit/Done toggle; live writes) ── */}
            <LinkedControlsSection
              risk={risk}
              canEdit={user?.role === 'ciso' || user?.role === 'risk_analyst' || user?.role === 'admin'}
              onChange={load}
              navigate={navigate}
              isExpert={!simpleMode}
              startOpen={focusCoverage}
            />

            {/* ── Panel 5: Security action (live for authorised roles; own inline forms) ── */}
            <SecurityActionPanel
              risk={risk} form={form} canEdit={canEdit} user={user}
              onChange={handleFormChange}
              onActionChange={load}
              simpleMode={simpleMode}
            />

            {/* ── Panel 6: Risk context graph (graph.read capability) ──
                OPEN by default (owner, 2026-09-18). It was folded, which is why
                it read as unused: a panel nobody opens is indistinguishable from
                one nobody wants, and this one earns its place — it is the only
                view on the page that shows how the pieces CONNECT, where the
                other panels each describe one kind of thing in isolation.
                Every other panel folds because it is a list whose answer is a
                count; a picture has no summary line that would substitute for
                it, so folding it hides the whole point. */}
            {hasCapability('graph.read') && (
              <CollapsibleCard
                title="Risk context"
                helpKey="risk.detail.risk_graph"
                description="How this risk connects: system, threat, information assets, PPITF components and mitigating controls."
              >
                <RiskGraph riskId={risk.id} riskScore={risk.risk_score} />
              </CollapsibleCard>
            )}

          </div>
        )}
      </div>

      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.variant}`]}`} role="status">
          {toast.message}
        </div>
      )}
    </Shell>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{value ?? '—'}</span>
    </div>
  );
}

// ── Collapsible card wrapper ─────────────────────────────────────────────────
// Each risk-detail panel uses this so the user can fold it down to title +
// description. Description is always visible; the body hides when collapsed.

function CollapsibleCard({ title, description, descriptionTip, helpKey, helpPlacement = 'bottom', defaultCollapsed = false, collapsedSummary = null, className = '', id, editing = false, headerActions, children }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = () => setCollapsed(c => !c);
  // `headerActions` shows on a folded card, so a panel that both folds and edits
  // can offer an Edit button that appears to do nothing. Entering edit mode
  // opens the panel; leaving it does not re-fold, since the reader is now
  // looking at what they came for.
  useEffect(() => { if (editing) setCollapsed(false); }, [editing]);
  return (
    <section
      id={id}
      className={`${styles.card} ${className} ${editing ? styles.cardEditing : ''} ${collapsed ? styles.cardCollapsed : ''}`}
    >
      <div className={styles.cardHeaderRow}>
        <button
          type="button"
          className={styles.cardHeaderToggle}
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          <h2 className={styles.cardTitle}>{title}</h2>
        </button>
        {helpKey && <HelpDot k={helpKey} placement={helpPlacement} label={typeof title === 'string' ? `About ${title}` : undefined} />}
        <div className={styles.cardHeaderRight}>
          {headerActions && <div className={styles.cardHeaderActions}>{headerActions}</div>}
          <button
            type="button"
            className={styles.chevronBtn}
            onClick={toggle}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            <span className={styles.collapseChevron} aria-hidden="true">
              {collapsed ? '▸' : '▾'}
            </span>
          </button>
        </div>
      </div>
      {description && <p className={styles.cardHint}>{description}{descriptionTip}</p>}
      {/* A folded panel that shows nothing but its title makes the reader open
          it to find out whether it needed opening. The summary is what the
          panel would have said. */}
      {collapsed && collapsedSummary}
      {!collapsed && children}
    </section>
  );
}

// Per-panel edit controls. Read mode → [Edit]; transactional edit → [Cancel][Save];
// live-edit panel (changes save instantly) → [Done]. Renders nothing without canEdit.
function PanelEditButtons({ canEdit, editing, live, onEdit, onCancel, onSave, onDone, saving }) {
  if (!canEdit) return null;
  if (!editing) {
    return <button type="button" className={styles.btnEdit} onClick={onEdit}>Edit</button>;
  }
  if (live) {
    return <button type="button" className={styles.btnEdit} onClick={onDone}>Done</button>;
  }
  return (
    <>
      <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={saving}>Cancel</button>
      <button type="button" className={styles.btnSave} onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </>
  );
}

// ── Shared scoring widgets ────────────────────────────────────────────────────



// Two-box rationale section with prefill-clears-on-edit behaviour. Prefill text
// is shown as a placeholder; if the user has not typed anything yet AND the
// corresponding slider value still matches the prefill source, the placeholder
// hints at what's been auto-derived. The value is only saved when the user
// actually types into the box.
// ── Panel 3: Security action ─────────────────────────────────────────────────

const TREATMENT_OPTIONS = [
  { value: 'avoid',    label: 'Avoid',    hint: 'Eliminate the activity that creates the risk' },
  { value: 'mitigate', label: 'Mitigate', hint: 'Apply controls to reduce likelihood and/or impact' },
  { value: 'transfer', label: 'Transfer', hint: 'Insurance, contract, or third-party assumption' },
  { value: 'accept',   label: 'Accept',   hint: 'Document acceptance with a review date' },
];

function SecurityActionPanel({ risk, form, canEdit, user, onChange, onActionChange }) {
  const noAction = Boolean(form.no_action_required);
  const decision = form.treatment_decision || '';
  const threshold = risk.mandatory_action_score ?? 12;
  const atOrAboveThreshold = (risk.risk_score ?? 0) >= threshold;
  const exceptions = risk.exceptions || [];
  const activeException = exceptions.find(e => e.status === 'active') || null;

  const [treatBusy, setTreatBusy] = useState(false);
  const [treatErr,  setTreatErr]  = useState('');
  const [excModal,  setExcModal]  = useState(null); // { mode, exception? }

  async function handleTreatmentChange(field, value) {
    setTreatErr('');
    onChange(field, value);
    setTreatBusy(true);
    try {
      await patchRiskTreatment(risk.id, {
        treatment_decision: field === 'treatment_decision' ? value : (form.treatment_decision || null),
        no_action_required: field === 'no_action_required' ? value : noAction,
      });
      onActionChange();
    } catch (err) {
      setTreatErr(err.response?.data?.error || 'Could not save treatment change.');
      onActionChange();
    } finally {
      setTreatBusy(false);
    }
  }

  return (
    <CollapsibleCard
      id="risk-section-actions"
      title="Security action"
      helpKey="risk.detail.security_action"
      description="What can we do to improve the security of the system?"
    >
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={noAction}
          disabled={!canEdit || treatBusy || (atOrAboveThreshold && !noAction)}
          onChange={e => handleTreatmentChange('no_action_required', e.target.checked)}
        />
        <span>
          <strong>No action required</strong> — current controls are sufficient
          {atOrAboveThreshold && (
            <span className={styles.thresholdNote}>
              {' '}— forbidden: this risk scores <em>{risk.risk_score}</em> (mandatory at ≥ <em>{threshold}</em>)
            </span>
          )}
        </span>
      </label>

      {!noAction && (
        <div id="risk-section-treatment" className={styles.treatmentRadios}>
          {TREATMENT_OPTIONS.map(t => (
            <label key={t.value} className={`${styles.treatmentRadio} ${decision === t.value ? styles.treatmentRadioActive : ''}`}>
              <input
                type="radio"
                name="treatment_decision"
                value={t.value}
                checked={decision === t.value}
                disabled={!canEdit || treatBusy}
                onChange={() => handleTreatmentChange('treatment_decision', t.value)}
              />
              <span className={styles.treatmentLabel}>{t.label}</span>
              <span className={styles.treatmentHint}>{t.hint}</span>
            </label>
          ))}
        </div>
      )}

      {treatErr && <p className={styles.saveErr}>{treatErr}</p>}

      {/* Acceptance exception — visible whenever there's an active exception
          OR the user has picked 'accept' but not yet recorded one. */}
      {!noAction && (decision === 'accept' || activeException) && (
        <ExceptionSection
          risk={risk}
          canEdit={canEdit}
          activeException={activeException}
          onOpenModal={setExcModal}
        />
      )}

      {excModal && (
        <ExceptionFormModal
          mode={excModal.mode}
          riskId={risk.id}
          exception={excModal.exception}
          onClose={() => setExcModal(null)}
          onSuccess={() => { setExcModal(null); onActionChange(); }}
        />
      )}

      {/* Gap-driven security actions (docs/security-actions.md) — build from the
          coverage gap, per-item owners + comments, CISO accept, incremental
          per-item completion. Replaces the old propose form + action list. */}
      {!noAction && (
        <GapActionSection risk={risk} canEdit={canEdit} user={user} onChange={onActionChange} />
      )}
    </CollapsibleCard>
  );
}

// ── Gap-driven security actions (docs/security-actions.md) ───────────────────
const CHANGE_KIND_LABEL = {
  control_add: 'Add control', control_improve: 'Improve control',
  component_add: 'Add component', component_improve: 'Improve component',
};

// The whole gap-driven action area: a "build from gap" wizard + the risk's
// actions, each with its items and per-item completion.
function GapActionSection({ risk, canEdit, user, onChange }) {
  const { hasCapability } = useAuth();
  const canAccept = hasCapability('actions.adopt');   // CISO / admin
  const [actions, setActions] = useState(null);
  const [building, setBuilding] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    try { setActions(await getRiskActions(risk.id)); setErr(''); }
    catch (e) { setActions([]); setErr(e.response?.data?.error || 'Failed to load actions.'); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [risk.id, risk.controls]);
  async function refresh() { await load(); onChange?.(); }

  return (
    <div className={styles.gapActions}>
      <div className={styles.actionListHeader}>
        <h3 className={styles.subhead}>Security actions <HelpDot k="risk.detail.actions" placement="bottom" /></h3>
        {canEdit && !building && (
          <button className={styles.btnAddAction} onClick={() => setBuilding(true)}>+ Build from gap</button>
        )}
      </div>
      {err && <p className={styles.saveErr}>{err}</p>}
      {building && (
        <GapActionBuilder risk={risk}
          onCancel={() => setBuilding(false)}
          onCreated={() => { setBuilding(false); refresh(); }} />
      )}
      {actions === null ? <p className={styles.cardHint}>Loading…</p>
        : actions.length === 0 && !building
          ? <p className={styles.emptyMsg}>No security actions yet — build one from the coverage gap.</p>
          : actions.map(a => (
              <ActionCard key={a.id} risk={risk} action={a}
                canAccept={canAccept} user={user} onChange={refresh} />
            ))}
    </div>
  );
}

// `target` is what makes an action mean anything: the probability once THIS
// control is working. Nothing seeds it any more — it used to fall back to the
// threat inherent, which is "no control at all", so every action silently
// promised no improvement and Target Risk matched Current Risk register-wide.
//
// It is OPTIONAL, deliberately. Refusing to create the action without one would
// stop an analyst recording work they have decided to do but not yet estimated;
// the missing estimate is surfaced instead, matching the treatment of every
// other incompleteness in CIRKS.
function GapItemFields({ sel, users, onField, isControl }) {
  return (
    <div className={styles.gapItemFields}>
      <select className={styles.statusSelect} value={sel.owner_user_id || ''}
        onChange={e => onField('owner_user_id', e.target.value)} aria-label="Responsible owner">
        <option value="">(system owner)</option>
        {users.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
      </select>
      <input className={styles.gapCommentInput} placeholder="Comment / context…"
        value={sel.comment || ''} onChange={e => onField('comment', e.target.value)} />
      {isControl && (
        <span className={styles.gapTargetFields}>
          <span className={styles.gapTargetLabel}
            title="What the attack probability will be once this control is operational. One figure — applied across C/I/A, each capped by the threat's own ceiling. Leave blank if not yet estimated.">
            once working, probability
          </span>
          <ChipSelector
            value={sel.target}
            wordScale="probability"
            onChange={v => onField('target', v)}
          />
          {sel.target == null && <span className={styles.gapTargetHint}>not yet estimated</span>}
        </span>
      )}
    </div>
  );
}

// Select gap candidates → assign owners + comments → create one action.
function GapActionBuilder({ risk, onCancel, onCreated }) {
  const [cand, setCand]   = useState(null);
  const [users, setUsers] = useState([]);
  const [sel, setSel]     = useState({});          // key -> { owner_user_id, comment }
  const [title, setTitle] = useState('');
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');

  useEffect(() => {
    getActionItemCandidates(risk.id).then(c => {
      setCand(c);
      // Components not yet planned are mandatory — pre-select them. One already
      // planned in a live action on this risk is covered there; pre-selecting it
      // re-planned every component each time a second action was built.
      const init = {};
      (c.components || []).filter(cc => !cc.open_action)
        .forEach(cc => { init['cmp:' + cc.component_id] = { owner_user_id: '', comment: '' }; });
      setSel(init);
    }).catch(() => setCand({ controls: [], components: [], default_owner: null }));
    getUsers().then(u => setUsers(u || [])).catch(() => {});
  }, [risk.id]);

  function toggle(key) {
    setSel(s => { const n = { ...s }; if (n[key]) delete n[key]; else n[key] = { owner_user_id: '', comment: '' }; return n; });
  }
  function setField(key, field, val) { setSel(s => ({ ...s, [key]: { ...s[key], [field]: val } })); }

  async function create() {
    setBusy(true); setErr('');
    const items = [];
    (cand.components || []).forEach(cc => {
      const k = 'cmp:' + cc.component_id;
      if (sel[k]) items.push({ element_type: 'component', component_id: cc.component_id,
        owner_user_id: sel[k].owner_user_id || undefined, comment: sel[k].comment || undefined });
    });
    if (!items.length) { setErr('Select at least one component.'); setBusy(false); return; }
    try { await createGapAction(risk.id, { title: title.trim() || undefined, items }); onCreated(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to create action.'); setBusy(false); }
  }

  if (!cand) return <p className={styles.cardHint}>Loading gap…</p>;

  // Anything ticked that a live action on this risk already plans — the same
  // work planned twice. Warned about, not refused: the user may know better
  // (the other action may be about to be cancelled).
  const duplicates = [
    ...(cand.components || []).filter(cc => cc.open_action && sel['cmp:' + cc.component_id])
      .map(cc => ({ name: cc.name, action: cc.open_action })),
  ];
  const plannedTag = (a) => (
    <span className={styles.plannedTag} title={`Already planned in the ${a.status.replace(/_/g, ' ')} action “${a.title}”`}>
      already planned in “{a.title}”
    </span>
  );

  return (
    <div className={styles.actionForm}>
      <input className={styles.copyFromInput} placeholder="Action title (optional)…"
        value={title} onChange={e => setTitle(e.target.value)} />
      {cand.default_owner && <p className={styles.cardHint}>Default owner: {cand.default_owner.name} (system owner)</p>}
      {err && <p className={styles.saveErr}>{err}</p>}

      {/* v154: a security action fixes components. A control objective cannot be
          fixed directly — its state on the system follows its security solution. */}
      <p className={styles.cardHint}>
        A security action puts right the components that deliver this risk&rsquo;s control objectives. When they are
        working, the objectives they deliver come into place and the risk falls to what those objectives are judged
        to achieve.
      </p>
      <p className={styles.suggestLabel}>Components <span className={styles.suggestHint}>— every component that is missing or not working on this system is included</span> <HelpDot k="risk.detail.builder_components" placement="bottom" /></p>
      {(cand.components || []).length === 0 && <p className={styles.cardHint}>No component on this system needs fixing for this risk.</p>}
      {(cand.components || []).map(cc => {
        const k = 'cmp:' + cc.component_id;
        return (
          <div key={k} className={styles.gapCandRow}>
            <label className={styles.gapCandHead}>
              {cc.open_action
                ? <input type="checkbox" checked={!!sel[k]} onChange={() => toggle(k)} />
                : <input type="checkbox" checked disabled title="Mandatory — must be actioned" />}
              <span className={styles.gapKind}>{CHANGE_KIND_LABEL[cc.change_kind]}</span>
              <span className={styles.compType}>{componentTypeShort(cc.component_type)}</span>
              <span>{cc.name}</span>
              {cc.open_action && plannedTag(cc.open_action)}
            </label>
            {sel[k] && <GapItemFields sel={sel[k]} users={users} isControl={false}
              onField={(f, v) => setField(k, f, v)} />}
          </div>
        );
      })}

      {(cand.blocked || []).length > 0 && (<>
        <p className={styles.suggestLabel}>Not in place, and not fixable from this risk <HelpDot k="risk.detail.builder_blocked" placement="bottom" /></p>
        {cand.blocked.map(b => (
          <div key={b.control_id} className={styles.gapCandRow}>
            <span className={styles.gapCandHead}>
              <Link to={`/controls/${b.control_id}`}>{b.title}</Link>
            </span>
            <p className={styles.cardHint}>
              {b.reason === 'no_solution' && 'No security solution delivers this control objective yet. One has to be built for it before anything can be planned.'}
              {b.reason === 'choose_solution' && 'None of the security solutions that deliver it is in place on this system. Choose one on the system\u2019s Control objectives tab; its parts can then be planned here.'}
              {b.reason === 'part_elsewhere' && `Its security solution${b.solution ? `, ${b.solution},` : ''} is held back by a part that does not live on this system${b.parts ? ` (${b.parts})` : ''}. That part is fixed once, where it lives, not per risk.`}
            </p>
          </div>
        ))}
      </>)}

      {duplicates.length > 0 && (
        <div className={styles.dupWarning} role="alert">
          <strong>This would plan the same work twice.</strong>{' '}
          {duplicates.length === 1 ? 'This item is' : `These ${duplicates.length} items are`} already
          planned in a live action on this risk:
          <ul>
            {duplicates.map(d => <li key={d.name}>{d.name} — in &ldquo;{d.action.title}&rdquo;</li>)}
          </ul>
          Untick {duplicates.length === 1 ? 'it' : 'them'} unless that action is about to be cancelled.
        </div>
      )}

      <div className={styles.actionFormButtons}>
        <button className={styles.btnCancel} onClick={onCancel} disabled={busy}>Cancel</button>
        <button className={styles.btnSave} onClick={create} disabled={busy}>
          {busy ? 'Creating…' : duplicates.length ? 'Create anyway' : 'Create action'}
        </button>
      </div>
    </div>
  );
}

function ActionCard({ risk, action, canAccept, user, onChange }) {
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const canOpen = hasCapability('actions.read');   // /actions/:id is capability-gated
  const [err, setErr] = useState('');
  async function accept() {
    setErr('');
    try { await acceptAction(risk.id, action.id); onChange(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to accept.'); }
  }
  return (
    <div className={styles.gapActionCard}>
      <div className={styles.gapActionHead}>
        <span className={`${styles.actionStatus} ${styles[`action_${action.status}`] || ''}`}>
          {action.status?.replace(/_/g, ' ')}
        </span>
        {canOpen ? (
          <button type="button" className={styles.gapActionTitleLink}
            title="Open this security action"
            onClick={() => navigate(`/actions/${action.id}`)}>
            {action.title}
          </button>
        ) : (
          <span className={styles.gapActionTitle}>{action.title}</span>
        )}
        {action.owner && <span className={styles.gapActionOwner}>owner: {action.owner.name}</span>}
        {canAccept && action.status === 'proposed' && (
          <button className={styles.btnSave} onClick={accept}>Accept (CISO)</button>
        )}
      </div>
      {action.baseline && (
        <p className={styles.cardHint}>Baseline at accept — score {action.baseline.score} ({action.baseline.c}/{action.baseline.i}/{action.baseline.a})</p>
      )}
      {err && <p className={styles.saveErr}>{err}</p>}
      <ul className={styles.gapItemList}>
        {action.items.map(it => (
          <ActionItemRow key={it.id} risk={risk} action={action} item={it}
            user={user} onChange={onChange} />
        ))}
      </ul>
    </div>
  );
}

function ActionItemRow({ risk, action, item, user, onChange }) {
  // The ceiling on every dimension: a control can only reduce the chance.
  const threatInherent = { c: risk.threat_prob_c, i: risk.threat_prob_i, a: risk.threat_prob_a };
  const [confirming, setConfirming] = useState(false);
  // One figure, not three (owner, 2026-09-18). It is expanded across C/I/A on
  // submit, each dimension capped by the threat's own inherent ceiling.
  const [resid, setResid] = useState(
    collapse(item.target, '') ?? collapse(item.target, 'probability_') ?? null);
  const [err, setErr] = useState('');
  const done = item.status === 'completed';
  // Planned, then judged unnecessary (0119 exclusion, 0121 threat-unlink). The
  // item stays on the record so the decision is visible — which only works if
  // the reason is visible with it, so the note the trigger filed is shown here
  // rather than left for the action's narrative page.
  const withdrawn = item.status === 'withdrawn';
  // The shared rule, mirroring the server's custom gate: ciso / risk_analyst /
  // admin, or the owner of this item's system. `canEdit` is deliberately NOT
  // consulted — it excludes the system owner, which is how the carve-out came
  // to be unreachable for the person named Responsible on every item.
  const canComplete = mayCompleteItem({
    actionStatus: action.status,
    itemStatus: item.status,
    role: user?.role,
    userId: user?.id,
    systemOwnerUserId: risk.system_owner_user_id,
  });

  async function doComplete(body) {
    setErr('');
    try { await completeActionItem(risk.id, item.id, body); onChange(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to complete.'); }
  }

  return (
    <li className={`${styles.gapItemRow} ${withdrawn ? styles.gapItemWithdrawn : ''}`}>
      <span className={styles.gapKind}>{CHANGE_KIND_LABEL[item.change_kind]}</span>
      {item.framework_ref && <span className={styles.tcRef}>{item.framework_ref}</span>}
      {item.component_type && <span className={styles.compType}>{componentTypeShort(item.component_type)}</span>}
      <span className={done ? styles.tcMuted : styles.gapItemLabel}>{item.label}</span>
      {item.owner && <span className={styles.gapItemOwner}>{item.owner.name}</span>}
      {item.target && <span className={styles.gapItemTarget} title="Target residual once operational">→ {item.target.c}/{item.target.i}/{item.target.a}</span>}
      {item.comment && (
        <span className={styles.gapItemComment} title={item.comment}>note</span>
      )}
      <span className={styles.gapItemStatus}>{done ? '✓ done' : item.status}</span>
      {withdrawn && (
        <span className={styles.gapItemWithdrawnNote}>
          {item.latest_note || 'Withdrawn — planned, then judged unnecessary.'}
          {item.withdrawn_by && <> — <strong>{item.withdrawn_by}</strong></>}
          {item.withdrawn_at && <> · {new Date(item.withdrawn_at).toLocaleDateString()}</>}
        </span>
      )}
      {canComplete && item.element_type === 'component' && (
        <button className={styles.componentAdd} onClick={() => doComplete({})}>Mark operational</button>
      )}
      {canComplete && item.element_type === 'control' && !confirming && (
        <button className={styles.componentAdd} onClick={() => setConfirming(true)}>Complete…</button>
      )}
      {confirming && (
        <span className={styles.gapResidConfirm}>
          <span title="The attack probability now this control is working. One figure — it is applied across confidentiality, integrity and availability, each capped by the threat's own ceiling.">
            probability now it is working
          </span>
          <ChipSelector
            value={resid}
            wordScale="probability"
            onChange={setResid}
          />
          <button
            className={styles.btnSave}
            disabled={!(resid >= 1 && resid <= 5)}
            onClick={() => doComplete(expand(resid, threatInherent))}
          >Confirm</button>
          <button className={styles.btnCancel} onClick={() => setConfirming(false)}>Cancel</button>
        </span>
      )}
      {err && <span className={styles.saveErr}>{err}</span>}
    </li>
  );
}

// Shared target-residual input + live score panel used in both create and edit forms.
function ExceptionSection({ canEdit, activeException, onOpenModal }) {
  if (!activeException) {
    return (
      <div id="risk-section-exceptions" className={styles.exceptionPrompt}>
        <span className={styles.exceptionPromptText}>
          Acceptance requires a time-bounded exception with a review cadence.
        </span>
        {canEdit && (
          <button
            type="button"
            className={styles.btnAddAction}
            onClick={() => onOpenModal({ mode: 'create' })}
          >
            + Create exception
          </button>
        )}
      </div>
    );
  }

  const e = activeException;
  const days = e.days_until_expiry;
  const expiryClass =
    days < 0  ? styles.exceptionOverdue
  : days <= 30 ? styles.exceptionDueSoon
  :              styles.exceptionOk;

  return (
    <div className={`${styles.exceptionCard} ${expiryClass}`}>
      <div className={styles.exceptionHeader}>
        <span className={styles.exceptionTitle}>Active acceptance exception <HelpDot k="risk.detail.active_exception" placement="bottom" /></span>
        <span className={styles.exceptionExpiry}>
          {days < 0
            ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
            : `Expires in ${days} day${days === 1 ? '' : 's'} (${fmtDate(e.expires_at)})`}
        </span>
      </div>
      <p className={styles.exceptionJust}>{e.justification}</p>
      <div className={styles.exceptionMeta}>
        <span>Accepted by <strong>{e.accepted_by_name || '—'}</strong> ({e.accepted_role})</span>
        <span>Review: {e.review_cadence}</span>
        <span>Accepted {fmtDate(e.accepted_at)}</span>
      </div>
      {e.notes && <p className={styles.exceptionNotes}>{e.notes}</p>}
      {canEdit && (
        <div className={styles.exceptionActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => onOpenModal({ mode: 'renew', exception: e })}
          >Renew</button>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={() => onOpenModal({ mode: 'revoke', exception: e })}
          >Revoke</button>
        </div>
      )}
    </div>
  );
}

// ── Panel 4: Current risk ───────────────────────────────────────────────────

// ── Controls countering this threat (decision support) ────────────────────────
// Read-only strip inside the Current-risk panel: the derived controls
// (system_controls ∩ control_threats) with their per-system maturity, surfaced
// between the threat baseline and the residual-probability selector so the
// likelihood decision reads top-to-bottom as baseline → controls → residual.
// Deliberately advisory — maturity informs the analyst's probability, it never
// computes it (see docs/control-maturity-model.md §4).
function ControlsCounteringRow({ controls }) {
  const all = controls || [];
  // Only a control that is actually IN PLACE counters anything. The list used to
  // show every control on the system regardless of status, so a `missing` one
  // read as a defence — 210 of 982 rows across the register were controls that
  // are not there. It also contradicted the arithmetic, which has always counted
  // operational|degraded alone.
  const working  = all.filter(c => c.system_status === 'operational');
  const degraded = all.filter(c => c.system_status === 'degraded');
  const absent   = all.length - working.length - degraded.length;

  const item = (c) => (
            <li key={c.id} className={styles.controlsContextItem}>
              <span className={styles.controlsContextName}>
                <FrameworkRef framework={c.framework} frameworkRef={c.framework_ref} />
                <span className={styles.controlsContextTitle}>{c.title}</span>
              </span>
              {c.maturity != null
                ? <span className={styles.maturityReadCell}>
                    <EffectivenessDots value={c.maturity} />
                    <MaturityChip value={c.maturity} />
                  </span>
                : <span className={styles.cardHint}>not assessed</span>}
            </li>
  );

  return (
    <div className={styles.controlsContext}>
      <span className={styles.controlsContextLabel}>
        <span>Controls countering this threat <HelpDot k="risk.detail.controls_countering" placement="bottom" /></span>
        <span className={styles.ciaLineSub}>
          in place on this system — maturity is organisation-wide and informs the
          likelihood, it never computes it
        </span>
      </span>

      {working.length === 0 && degraded.length === 0 ? (
        <p className={styles.controlsContextEmpty}>
          {absent > 0
            ? `No control is in place here. ${absent} linked to this threat `
              + `${absent === 1 ? 'is' : 'are'} missing, unknown or not applicable — `
              + 'see “Controls against this threat” below.'
            : 'No controls recorded on this system for this threat.'}
        </p>
      ) : (
        <>
          {working.length > 0 && <ul className={styles.controlsContextList}>{working.map(item)}</ul>}

          {degraded.length > 0 && (
            <>
              <span className={styles.controlsDegradedLabel}>
                Degraded — counting a rung worse than assessed
              </span>
              <ul className={`${styles.controlsContextList} ${styles.controlsDegradedList}`}>
                {degraded.map(item)}
              </ul>
            </>
          )}

          {absent > 0 && (
            <p className={styles.controlsContextEmpty}>
              {absent} further control{absent === 1 ? '' : 's'} linked to this threat
              {absent === 1 ? ' is' : ' are'} not in place, so {absent === 1 ? 'it counts' : 'they count'} for
              nothing here.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ResidualRiskPanel({ risk, form, simpleMode = true }) {
  // Read-only summary. Impact is DERIVED from the system's information assets
  // (MAX over them); probability is DERIVED from the per-control judgements on the
  // Threat Coverage panel (migration 0092). Neither is edited here.
  const impactVals = { c: risk.impact_c, i: risk.impact_i, a: risk.impact_a };
  const probVals   = { c: form.probability_c, i: form.probability_i, a: form.probability_a };
  const derivedNote = 'Probability is derived from the per-control judgements in Controls against this threat, below.';

  return (
    <CollapsibleCard
      title="Current risk"
      helpKey="risk.detail.current_risk"
      description="What is the current level of risk?"
      descriptionTip={<InfoTip term="currentRisk" />}
    >
      {/* A risk scoring 4 because nothing much was at stake and one scoring 4
          because it was driven down from 20 are different facts, and only the
          second is worth reporting. Derived from the score snapshotted when the
          CISO accepted the action, so it is attributable rather than inferred —
          a never-treated trivial risk has no baseline and cannot show this. */}
      {risk.treated_down && (
        <p className={styles.treatedDown}>
          <strong>Treated down</strong> — reduced from{' '}
          <RatingChip value={risk.treated_down.from} scale="risk" variant={simpleMode ? 'word' : 'number'} />
          {' to '}
          <RatingChip value={risk.treated_down.to} scale="risk" variant={simpleMode ? 'word' : 'number'} />
          {' '}through “{risk.treated_down.action_title}”.
        </p>
      )}
      {simpleMode ? (
        <div className={styles.residualSplitRow}>
          <div className={styles.residualSplitLeft}>
            <CiaLine
              label="Highest information asset impact"
              values={impactVals}
              editing={false}
              simpleMode={simpleMode}
            />
            <p className={styles.fieldNote}>Derived from the system&apos;s information assets — to change it, edit the asset ratings.</p>
            <SuggestedProbRow
              threatName={risk.threat_name}
              values={{ c: risk.threat_prob_c, i: risk.threat_prob_i, a: risk.threat_prob_a }}
              simpleMode={simpleMode}
            />
            <ControlsCounteringRow controls={risk.controls} />
            <ProbabilityLine
              label="Current probability"
              values={probVals}
              editing={false}
              simpleMode={simpleMode}
            />
            <p className={styles.fieldNote}>{derivedNote}</p>
            <div className={styles.residualScoreInline}>
              <span className={styles.inhScorePanelTitle}>Risk score <HelpDot k="risk.detail.risk_score" placement="bottom" /></span>
              <RatingScaleRow value={risk.risk_score} scale="risk" />
            </div>
          </div>
          <div className={styles.residualSplitRight}>
            <RiskPIG
              size="large"
              prob={Math.max(probVals.c ?? 0, probVals.i ?? 0, probVals.a ?? 0) || null}
              impact={Math.max(impactVals.c ?? 0, impactVals.i ?? 0, impactVals.a ?? 0) || null}
            />
          </div>
        </div>
      ) : (
        <>
          <CiaTableHeader label="" />
          <CiaLine
            label="Highest information asset impact"
            values={impactVals}
            editing={false}
            simpleMode={simpleMode}
          />
          <p className={styles.fieldNote}>Derived from the system&apos;s information assets — to change it, edit the asset ratings.</p>
          <SuggestedProbRow
            threatName={risk.threat_name}
            values={{ c: risk.threat_prob_c, i: risk.threat_prob_i, a: risk.threat_prob_a }}
            simpleMode={simpleMode}
          />
          <ControlsCounteringRow controls={risk.controls} />
          <ProbabilityLine
            label="Current probability"
            values={probVals}
            editing={false}
            simpleMode={simpleMode}
          />
          <p className={styles.fieldNote}>{derivedNote}</p>
          <div className={styles.inhScorePanel}>
            <span className={styles.inhScorePanelTitle}>Risk score <HelpDot k="risk.detail.risk_score" placement="bottom" /></span>
            <div className={styles.inhScoreColumnsExpert}>
              {[
                { key: 'c', label: 'Confidentiality', prob: probVals.c, impact: impactVals.c },
                { key: 'i', label: 'Integrity',        prob: probVals.i, impact: impactVals.i },
                { key: 'a', label: 'Availability',     prob: probVals.a, impact: impactVals.a },
              ].map(d => (
                <div key={d.key} className={styles.inhScoreColumn}>
                  <RiskPIG label={d.label} prob={d.prob} impact={d.impact} />
                  <div className={styles.inhScoreColScore}>
                    <span className={styles.scoreSummaryDim}>{d.key.toUpperCase()}</span>
                    <RatingChip value={risk[`risk_${d.key}`]} scale="risk" variant="word" />
                  </div>
                </div>
              ))}
              <div className={`${styles.inhScoreColumn} ${styles.inhScoreColumnMax}`}>
                <RiskPIG
                  label="Max"
                  prob={Math.max(probVals.c ?? 0, probVals.i ?? 0, probVals.a ?? 0) || null}
                  impact={Math.max(impactVals.c ?? 0, impactVals.i ?? 0, impactVals.a ?? 0) || null}
                />
                <div className={styles.inhScoreColScore}>
                  <span className={styles.scoreSummaryDim}>MAX</span>
                  <RatingChip value={risk.risk_score} scale="risk" variant="word" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}

// ── Linked controls section ───────────────────────────────────────────────────

// Per-system status pickers (per-system status model). A control's top option is
// "unknown / missing" — choosing operational/degraded deploys it (see
// handleControlState); components carry the extra explicit "missing" state.
const CONTROL_STATUSES   = ['operational', 'degraded', 'unknown', 'not_applicable'];
const COMPONENT_STATUSES = ['operational', 'degraded', 'missing', 'unknown'];

// "Controls against this threat" — the coverage panel
// (docs/threat-coverage-panel.md; renamed from "Threat Control Coverage"). For this risk's
// threat, every control in control_threats is listed with a per-system STATE
// picker (choosing operational/degraded deploys a gap control), its delivering
// components each with their own state picker, and a full-width per-control
// residual-probability row (C/I/A) whose MAX drives the risk's current
// probability. "Planned" is a derived chip (open action), never a picker option.
// The three questions the coverage panel answers, in the order a reader wants
// them: what is holding the risk down now, what is here but not working, and
// what is absent. Excluded controls trail the set — a decision, not a gap.
const SECTIONS = [
  { key: OPERATIONAL,
    title: 'Current operational controls on this system',
    helpKey: 'risk.detail.coverage_operational',
    blurb: 'Working here, with every delivering component in place. These are what hold the risk down today.',
    empty: 'Nothing on this system is fully operational against this threat, so the probability stays at the threat\u2019s untreated level.' },
  { key: IMPAIRED,
    title: 'Degraded controls which need improvement on this system',
    helpKey: 'risk.detail.coverage_degraded',
    blurb: 'Present but not fully effective \u2014 either marked degraded, or missing one of the components that delivers them. A degraded control still counts, one rung worse than its score.' },
  { key: MISSING,
    title: 'Controls which are missing from this system and could reduce the risk',
    helpKey: 'risk.detail.coverage_missing',
    blurb: 'Not in place here, so they are not lowering anything; their scores show what each would achieve. One with a security solution is put in place by recording that solution\u2019s parts on this system, which a security action can plan. One with no security solution cannot be put in place until it is given one.' },
  { key: EXCLUDED,
    title: 'Controls excluded from this system',
    helpKey: 'risk.detail.coverage_excluded',
    blurb: 'Judged not appropriate here, with a recorded reason. Neither a gap nor a contributor to the score.' },
];

function LinkedControlsSection({ risk, canEdit, onChange, navigate, isExpert, startOpen = false }) {
  const { hasCapability } = useAuth();
  const canCurate = hasCapability('controls.write'); // add/remove a control ↔ threat
  const [gap, setGap]   = useState(null);   // GET /risks/gap (incl. per-control probability)
  const [err, setErr]   = useState('');
  const [search,  setSearch]  = useState('');
  const [results, setResults] = useState([]);
  const [busy,    setBusy]    = useState(false);

  useEffect(() => {
    if (!risk.system_id || !risk.threat_id) { setGap(null); return; }
    let cancelled = false;
    getRiskGap(risk.system_id, risk.threat_id, risk.id)
      .then(data => { if (!cancelled) setGap(data); })
      .catch(() => { if (!cancelled) setGap(null); });
    return () => { cancelled = true; };
  }, [risk.system_id, risk.threat_id, risk.id, risk.controls]);

  async function refetchGap() {
    if (!risk.system_id || !risk.threat_id) return;
    try { setGap(await getRiskGap(risk.system_id, risk.threat_id, risk.id)); } catch { /* ignore */ }
  }

  // Sent here to work on coverage: put the panel in front of them once it has
  // something to show. Once only — a scroll that repeats on every background
  // refresh would fight the reader (the same trap as the content-gate pattern).
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!startOpen || !gap || scrolledRef.current) return;
    scrolledRef.current = true;
    document.getElementById('threat-coverage')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [startOpen, gap]);

  // Control state picker. Choosing a real state on a not-yet-deployed control
  // deploys it (linkRiskControl → system_controls + auto-provisioned components),
  // then stamps the chosen status; "unknown / missing" just marks a deployed
  // control's health unknown (a gap control is already effectively missing).
  async function handleControlState(c, status, exclusionReason) {
    setErr('');
    try {
      // v152/v159: an objective delivered per system has a status that follows
      // its security solution (missing if it has none), so there is no state to send. Recording it on the system,
      // or lifting an exclusion, is all a person does; the API derives the rest.
      if (followsSolution(c) && status !== 'not_applicable') {
        if (!c.on_system) await linkRiskControl(risk.id, c.id);
        else if (c.system_status === 'not_applicable') await setSystemControlStatus(risk.system_id, c.id, 'unknown');
        await refetchGap();
        onChange();
        return;
      }
      // Excluding is a DECISION, not a health report: the control must be on the
      // system to carry the decision and its reason, and the API refuses the
      // status without one.
      if (status === 'not_applicable') {
        if (!c.on_system) await linkRiskControl(risk.id, c.id);
        await setSystemControlStatus(risk.system_id, c.id, status, exclusionReason);
      } else if (status === 'operational' || status === 'degraded') {
        if (!c.on_system) await linkRiskControl(risk.id, c.id);
        await setSystemControlStatus(risk.system_id, c.id, status);
      } else if (c.on_system) {
        await setSystemControlStatus(risk.system_id, c.id, 'unknown');
      }
      await refetchGap();
      onChange();
    } catch (e) { setErr(e.response?.data?.error || 'Failed to set control state.'); }
  }

  // Choosing "not applicable" opens a reason prompt rather than saving; the
  // control is only excluded once a reason exists, so the record can never hold
  // an unexplained exclusion.
  const [excluding, setExcluding] = useState(null);   // { control, reason }

  // Component state picker — the same shape as handleControlState above.
  // Choosing a state on a component that is NOT yet on the system links it
  // first, because PATCH /systems/:id/components/:cid only updates an existing
  // row (404 "Component is not on this system" otherwise). Without this the
  // panel showed a dead "missing" chip: the only route was the System page,
  // which can link but cannot set a status, so marking a component operational
  // took two pages — and the link landed it at the column default `unknown`,
  // making it a mandatory remediation candidate on every risk for the system.
  async function handleComponentState(cc, status) {
    setErr('');
    try {
      if (!cc.on_system) await linkSystemComponent(risk.system_id, cc.id);
      await setSystemComponentStatus(risk.system_id, cc.id, status);
      await refetchGap();
      onChange();
    } catch (e) { setErr(e.response?.data?.error || 'Failed to set component state.'); }
  }

  // Per-control residual probability. Sends all three dimensions (the endpoint
  // requires them); the DB derives risks.probability_* = MAX over the threat's
  // controls, so we reload the risk to refresh the Current Risk score.
  // ONE picker, not three. The model keeps C/I/A apart and the arithmetic
  // depends on that, but asking an analyst for three numbers per control across
  // a panel of eight was twenty-four pickers producing one judgement nobody was
  // really making three times. `expand` puts the single figure back across the
  // dimensions, respecting each one's inherent ceiling.
  async function handleProb(c, value) {
    setErr('');
    const body = expand(value, inherent);
    try { await setRiskControlProbability(risk.id, c.id, body); await refetchGap(); onChange(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to set probability.'); }
  }

  // Add a control to the threat's coverage (catalogue-only → appears as a GAP;
  // the state picker is then how it gets deployed). Requires controls.write.
  const linkedIds = new Set((gap?.controls || []).map(c => c.id));
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const { controls } = await getControls({ q: search });
        setResults((controls || []).filter(c => !linkedIds.has(c.id)));
      } catch { /* silent */ } finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, gap]);

  async function handleAddToThreat(controlId) {
    setErr('');
    try {
      await linkThreatControl(risk.threat_id, controlId);
      setSearch(''); setResults([]);
      await refetchGap();
    } catch (e) { setErr(e.response?.data?.error || 'Failed to add control.'); }
  }

  const inherent = gap?.threat_inherent || { c: 5, i: 5, a: 5 };
  // Which control is actually setting the current number. The aggregate is a MIN
  // over the deployed controls, so one of them owns the score and the rest look
  // inert — true, by design, and previously invisible. Name it out loud.
  const drivers = coverageDrivers(gap?.controls ?? [], inherent);
  const ctlMuted  = c  => !c.on_system  || c.system_status === 'unknown';
  const compMuted = cc => !cc.on_system || cc.system_status === 'missing' || cc.system_status === 'unknown';

  // What the gap would buy if it were closed, and whether anyone has committed
  // to closing it. Both derived from the payload already on screen.
  const counts   = gapCounts(gap);
  const forecast = coverageForecast(gap?.controls ?? [],
    { c: risk.impact_c, i: risk.impact_i, a: risk.impact_a });
  const planning = gapPlanning(gap?.controls ?? []);

  // The panel was one list answering three questions at once: what protects this
  // system, what is present but not working, and what is absent. Those ask
  // different things of the reader — nothing, repair, and build — so they are now
  // three sections. `controlGrouping` owns the rule.
  const sections = groupControls(gap?.controls ?? []);

  // One row renderer, three sections. The row itself is unchanged — what moved
  // is which list it lands in.
  // An objective delivered per system: its state on the system is derived from
  // its security solution's parts (v152) — and is missing when no security
  // solution delivers it (v159) — so the picker offers no states.
  const hasSolution = (c) => Array.isArray(c.solutions) && c.solutions.length > 0;
  const followsSolution = (c) => c.delivery === 'system';

  function renderControlRow(c) {
            const ctlValue = c.on_system && CONTROL_STATUSES.includes(c.system_status)
              ? c.system_status : 'unknown';
            // A control drives the CURRENT risk only when deployed and working
            // (operational | degraded). Otherwise its score is a dormant TARGET
            // (used to plan security actions) and doesn't move the current risk.
            const countsNow = ['operational', 'degraded'].includes(c.system_status);
            const isDriver = drivers.driverIds.has(c.id);
            const dims = isDriver ? driverDims(c.id, drivers.byDim) : [];
            // A degraded control counts a rung worse than the score shown
            // against it (0115). Without flagging that, the row reads 2 while
            // the risk is computed from 3 — which looks like an arithmetic bug.
            const penalised = penalisedDims(c, inherent);
            // One picker means one penalty marker: the worst of them, matching
            // what the collapsed figure shows.
            const worstPenalty = penalised.length
              ? penalised.reduce((a, b) => (b.counts > a.counts ? b : a)) : null;
            const isExcluded = c.system_status === 'not_applicable';
            // Delivered organisation-wide or for a group (v127/v128): there is no
            // per-system record to edit — its status is the control's own,
            // changed on the objective page.
            const deliveredOff = isDeliveredOnce(c);
            const placement = classifyControl(c);
            const gaps = componentGaps(c);
            // With security solutions (v145/v147), `components` holds only the
            // parts of the solution in use; the others are alternatives.
            const solutions = solutionSummary(c.solutions);
            return (
              <li key={c.id} className={`${styles.tcRow} ${isDriver ? styles.tcRowDriver : ''}`}>
                <div className={styles.tcMain}>
                  {/* Control (left) */}
                  <div className={styles.tcControl}>
                    {deliveredOff ? (
                      <DeliveredControlChip control={c} />
                    ) : followsSolution(c) ? (
                    // v152: the state follows the security solution. What is left
                    // to a person is recording it here and excluding it here.
                    <select
                      className={isExcluded ? styles.statusSelectExcluded : styles.statusSelect}
                      value={isExcluded ? 'not_applicable' : 'follows'}
                      disabled={!canEdit}
                      onChange={e => {
                        if (e.target.value === 'not_applicable') setExcluding({ c, reason: '' });
                        else if (e.target.value === 'record') handleControlState(c, 'operational');
                      }}
                      title={hasSolution(c)
                        ? "This control objective has a security solution, so its state on this system follows that solution's parts and is not set by hand."
                        : 'No security solution delivers this control objective, so it is missing here. Give it a security solution on the Security solutions page, or mark it not applicable here with a reason.'}
                      aria-label={`State of ${c.title} on this system`}
                    >
                      {!isExcluded && (
                        <option value="follows">
                          {!c.on_system ? 'not recorded here'
                            : hasSolution(c) ? `${ctlValue === 'unknown' ? 'missing' : ctlValue} (follows its solution)`
                            : 'missing (no security solution)'}
                        </option>
                      )}
                      {(isExcluded || !c.on_system) && (
                        <option value="record">{isExcluded ? 'applies here (follows its solution)' : 'record on this system'}</option>
                      )}
                      <option value="not_applicable">not applicable here</option>
                    </select>
                    ) : (
                    <select
                      className={isExcluded ? styles.statusSelectExcluded : styles.statusSelect}
                      value={ctlValue}
                      disabled={!canEdit}
                      onChange={e => {
                        if (e.target.value === 'not_applicable') setExcluding({ c, reason: '' });
                        else handleControlState(c, e.target.value);
                      }}
                      aria-label={`State of ${c.title} on this system`}
                    >
                      <option value="unknown">unknown / missing</option>
                      <option value="operational">operational</option>
                      <option value="degraded">degraded</option>
                      <option value="not_applicable">not applicable here</option>
                    </select>
                    )}
                    {!c.on_system && !deliveredOff && <span className={styles.chipGap}>GAP</span>}
                    {/* A control marked operational sitting under "needs
                        improvement" looks misfiled unless the panel says why. */}
                    {placement.reason === 'components' && (
                      <span
                        className={styles.tcIncompleteChip}
                        title={`This control is marked operational, but ${gaps.length} of its delivering component${gaps.length === 1 ? ' is' : 's are'} missing or not working on this system, so it is not fully effective here.`}
                      >
                        {gaps.length} component{gaps.length === 1 ? '' : 's'} incomplete
                      </span>
                    )}
                    {isExcluded && (
                      <span className={styles.tcExcludedChip} title="This control is not applicable on this system, so it is neither a gap nor a contributor to the score.">
                        not applicable
                      </span>
                    )}
                    {isDriver && !isExcluded && (
                      <span
                        className={styles.tcDriverChip}
                        title={`This control sets the current probability on ${dims.map(d => d.toUpperCase()).join(', ')}. It is the lowest-scoring deployed control on ${dims.length === 1 ? 'that dimension' : 'those dimensions'}, and the risk cannot fall further until it improves.`}
                      >Greatest Probability Effect</span>
                    )}
                    <span className={ctlMuted(c) ? styles.tcMuted : undefined}>
                      {c.framework_ref && <span className={styles.tcRef}>{c.framework_ref} </span>}
                      <button
                        type="button"
                        className={styles.tcCtlTitleBtn}
                        onClick={() => navigate(`/controls/${c.id}?from=risk`)}
                        title="Open control"
                      >{c.title}</button>
                    </span>
                    <TypePill type={c.control_type} />
                    {c.has_open_action && <span className={styles.plannedTag} title="A security action is in flight to improve this">planned</span>}
                    {canEdit && canCurate && (
                      <button
                        type="button"
                        className={styles.tcRemove}
                        onClick={() => unlinkFromThreat(c.id)}
                        title="Remove this control from the threat coverage"
                        aria-label={`Remove ${c.title} from threat coverage`}
                      >×</button>
                    )}
                  </div>

                  {/* Components (right) */}
                  <div className={styles.tcComponents}>
                    {solutions && (
                      <div className={styles.tcSolutions}>
                        {solutions.inUse
                          ? <span><PatternChip kind="solution" iconOnly /> Delivered by <b>{solutions.inUse.name}</b> — {solutionStateLabel(solutions.inUse.state)}</span>
                          : <span>No security solution is in place here.</span>}
                        {solutions.alsoComplete.length > 0 && (
                          <span className={styles.tcSolutionsSub}>
                            Also complete here: {solutions.alsoComplete.map(x => x.name).join(', ')}
                          </span>
                        )}
                        {solutions.alternatives.length > 0 && (
                          <span className={styles.tcSolutionsSub}
                            title="Any one complete security solution delivers this objective. These are other ways of delivering it; they are not used here, so their parts are not gaps.">
                            {solutions.inUse ? 'Other ways to deliver it (not used here)' : 'Ways to deliver it'}:{' '}
                            {solutions.alternatives.map(x => x.name).join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                    {c.components.length === 0
                      ? (solutions ? null : <span className={styles.cardHint}>no components</span>)
                      : deliveredOff
                      // Delivered once, not system by system: its components
                      // have no per-system state to record here.
                      ? c.components.map(cc => (
                          <div key={cc.id} className={styles.tcComp}>
                            <span className={styles.compType}>{componentTypeShort(cc.component_type)}</span>
                            <span className={styles.tcCompName}>{cc.name}</span>
                          </div>
                        ))
                      : c.components.map(cc => (
                          <div key={cc.id} className={styles.tcComp}>
                            <span className={styles.compType}>{componentTypeShort(cc.component_type)}</span>
                            <span className={compMuted(cc) ? styles.tcMuted : styles.tcCompName}>{cc.name}</span>
                            {cc.has_open_action && <span className={styles.plannedTag} title="A security action is in flight to improve this">planned</span>}
                            {isShared(cc) ? <SharedComponentChip component={cc} /> : <>
                            {/* A component that is not on the system is shown as
                                `missing` and is still selectable — choosing a
                                state links it and stamps that state in one go,
                                mirroring the control picker on the left. */}
                            <select
                              className={cc.on_system ? styles.statusSelect : styles.statusSelectGap}
                              value={cc.on_system && COMPONENT_STATUSES.includes(cc.system_status)
                                ? cc.system_status : 'missing'}
                              disabled={!canEdit}
                              onChange={e => handleComponentState(cc, e.target.value)}
                              aria-label={`State of ${cc.name} on this system`}
                              title={cc.on_system
                                ? undefined
                                : `${cc.name} is not recorded on this system — choosing a state adds it`}
                            >
                              {COMPONENT_STATUSES.map(s => <option key={s} value={s}>{componentStatusLabel(cc.component_type, s).toLowerCase()}</option>)}
                            </select>
                            </>}
                          </div>
                        ))}
                  </div>
                </div>

                {isExcluded && c.exclusion_reason && (
                  <p className={styles.tcExcludedReason}>
                    Excluded from this system — “{c.exclusion_reason}”
                    {c.excluded_by_name && <> · recorded by {c.excluded_by_name}</>}
                  </p>
                )}

                {excluding?.c?.id === c.id && (
                  <div className={styles.tcExcludeForm}>
                    <label className={styles.tcExcludeLabel} htmlFor={`excl-${c.id}`}>
                      Why is this control not appropriate on this system?
                    </label>
                    <input
                      id={`excl-${c.id}`}
                      className={styles.tcExcludeInput}
                      autoFocus
                      placeholder="e.g. Air-gapped; no external update path exists here."
                      value={excluding.reason}
                      onChange={e => setExcluding(x => ({ ...x, reason: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setExcluding(null);
                        if (e.key === 'Enter' && excluding.reason.trim()) {
                          handleControlState(c, 'not_applicable', excluding.reason.trim());
                          setExcluding(null);
                        }
                      }}
                    />
                    <button
                      className={styles.btnSave}
                      disabled={!excluding.reason.trim()}
                      onClick={() => {
                        handleControlState(c, 'not_applicable', excluding.reason.trim());
                        setExcluding(null);
                      }}
                    >Exclude</button>
                    <button className={styles.btnCancel} onClick={() => setExcluding(null)}>
                      Cancel
                    </button>
                    <span className={styles.cardHint}>
                      The reason is recorded against the control and written to the audit log.
                      An excluded control is neither a gap nor a contributor to the score.
                    </span>
                  </div>
                )}

                {/* Per-control residual probability. A DEPLOYED control
                    (operational | degraded) drives the current risk; a
                    not-deployed one records a dormant TARGET that doesn't move
                    the current risk (used to plan security actions). */}
                <div className={styles.tcProb}>
                  <span
                    className={styles.tcProbLabel}
                    title={countsNow
                      ? "Attack probability once this deployed control is considered (scored as-is). The best (lowest) deployed control sets the current risk; not-deployed controls don't affect it."
                      : "This control isn't deployed, so this score is a target for when it is — it does not change the current risk. The current risk is driven only by operational/degraded controls."}
                  >
                    {countsNow ? 'Residual probability after this control' : 'Target probability (when in place)'}
                  </span>
                  <div className={styles.tcProbDims}>
                    <ChipSelector
                      value={collapse(c)}
                      wordScale="probability"
                      max={Math.max(inherent.c, inherent.i, inherent.a)}
                      disabled={!canEdit}
                      onChange={v => handleProb(c, v)}
                    />
                    {/* 467 of 728 stored judgements differ across C/I/A, so a
                        flattened one says so rather than hiding it. */}
                    {isMixed(c) && (
                      <span
                        className={styles.tcMixedChip}
                        title={`Recorded as ${tripleText(c)} across confidentiality / integrity / availability. This shows the worst of the three; changing it applies one figure to all three, each capped by the threat's own ceiling.`}
                      >
                        {tripleText(c)}
                      </span>
                    )}
                    {worstPenalty && (
                      <span
                        className={styles.tcDegradedEff}
                        title={`This control is DEGRADED, so it counts as ${worstPenalty.counts} — one rung worse than the ${worstPenalty.scored} scored against it, which assumes it is working. The risk is computed from the worse figure. Repair the control to recover it.`}
                      >
                        <span aria-hidden="true">→</span>
                        <span className={styles.tcDegradedEffVal}>{worstPenalty.counts}</span>
                        <span className={styles.srOnly}>
                          {` degraded — counts as ${worstPenalty.counts}, not ${worstPenalty.scored}`}
                        </span>
                      </span>
                    )}
                  </div>
                  {!countsNow
                    ? <span className={styles.cardHint}>{
                        !followsSolution(c) ? 'target — deploy this control (operational) to affect the current risk'
                        : hasSolution(c) ? 'target — counts once its security solution is in place on this system'
                        : 'target — counts only once a security solution delivers it and is in place on this system'}</span>
                    : !c.probability_judged && <span className={styles.cardHint}>(inherent — not yet scored)</span>}
                  {worstPenalty && (
                    <span className={styles.tcDegradedNote}>
                      Degraded — counts as <strong>{worstPenalty.counts}</strong>, one rung worse
                      than scored. The risk uses the worse figure.
                    </span>
                  )}
                </div>
              </li>
            );
  }


  return (
    <CollapsibleCard
      title="Controls against this threat"
      helpKey="risk.detail.mitigating_controls"
      // Forward-looking on purpose. The panel is where the gap is closed, so the
      // question it answers is what we WILL do, not a report on the past.
      description={risk.threat_name
        ? `How will we protect this system against “${risk.threat_name}”?`
        : 'How will we protect this system?'}
      // Folded by default: on a well-covered risk this panel is a long list
      // confirming there is nothing to do. The summary says whether it is worth
      // opening, which is the only question a reader has before opening it.
      // Open when the creation wizard sent the analyst straight here to do it.
      id="threat-coverage"
      defaultCollapsed={!startOpen}
      collapsedSummary={
        !gap ? null : (
          <div className={styles.tcFolded}>
            <span className={counts.total === 0 ? styles.tcFoldedOk : styles.tcFoldedGap}>
              {counts.total === 0
                ? 'No gaps — every linked control is operational here'
                : `${counts.controls} control${counts.controls === 1 ? '' : 's'}`
                  + ` and ${counts.components} component${counts.components === 1 ? '' : 's'} missing`}
            </span>
            {counts.total > 0 && forecast.score == null && (
              <span className={styles.tcFoldedUnknown}>
                What closing it would buy is not yet estimated — no control here
                carries a judged residual.
              </span>
            )}
            {/* This line used to read "Closing this gap would reduce the risk
                to X", which claims two things it cannot support. X is the best
                the LINKED controls could achieve if each performed as judged —
                not a target anybody has committed to — and on 174 of 179 risks
                it equals the score today, so the sentence promised a reduction
                that was not on offer. It now says which of the three situations
                the reader is actually in. */}
            {counts.total > 0 && forecast.score != null && forecast.score >= risk.risk_score && (
              <span className={styles.tcFoldedNeutral}>
                Closing the remaining gaps would not lower the score on its own —
                these controls are already delivering everything they have been
                judged capable of. It would fall only if someone judges what the
                missing controls would buy.
              </span>
            )}
            {counts.total > 0 && forecast.score != null && forecast.score < risk.risk_score && (
              <span className={styles.tcFoldedForecast}>
                The best these controls could achieve is{' '}
                <RatingChip value={forecast.score} scale="risk" variant={isExpert ? 'number' : 'word'} />
                {planning.state === 'planned'      && <span className={styles.tcPlannedYes}>planned</span>}
                {planning.state === 'not_planned'  && <span className={styles.tcPlannedNo}>not planned</span>}
                {planning.state === 'part_planned' && (
                  <span className={styles.tcPlannedPart}>
                    {planning.planned} of {planning.total} planned
                  </span>
                )}
                {/* The figure rests on something that is not here. Say so, and
                    name it — with one or two it is actionable; with more it is a
                    count. */}
                {forecast.absent.length > 0 && (
                  <span className={styles.tcFoldedRests}>
                    …but that rests on{' '}
                    {forecast.absent.length <= 2
                      ? forecast.absent.map(c => c.title).join(' and ')
                      : `${forecast.absent.length} controls`}
                    , which {forecast.absent.length === 1 ? 'is' : 'are'} not in place on this
                    system. {absentNextSteps(forecast.absent)}
                  </span>
                )}
              </span>
            )}
          </div>
        )
      }
    >
      {err && <p className={styles.saveErr}>{err}</p>}

      {!gap ? (
        <p className={styles.cardHint}>Loading coverage…</p>
      ) : gap.controls.length === 0 ? (
        <p className={styles.emptyMsg}>No controls are linked to this threat yet.</p>
      ) : (
        <div className={styles.tcPanel}>
          <div className={styles.tcHead}>
            <span className={styles.tcHeadTitle}>
              Controls
              {risk.threat_name && <span className={styles.tcVs}> vs “{risk.threat_name}”</span>}
              {' '}<HelpDot k="risk.detail.coverage_controls" placement="bottom" />
            </span>
            {/* Derived from the same classifier as the sections below, so the
                header can never disagree with what the reader then counts. The
                backend's summary counts only controls absent from the system,
                which is a narrower question than the one the sections ask. */}
            <span className={styles.tcSummary}>
              {sections[OPERATIONAL].length} operational
              {' · '}{sections[IMPAIRED].length} needing improvement
              {' · '}{sections[MISSING].length} missing
              {sections[EXCLUDED].length > 0 && ` · ${sections[EXCLUDED].length} excluded`}
            </span>
          </div>

          <p className={styles.tcExplain}>
            {drivers.deployedCount === 0 ? (
              <>
                <strong>No control is lowering this risk.</strong> Nothing here is
                operational or degraded on this system, so the probability stays at the
                threat&rsquo;s untreated level ({inherent.c}/{inherent.i}/{inherent.a}).
                Scores on the rows below are <em>targets</em> for when a control is deployed.
              </>
            ) : (
              <>
                <strong>The best deployed control sets the score</strong> — on each of C, I
                and A the current probability is the <em>lowest</em> figure among the{' '}
                {drivers.deployedCount} deployed control{drivers.deployedCount === 1 ? '' : 's'},
                now {drivers.floor.c}/{drivers.floor.i}/{drivers.floor.a}. The row
                {drivers.driverIds.size === 1 ? '' : 's'} marked{' '}
                <span className={styles.tcDriverChip}>greatest probability effect</span>{' '}
                {drivers.driverIds.size === 1 ? 'is' : 'are'} setting it today; the others are
                not lowering it further, and a control that is not deployed does not count at
                all. A <em>degraded</em> control counts one rung worse than its score.
              </>
            )}
          </p>

          {SECTIONS.map(({ key, title, helpKey, blurb, empty }) => {
            const rows = sections[key];
            // An empty section is dropped rather than shown as a reassuring
            // heading over nothing — except the operational one, whose emptiness
            // IS the finding: nothing on this system is protecting it.
            if (!rows.length && key !== OPERATIONAL) return null;
            return (
              <section key={key} className={styles.tcSection}>
                <h4 className={styles.tcSectionTitle}>
                  {title}
                  <span className={styles.tcSectionCount}>{rows.length}</span>
                  <HelpDot k={helpKey} placement="bottom" />
                </h4>
                <p className={styles.tcSectionBlurb}>{rows.length ? blurb : empty}</p>
                {rows.length > 0 && (
                  <ul className={styles.tcList}>{rows.map(renderControlRow)}</ul>
                )}
              </section>
            );
          })}

          {/* Add a control to address this threat (catalogue-only → appears as GAP) */}
          {canEdit && canCurate && (
            <div className={styles.tcAddBlock}>
              <input
                className={styles.componentSearchInput}
                placeholder="Add a control to address this threat (min 2 chars)…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {busy && <p className={styles.cardHint}>Searching…</p>}
              {!busy && results.length > 0 && (
                <div className={styles.componentResults}>
                  {results.slice(0, 10).map(c => (
                    <div key={c.id} className={styles.componentResultRow}>
                      <FrameworkRef framework={c.framework} frameworkRef={c.framework_ref} />
                      <span className={styles.componentName}>{c.title}</span>
                      <TypePill type={c.control_type} />
                      <button className={styles.componentAdd} onClick={() => handleAddToThreat(c.id)}>Add</button>
                    </div>
                  ))}
                </div>
              )}
              {!busy && search.length >= 2 && results.length === 0 && (
                <p className={styles.cardHint}>No matching controls found.</p>
              )}
            </div>
          )}
        </div>
      )}
    </CollapsibleCard>
  );

  async function unlinkFromThreat(controlId) {
    setErr('');
    try { await unlinkThreatControl(risk.threat_id, controlId); await refetchGap(); onChange(); }
    catch (e) { setErr(e.response?.data?.error || 'Failed to remove control.'); }
  }
}

// ── Linked components section ─────────────────────────────────────────────────

const PPITF_LABEL = COMPONENT_TYPE_LABEL;
const PPITF_TYPES = ['people', 'process', 'technology', 'facility'];


function LinkedComponentsSection({ risk, canEdit, onChange }) {
  const [editMode,   setEditMode]   = useState(false);
  const [systemComponents, setSystemComponents] = useState([]);
  const [loadingSys, setLoadingSys] = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [newTypeHint, setNewTypeHint] = useState('people');
  const [search,     setSearch]     = useState('');
  const [results,    setResults]    = useState([]);
  const [busy,       setBusy]       = useState(false);
  const [linkErr,    setLinkErr]    = useState('');

  function exitEdit() {
    setEditMode(false);
    setSearch('');
    setResults([]);
    setLinkErr('');
  }

  const vulnerableIds = new Set((risk.components || []).map(c => c.id));

  // Load all components on the parent system
  useEffect(() => {
    if (!risk.system_id) return;
    setLoadingSys(true);
    getSystem(risk.system_id)
      .then(s => setSystemComponents(s.components || []))
      .catch(() => {})
      .finally(() => setLoadingSys(false));
  }, [risk.system_id, risk.components]);

  // Search for components not yet on the system
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const systemIds = new Set(systemComponents.map(c => c.id));
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const { components } = await searchComponents(search);
        setResults((components || []).filter(c => c.component_type !== 'information' && !systemIds.has(c.id)));
      } catch { /* silent */ } finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, systemComponents]);

  async function handleMarkVulnerable(componentId) {
    setLinkErr('');
    try {
      await linkRiskComponent(risk.id, componentId);
      onChange();
    } catch (err) {
      setLinkErr(err.response?.data?.error || 'Failed to mark as vulnerable.');
    }
  }

  async function handleUnmark(componentId) {
    setLinkErr('');
    try {
      await unlinkRiskComponent(risk.id, componentId);
      onChange();
    } catch (err) {
      setLinkErr(err.response?.data?.error || 'Failed to remove vulnerability flag.');
    }
  }

  // Link a component to the system (from search results) then mark vulnerable
  async function handleLinkFromSearch(componentId) {
    setLinkErr('');
    try {
      await linkSystemComponent(risk.system_id, componentId);
      await linkRiskComponent(risk.id, componentId);
      setSearch(''); setResults([]);
      onChange();
    } catch (err) {
      setLinkErr(err.response?.data?.error || 'Failed to link component.');
    }
  }

  // Create new component, link to system, mark as vulnerable
  async function handleCreated(created) {
    setShowNew(false);
    setLinkErr('');
    try {
      if (risk.system_id) await linkSystemComponent(risk.system_id, created.id);
      await linkRiskComponent(risk.id, created.id);
      onChange();
    } catch (err) {
      setLinkErr(err.response?.data?.error || 'Component created but failed to link.');
    }
  }

  // Components that are on the system because they deliver a security control are
  // surfaced (with their health) in "Controls against this threat". Listing them
  // here too would be confusing, so exclude them from the vulnerable-components
  // display. Keep the full list for the search-dedup above so they still can't be
  // re-added as if absent.
  const displayComponents = systemComponents.filter(c => !c.via_control);
  const hiddenControlComps = systemComponents.length - displayComponents.length;
  const vulnerableCount = displayComponents.filter(c => vulnerableIds.has(c.id)).length;
  const byType = {};
  PPITF_TYPES.forEach(t => { byType[t] = []; });
  displayComponents.forEach(c => { if (byType[c.component_type]) byType[c.component_type].push(c); });


  return (
    <CollapsibleCard
      title="Vulnerable System Components"
      description="Which parts of this system introduce or amplify this risk?"
      helpKey="risk.detail.vulnerable_components"
      // Folded like the coverage panel, and for the same reason: on most systems
      // this is a long inventory whose answer is a count. The summary gives that
      // count, so opening it is a choice rather than a scroll.
      defaultCollapsed
      collapsedSummary={loadingSys ? null : (
        <div className={styles.tcFolded}>
          <span className={vulnerableCount === 0 ? styles.tcFoldedOk : styles.tcFoldedGap}>
            {displayComponents.length} component{displayComponents.length === 1 ? '' : 's'} on this system
            {vulnerableCount === 0
              ? ' — none marked vulnerable to this threat'
              : `, ${vulnerableCount} marked vulnerable to this threat`}
          </span>
          {hiddenControlComps > 0 && (
            <span className={styles.tcFoldedUnknown}>
              A further {hiddenControlComps} deliver{hiddenControlComps === 1 ? 's' : ''} a security
              control and {hiddenControlComps === 1 ? 'is' : 'are'} managed under
              {' '}“Controls against this threat”.
            </span>
          )}
        </div>
      )}
      editing={editMode}
      headerActions={
        <PanelEditButtons
          canEdit={canEdit}
          editing={editMode}
          live
          onEdit={() => setEditMode(true)}
          onDone={exitEdit}
        />
      }
    >
      <div className={styles.compPanelHeader}>
        {editMode && (
          <button className={styles.btnAddAction} onClick={() => setShowNew(true)}>+ New component</button>
        )}
      </div>

      {linkErr && <p className={styles.saveErr}>{linkErr}</p>}

          {loadingSys && <p className={styles.cardHint}>Loading system components…</p>}

          {!loadingSys && displayComponents.length === 0 && (
            <p className={styles.emptyMsg}>
              {systemComponents.length === 0
                ? `No components on this system yet.${editMode ? ' Use "New component" to add one.' : ''}`
                : 'Every component on this system delivers a security control — see “Controls against this threat”.'}
            </p>
          )}

          {!loadingSys && hiddenControlComps > 0 && displayComponents.length > 0 && (
            <p className={styles.cardHint}>
              {hiddenControlComps} control-delivered component{hiddenControlComps === 1 ? '' : 's'} hidden — managed under “Controls against this threat”.
            </p>
          )}

          {!loadingSys && PPITF_TYPES.map(type => {
            const comps = byType[type];
            if (comps.length === 0) return null;
            return (
              <div key={type} className={styles.compTypeCluster}>
                <TypeBadge type={type} small />
                <div className={styles.compPillsRow}>
                  {comps.map(c => {
                    const isVulnerable = vulnerableIds.has(c.id);
                    const chipCls  = isVulnerable ? styles.vulnChip : styles.notSelectedChip;
                    const chipText = isVulnerable ? 'vulnerable' : 'not selected';
                    return (
                      <span key={c.id} className={styles.compVulnRow}>
                        <ComponentPill component={c} variant="subtle" showStatus />
                        {editMode ? (
                          <button
                            type="button"
                            className={chipCls}
                            onClick={() => (isVulnerable ? handleUnmark(c.id) : handleMarkVulnerable(c.id))}
                            title={isVulnerable ? 'Click to mark as not selected' : 'Click to mark as vulnerable'}
                          >{chipText}</button>
                        ) : (
                          <span className={chipCls}>{chipText}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Search for components not on the system yet */}
          {editMode && (
            <div className={styles.componentPicker}>
              <p className={styles.compPickerLabel}>Add a component not yet on this system:</p>
              <div className={styles.compSearchRow}>
                <input
                  className={styles.componentSearchInput}
                  placeholder="Search component library (min 2 chars)…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {busy && <p className={styles.cardHint}>Searching…</p>}
              {!busy && results.length > 0 && (
                <div className={styles.componentResults}>
                  {results.slice(0, 8).map(c => (
                    <div key={c.id} className={styles.componentResultRow}>
                      <span className={styles.componentName}>{c.name}</span>
                      <span
                        className={styles.componentTypeChip}
                        style={{
                          background: `color-mix(in srgb, ${getComponentColor(c.component_type).bg} 15%, transparent)`,
                          color: getComponentColor(c.component_type).border,
                          border: `1px solid ${getComponentColor(c.component_type).border}`,
                        }}
                      >
                        {PPITF_LABEL[c.component_type] || c.component_type}
                      </span>
                      <button className={styles.componentAdd} onClick={() => handleLinkFromSearch(c.id)}>
                        Add to system
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!busy && search.length >= 2 && results.length === 0 && (
                <p className={styles.cardHint}>
                  Not in library.{' '}
                  <button type="button" className={styles.btnLink} onClick={() => { setNewTypeHint('people'); setShowNew(true); }}>
                    Create new component
                  </button>
                </p>
              )}
            </div>
          )}

      {showNew && (
        <ComponentModal
          componentType={newTypeHint || 'technology'}
          onClose={() => setShowNew(false)}
          onSaved={handleCreated}
        />
      )}
    </CollapsibleCard>
  );
}

// ── Panel 5: Risk history ─────────────────────────────────────────────────
// Lazy-loaded: data fetched on first expand, not on page load.

const SOURCE_LABEL = {
  direct_edit:     'Direct edit',
  action_verified: 'Action verified',
};

function HistoryDelta({ label, prev, next }) {
  if (prev === next) return null;
  return (
    <span className={styles.historyDelta}>
      <span className={styles.historyDeltaLabel}>{label}</span>
      <span className={`${chipClass()} ${scoreClass(prev)}`}>{prev ?? '—'}</span>
      <span className={styles.historyArrow}>→</span>
      <span className={`${chipClass()} ${scoreClass(next)}`}>{next ?? '—'}</span>
    </span>
  );
}

function ResidualHistoryPanel({ riskId }) {
  const [history,   setHistory]   = useState(null); // null = not yet fetched
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [collapsed, setCollapsed] = useState(true);

  async function fetchHistory() {
    if (history !== null || loading) return;
    setLoading(true);
    try {
      const data = await getResidualHistory(riskId);
      setHistory(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load risk history.');
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const nowOpen = collapsed;
    setCollapsed(c => !c);
    if (nowOpen) fetchHistory();
  }

  return (
    <section className={`${styles.card} ${collapsed ? styles.cardCollapsed : ''}`}>
      <div className={styles.cardHeaderRow}>
        <button
          type="button"
          className={styles.cardHeaderToggle}
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          <h2 className={styles.cardTitle}>Risk history</h2>
        </button>
        <HelpDot k="risk.detail.history" placement="bottom" />
        <div className={styles.cardHeaderRight}>
          <button
            type="button"
            className={styles.chevronBtn}
            onClick={toggle}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            <span className={styles.collapseChevron} aria-hidden="true">
              {collapsed ? '▸' : '▾'}
            </span>
          </button>
        </div>
      </div>
      <p className={styles.cardHint}>Audit trail of every change to this risk&apos;s probability and impact.</p>

      {!collapsed && (
        <>
          {loading && <div className={styles.loadingBar} />}
          {error   && <p className={styles.saveErr}>{error}</p>}

          {history !== null && history.length === 0 && (
            <p className={styles.emptyMsg}>No risk changes recorded yet.</p>
          )}

          {history !== null && history.length > 0 && (
            <div className={styles.historyList}>
              {history.map(h => {
                const prevMaxScore = Math.max(
                  (h.prev_probability_c ?? 0) * (h.prev_residual_imp_c ?? 0),
                  (h.prev_probability_i ?? 0) * (h.prev_residual_imp_i ?? 0),
                  (h.prev_probability_a ?? 0) * (h.prev_residual_imp_a ?? 0),
                );
                const newMaxScore = Math.max(
                  (h.new_probability_c ?? 0) * (h.new_residual_imp_c ?? 0),
                  (h.new_probability_i ?? 0) * (h.new_residual_imp_i ?? 0),
                  (h.new_probability_a ?? 0) * (h.new_residual_imp_a ?? 0),
                );
                const scoreChanged = prevMaxScore !== newMaxScore;
                return (
                  <div key={h.id} className={styles.historyEntry}>
                    <div className={styles.historyEntryHeader}>
                      <span className={styles.historyWhen}>{fmtDate(h.changed_at)}</span>
                      <span className={styles.historyBy}>{h.changed_by_name || 'System'}</span>
                      <span className={styles.historySource}>
                        {SOURCE_LABEL[h.source] || h.source}
                        {h.source_action_title && (
                          <span className={styles.historyActionRef}> — {h.source_action_title}</span>
                        )}
                      </span>
                      {scoreChanged && (
                        <span className={styles.historyScoreChange}>
                          <span className={`${chipClass()} ${scoreClass(prevMaxScore)}`}>{prevMaxScore || '—'}</span>
                          <span className={styles.historyArrow}>→</span>
                          <span className={`${chipClass()} ${scoreClass(newMaxScore)}`}>{newMaxScore || '—'}</span>
                        </span>
                      )}
                    </div>

                    <div className={styles.historyDeltas}>
                      <HistoryDelta label="P·C" prev={h.prev_probability_c}   next={h.new_probability_c} />
                      <HistoryDelta label="P·I" prev={h.prev_probability_i}   next={h.new_probability_i} />
                      <HistoryDelta label="P·A" prev={h.prev_probability_a}   next={h.new_probability_a} />
                      <HistoryDelta label="I·C" prev={h.prev_residual_imp_c}  next={h.new_residual_imp_c} />
                      <HistoryDelta label="I·I" prev={h.prev_residual_imp_i}  next={h.new_residual_imp_i} />
                      <HistoryDelta label="I·A" prev={h.prev_residual_imp_a}  next={h.new_residual_imp_a} />
                    </div>

                    {h.notes && <p className={styles.historyNotes}>{h.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── ValidationPanel ───────────────────────────────────────────────────────────
// Shown on RiskDetailPage for CISO when risk is pending or returned.
// Always displays a readiness checklist; expands into validate/return form
// when the "Validate / Return" button in the header is toggled.

function readinessChecks(risk) {
  const checks = [];
  const activeActions = (risk.actions || []).filter(
    a => a.status !== 'cancelled'
  );
  const activeException = (risk.exceptions || []).find(e => e.status === 'active');
  const threshold = risk.mandatory_action_score ?? 12;
  const levelAboveThreshold = (risk.risk_score ?? 0) >= threshold;

  // 1. Treatment decision
  if (!risk.treatment_decision) {
    checks.push({ ok: false, label: 'Set a treatment decision', section: 'treatment' });
  } else {
    checks.push({ ok: true, label: `Treatment: ${risk.treatment_decision}` });
  }

  // 2. Action requirement for mitigate / transfer
  if (['mitigate', 'transfer'].includes(risk.treatment_decision)) {
    if (activeActions.length === 0) {
      checks.push({ ok: false, label: 'Propose at least one security action', section: 'actions' });
    } else {
      checks.push({ ok: true, label: `${activeActions.length} security action${activeActions.length > 1 ? 's' : ''} in plan` });
    }
  }

  // 3. Accept: need exception or no_action_required if above threshold
  if (risk.treatment_decision === 'accept') {
    if (levelAboveThreshold && !risk.no_action_required && !activeException) {
      checks.push({
        ok: false,
        label: `Risk scores ${risk.risk_score} — formal exception or "no action required" needed`,
        section: 'exceptions',
      });
    } else {
      checks.push({ ok: true, label: activeException ? 'Active exception recorded' : 'Accept conditions met' });
    }
  }

  return checks;
}

function ValidationPanel({ risk, open, action, notes, error, busy, onActionChange, onNotesChange, onSubmit }) {
  const checks = readinessChecks(risk);
  const allOk  = checks.every(c => c.ok);

  const scrollTo = (section) => {
    const el = document.getElementById(`risk-section-${section}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={styles.validationPanel}>
      {/* Readiness checklist — always visible */}
      <div className={styles.validationReadiness}>
        <span className={styles.validationReadinessLabel}>
          {allOk ? '✓ Ready to validate' : 'Complete before validating'}
          {' '}<HelpDot k="risk.detail.validation_readiness" placement="bottom" />
        </span>
        <div className={styles.validationChecks}>
          {checks.map((c, i) => (
            <span key={i} className={`${styles.validationCheck} ${c.ok ? styles.checkOk : styles.checkFail}`}>
              {c.ok ? '✓' : '✗'}{' '}
              {!c.ok && c.section ? (
                <button className={styles.checkLink} onClick={() => scrollTo(c.section)}>
                  {c.label}
                </button>
              ) : c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Inline validate/return form — shown when header button is toggled */}
      {open && (
        <div className={styles.validationForm}>
          <div className={styles.validationToggle}>
            <button
              className={`${styles.validationToggleBtn} ${action === 'validate' ? styles.toggleValidate : ''}`}
              onClick={() => onActionChange('validate')}
              disabled={busy}
            >
              ✓ Validate
            </button>
            <button
              className={`${styles.validationToggleBtn} ${action === 'return' ? styles.toggleReturn : ''}`}
              onClick={() => onActionChange('return')}
              disabled={busy}
            >
              ↩ Return to analyst
            </button>
          </div>
          {action === 'return' && (
            <textarea
              className={styles.validationNotes}
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Explain what needs to be addressed before re-submission… (min 10 characters)"
              rows={3}
              disabled={busy}
              autoFocus
            />
          )}
          {error && <p className={styles.validationError}>{error}</p>}
          <div className={styles.validationActions}>
            <button
              className={action === 'validate' ? styles.btnConfirmValidate : styles.btnConfirmReturn}
              onClick={onSubmit}
              disabled={busy || (action === 'validate' && !allOk)}
              title={action === 'validate' && !allOk ? 'Resolve the issues above before validating' : undefined}
            >
              {busy ? 'Submitting…' : action === 'validate' ? 'Confirm validation' : 'Return risk'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
