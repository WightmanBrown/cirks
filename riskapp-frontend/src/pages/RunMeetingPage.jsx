// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMeeting, getAgenda, recordDecision } from '../api/index';
import styles from './RunMeetingPage.module.css';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import { HelpDot } from '../components/HelpDot';

const CATEGORY_LABELS = {
  opening:          'Opening',
  previous_minutes: 'Previous Minutes & Actions Arising',
  change_briefing:  'Change Briefings',
  cycle_overview:   'Cycle Overview',
  isms_objectives:  'ISMS Objectives & Interested Parties',
  threat_identification: 'Identified Exposures Awaiting Assessment',
  new_risks:        'New Risks and Incidents Requiring Action',
  action_progress:  'Action Progress',
  sap_health:       'SAP Health',
  assurance:        'Assurance Reports',
  risk_validation:  'Risk Validation',
  action_adoption:  'Action Acceptance',
  exceptions:       'Exceptions',
  aob:              'Any Other Business',
  close:            'Close',
};

// Categories where formal SWG decisions are required
const DECISION_CATEGORIES = new Set([
  'risk_validation', 'action_adoption', 'exceptions',
]);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function itemStatus(item) {
  if (item.decision_recorded_at) return 'decided';
  if (item.discussed_at)         return 'discussed';
  return 'pending';
}

function statusIcon(item) {
  const s = itemStatus(item);
  if (s === 'decided')   return '✓';
  if (s === 'discussed') return '✓';
  return '○';
}

// ── Decision actions available per item ───────────────────────────────────────

function getActions(item, userRole) {
  const { category, entity_type, risk_data, action_data } = item;
  const isCiso = userRole === 'ciso' || userRole === 'admin';

  if (category === 'risk_validation' && entity_type === 'risk') {
    const vs = risk_data?.validation_status;
    if ((vs === 'pending' || vs === 'returned') && isCiso) {
      return [
        { key: 'validate', label: 'Validate',            variant: 'approve', requiresNotes: false },
        { key: 'return',   label: 'Return for revision', variant: 'reject',  requiresNotes: true },
      ];
    }
  }

  // Accepting freezes the action's items/owners/targets and snapshots the risk
  // baseline. The decision key stays 'adopt' so agenda items recorded against
  // past meetings keep resolving.
  if (category === 'action_adoption' && entity_type === 'security_action') {
    if (action_data?.status === 'proposed') {
      return [
        { key: 'adopt',  label: 'Accept', variant: 'approve', requiresNotes: false },
        { key: 'cancel', label: 'Cancel', variant: 'reject',  requiresNotes: false },
      ];
    }
  }

  return [];
}

// Returns true when decision text is recorded but the source entity hasn't been
// formally actioned yet — signals that the CISO needs to act.
function hasPendingEntityAction(item) {
  if (!item.decision_text) return false;
  const { category, entity_type, risk_data, action_data } = item;
  if (entity_type === 'risk' && risk_data?.validation_status === 'pending') return true;
  if (entity_type === 'security_action') {
    if (category === 'action_adoption' && action_data?.status === 'proposed') return true;
  }
  return false;
}

// ── Entity context block ──────────────────────────────────────────────────────

function EntityContext({ item }) {
  const { risk_data: r, action_data: a, exception_data: e, entity_type } = item;

  if (entity_type === 'risk' && r) {
    return (
      <div className={styles.entityCtx}>
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>Threat</span>{r.threat_name}</span>
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>System</span>{r.system_name}</span>
        {r.department  && <span className={styles.ctxRow}><span className={styles.ctxLabel}>Department</span>{r.department}</span>}
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>Validation</span>
          <span className={`${styles.vsBadge} ${styles[`vs_${r.validation_status}`]}`}>
            {r.validation_status}
          </span>
        </span>
      </div>
    );
  }

  if (entity_type === 'security_action' && a) {
    return (
      <div className={styles.entityCtx}>
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>Action</span>{a.title}</span>
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>Treatment</span>{a.treatment_type}</span>
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>Status</span>
          <span className={`${styles.statusBadge} ${styles[`sa_${a.status}`]}`}>{a.status}</span>
        </span>
      </div>
    );
  }

  if (entity_type === 'risk_exception' && e) {
    return (
      <div className={styles.entityCtx}>
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>Threat</span>{e.threat_name}</span>
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>System</span>{e.system_name}</span>
        {e.expires_at && (
          <span className={styles.ctxRow}><span className={styles.ctxLabel}>Expires</span>{formatDate(e.expires_at)}</span>
        )}
        <span className={styles.ctxRow}><span className={styles.ctxLabel}>Status</span>{e.status}</span>
      </div>
    );
  }

  return null;
}

// ── Decision form ─────────────────────────────────────────────────────────────

function DecisionForm({ item, meetingId, canEdit, userRole, onSaved }) {
  const actions = getActions(item, userRole);
  const isDecisionCategory = DECISION_CATEGORIES.has(item.category);
  const pendingAction = hasPendingEntityAction(item);
  const isSecretaryOnValidation =
    userRole === 'meeting_secretary' && item.category === 'risk_validation';

  const [decisionText,   setDecisionText]   = useState(item.decision_text ?? '');
  const [secretaryNotes, setSecretaryNotes] = useState(item.secretary_notes ?? '');
  const [selectedAction, setSelectedAction] = useState(null);
  const [notes,          setNotes]          = useState('');
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);

  // Reset form state when item changes
  useEffect(() => {
    setDecisionText(item.decision_text ?? '');
    setSecretaryNotes(item.secretary_notes ?? '');
    setSelectedAction(null);
    setNotes('');
    setError(null);
    // Reset form ONLY when the agenda item identity changes — depending on the
    // text fields would clobber in-progress edits on every keystroke.
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(actionOverride) {
    const action = actionOverride ?? selectedAction;
    setSaving(true);
    setError(null);
    try {
      const body = {};
      if (decisionText.trim() || isDecisionCategory) body.decision_text = decisionText.trim() || null;
      if (secretaryNotes !== item.secretary_notes)    body.secretary_notes = secretaryNotes.trim() || null;
      if (action)  body.action = action;
      if (notes.trim()) body.notes = notes.trim();

      const result = await recordDecision(meetingId, item.id, body);
      onSaved(result.item);
      setSelectedAction(null);
      setNotes('');
    } catch (err) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setSaving(false);
    }
  }

  const alreadyDecided  = !!item.decision_recorded_at;
  const alreadyDiscussed = !!item.discussed_at;

  return (
    <div className={styles.decisionForm}>
      <EntityContext item={item} />

      {item.notes && (
        <div className={styles.itemNotes}>{item.notes}</div>
      )}

      {/* Secretary hint on risk-validation items */}
      {isSecretaryOnValidation && !alreadyDecided && (
        <p className={styles.roleHint}>
          Record what the SWG decided below. The CISO will formally validate the risk in the system.
        </p>
      )}

      {/* Pending formal action — decision recorded but entity not yet actioned */}
      {pendingAction && (
        <div className={styles.pendingAction}>
          <span className={styles.pendingActionLabel}>Decision recorded</span>
          {userRole === 'ciso' || userRole === 'admin'
            ? ' — use the buttons below to apply it in the system.'
            : ' — awaiting formal action by the CISO.'}
        </div>
      )}

      {/* Existing recorded decision — shown when already decided */}
      {alreadyDecided && (
        <div className={styles.decisionRecorded}>
          <span className={styles.decisionRecordedLabel}>Recorded decision</span>
          <p className={styles.decisionRecordedText}>{item.decision_text || '—'}</p>
        </div>
      )}

      {canEdit && (
        <>
          {/* Decision text */}
          {isDecisionCategory && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                {alreadyDecided ? 'Amend decision text' : 'Decision text'}
              </label>
              <textarea
                className={styles.textarea}
                rows={3}
                value={decisionText}
                onChange={e => setDecisionText(e.target.value)}
                placeholder="What did the SWG formally decide? (This text will appear in the minutes.)"
                disabled={saving}
              />
            </div>
          )}

          {/* Action buttons for decision categories */}
          {actions.length > 0 && (
            <div className={styles.actionRow}>
              {actions.map(act => {
                const isSelected = selectedAction === act.key;
                return (
                  <button
                    key={act.key}
                    className={`${styles.actionBtn} ${styles[`actionBtn_${act.variant}`]} ${isSelected ? styles.actionBtnSelected : ''}`}
                    onClick={() => setSelectedAction(isSelected ? null : act.key)}
                    disabled={saving}
                  >
                    {act.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Notes field for actions that require it (return/reject) */}
          {selectedAction && actions.find(a => a.key === selectedAction)?.requiresNotes && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Notes for recipient (min 10 chars)</label>
              <textarea
                className={styles.textarea}
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Explain what needs to change…"
                disabled={saving}
              />
            </div>
          )}

          {/* Secretary notes */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Secretary notes (internal)</label>
            <textarea
              className={styles.textareaSmall}
              rows={2}
              value={secretaryNotes}
              onChange={e => setSecretaryNotes(e.target.value)}
              placeholder="Internal notes — not shown in minutes."
              disabled={saving}
            />
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.formButtons}>
            <button
              className={styles.btnRecord}
              onClick={() => handleSubmit()}
              disabled={saving}
            >
              {saving ? 'Saving…' : alreadyDecided ? 'Update' : alreadyDiscussed ? 'Update notes' : 'Mark as discussed'}
            </button>
            {selectedAction && (
              <button
                className={`${styles.btnConfirmAction} ${styles[`btnConfirmAction_${actions.find(a => a.key === selectedAction)?.variant}`]}`}
                onClick={() => handleSubmit(selectedAction)}
                disabled={saving}
              >
                {saving ? 'Saving…' : `Confirm: ${actions.find(a => a.key === selectedAction)?.label}`}
              </button>
            )}
          </div>
        </>
      )}

      {!canEdit && !alreadyDecided && (
        <p className={styles.readonlyHint}>No decision recorded yet.</p>
      )}
    </div>
  );
}

// ── RunMeetingPage ─────────────────────────────────────────────────────────────

export function RunMeetingPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [meeting,    setMeeting]    = useState(null);
  const [items,      setItems]      = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const sidebarItemRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [mData, aData] = await Promise.all([getMeeting(id), getAgenda(id)]);
      setMeeting(mData.meeting);
      setItems(aData.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Scroll sidebar to the active item
  useEffect(() => {
    sidebarItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIdx]);

  function handleSaved(updatedItem) {
    setItems(prev => prev.map(it => it.id === updatedItem.id ? { ...it, ...updatedItem } : it));
    if (currentIdx < items.length - 1) {
      setCurrentIdx(i => i + 1);
    }
  }

  const isSecretary = user?.role === 'meeting_secretary';
  const isCiso      = user?.role === 'ciso';
  const canEdit     = (isSecretary || isCiso || user?.role === 'siro' || user?.role === 'admin')
                      && !meeting?.minutes_issued_at;

  const state   = meeting ? (
    meeting.minutes_issued_at ? 'minutes_issued' :
    meeting.closed_at         ? 'closed' :
    meeting.planned_at        ? 'planned' : 'draft'
  ) : null;

  const current = items[currentIdx];

  const doneCount    = items.filter(i => itemStatus(i) !== 'pending').length;
  const decidedCount = items.filter(i => itemStatus(i) === 'decided').length;
  const pct          = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  if (loading) return <div className={styles.page}><p className={styles.loading}>Loading…</p></div>;
  if (error)   return <div className={styles.page}><p className={styles.err}>{error}</p></div>;

  return (
    <div className={styles.page}>
      {/* ── Header bar ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.btnExit} onClick={() => navigate(`/meetings/${id}`)}>← Exit kiosk</button>
          <span className={styles.headerTitle}>
            SWG Meeting — {formatDate(meeting?.meeting_date)} <HelpDot k="run_meeting.title" placement="bottom" />
          </span>
          <span className={`${styles.stateBadge} ${styles[`state_${state}`]}`}>{state}</span>
          {!canEdit && <ReadOnlyBadge reason="Your role can observe this meeting but cannot record decisions." />}
        </div>
        <div className={styles.headerRight}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.progressLabel}>
            {doneCount}/{items.length} discussed{decidedCount > 0 ? ` · ${decidedCount} decided` : ''}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No agenda items yet. <button className={styles.btnLink} onClick={() => navigate(`/meetings/${id}`)}>Generate agenda</button> first.</p>
        </div>
      ) : (
        <div className={styles.body}>
          {/* ── Sidebar ── */}
          <nav className={styles.sidebar}>
            {items.map((item, idx) => {
              const status   = itemStatus(item);
              const isActive = idx === currentIdx;
              return (
                <button
                  key={item.id}
                  ref={isActive ? sidebarItemRef : null}
                  className={`${styles.sidebarItem} ${isActive ? styles.sidebarActive : ''} ${styles[`sidebarStatus_${status}`]}`}
                  onClick={() => setCurrentIdx(idx)}
                >
                  <span className={styles.sidebarIndex}>{idx + 1}</span>
                  <span className={styles.sidebarTitle}>
                    {item.title?.length > 42 ? item.title.slice(0, 42) + '…' : item.title}
                  </span>
                  <span className={`${styles.sidebarIcon} ${styles[`icon_${status}`]}`}>
                    {statusIcon(item)}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* ── Main panel ── */}
          <main className={styles.main}>
            {current && (
              <>
                <div className={styles.itemNav}>
                  <button
                    className={styles.itemNavBtn}
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx(i => i - 1)}
                  >
                    ← Prev
                  </button>
                  <div className={styles.itemRefBlock}>
                    <span className={styles.itemRefNum}>{currentIdx + 1}</span>
                    <span className={styles.itemRefOf}>/ {items.length}</span>
                  </div>
                  <button
                    className={styles.itemNavBtn}
                    disabled={currentIdx === items.length - 1}
                    onClick={() => setCurrentIdx(i => i + 1)}
                  >
                    Next →
                  </button>
                </div>

                <div className={styles.itemMeta}>
                  <span className={styles.itemCat}>{CATEGORY_LABELS[current.category] ?? current.category}</span>
                </div>
                <h2 className={styles.itemTitle}>{current.title} <HelpDot k="run_meeting.item" placement="bottom" /></h2>

                {DECISION_CATEGORIES.has(current.category) && (
                  <span className={styles.decisionRequired}>Decision required</span>
                )}

                <DecisionForm
                  key={current.id}
                  item={current}
                  meetingId={id}
                  canEdit={canEdit}
                  userRole={user?.role}
                  onSaved={handleSaved}
                />

                {currentIdx === items.length - 1 && (
                  <div className={styles.finishBlock}>
                    <button
                      className={styles.btnFinish}
                      onClick={() => navigate(`/meetings/${id}`)}
                    >
                      Finish meeting →
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}

      {/* ── Bottom navigation ── */}
      {items.length > 0 && (
        <div className={styles.nav}>
          <button
            className={styles.btnNav}
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx(i => i - 1)}
          >
            ← Previous
          </button>
          <span className={styles.navDots}>
            {items.map((_, idx) => (
              <span
                key={idx}
                className={`${styles.navDot} ${idx === currentIdx ? styles.navDotActive : ''} ${styles[`navDot_${itemStatus(items[idx])}`]}`}
                onClick={() => setCurrentIdx(idx)}
              />
            ))}
          </span>
          <button
            className={styles.btnNav}
            disabled={currentIdx === items.length - 1}
            onClick={() => setCurrentIdx(i => i + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
