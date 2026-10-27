// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getSecurityActionDetail, acceptAction, updateActionProgress, completeActionItem,
  acceptSubjectAction, completeSubjectAction,
} from '../api';
import { useAuth }        from '../context/AuthContext';
import { Shell }          from '../components/Shell';
import { BackButton }     from '../components/BackButton';
import { ReadOnlyBadge }  from '../components/ReadOnlyBadge';
import { HelpDot }        from '../components/HelpDot';
import { StatusPill }      from '../components/StatusPill';
import { ChipSelector }    from '../components/CiaTable';
import { scoreLevel }      from '../utils/riskColors';
import { mayCompleteItem } from '../utils/itemCompletion';
import { buildNarrative } from '../utils/actionNarrative';
import { collapse, expand } from '../utils/singleProbability';
import styles from './ActionDetailPage.module.css';

const LEVEL_CLASS = {
  critical: styles.levelCritical,
  high:     styles.levelHigh,
  medium:   styles.levelMedium,
  low:      styles.levelLow,
};

// An action that is not about a risk (v133/v134): what it is about, where that
// lives, and which finding raised it.
const SUBJECT_LABEL = {
  asset: 'Information asset', system: 'System', service: 'Business service',
  control: 'Control objective', component: 'Policy or document', organisation: 'The organisation',
  supplier_relationship: 'Supplier relationship',
};
const SUBJECT_PATH = { asset: '/assets', system: '/systems', service: '/services', control: '/controls', component: '/components' };
const ORIGIN_TEXT = {
  rating_incomplete:
    'This information asset is not rated against every mandatory impact table. Until it is, its '
    + 'impact — and every risk score on the systems holding it — can only be understated. The action '
    + 'cannot be completed until the asset is fully rated; it closes on the fact, not on a click.',
  supplier_assurance:
    'This supplier relationship is expected to meet objectives that no current assurance report or '
    + 'contract terms cover. The action cannot be completed until evidence covering every one is recorded '
    + 'on the relationship; it closes on the fact, not on a click.',
  document_review:
    'This published document is past its review date, so it reads as Under review on every system that '
    + 'relies on it. The action cannot be completed until a new review date is recorded; it closes on '
    + 'the fact, not on a click.',
  component_record:
    'This system’s controls need components that exist on each system, and some are not recorded on it. '
    + 'Until each is recorded with its state, those controls read as incomplete on every risk here. The '
    + 'action cannot be completed until the record is complete; it closes on the fact, not on a click.',
};

const CHANGE_KIND_LABEL = {
  control_add: 'Add control', control_improve: 'Improve control',
  component_add: 'Add component', component_improve: 'Improve component',
};

// The audit narrative — what was decided, by whom, on what grounds, and what
// happened. Entirely derived from the payload (utils/actionNarrative.js); the
// material was already captured and merely never shown.
function ActionNarrative({ action }) {
  const n = buildNarrative(action);
  if (!n) return null;
  // An action about something other than a risk has no items: it is about its
  // subject, and "0 of 0 items" would misdescribe it.
  const isSubject = !!action.subject_type && action.subject_type !== 'risk';

  return (
    <div className={styles.card}>
      <h2 className={styles.sectionTitle}>Record of this action <HelpDot k="action_detail.record" placement="bottom" /></h2>
      <p className={styles.narrIntro}>
        A plain-language record of what was decided and what has happened since,
        for review and for audit.
      </p>

      <p className={styles.narrPara}>
        <strong>{n.summary.title}</strong> is <strong>{String(n.summary.status).replace(/_/g, ' ')}</strong>
        {isSubject ? '.' : <>
          , with {n.summary.itemsDone} of {n.summary.itemsTotal} item
          {n.summary.itemsTotal === 1 ? '' : 's'} complete
          {n.summary.itemsWithdrawn > 0 && <>, and {n.summary.itemsWithdrawn} withdrawn</>}.
        </>}
        {n.summary.owner && <> Overall responsibility for completion rests with <strong>{n.summary.owner}</strong>.</>}
        {n.summary.accepted
          ? <> It was accepted by <strong>{n.summary.accepted.by}</strong> on {n.summary.accepted.on},
              {isSubject ? ' which committed its owner to it.' : ' which froze its items, owners and targets.'}</>
          : isSubject
            ? <> It has not yet been accepted.</>
            : <> It has not yet been accepted, so its items, owners and targets can still change.</>}
        {n.summary.targetDate && <> The agreed completion date is {n.summary.targetDate}.</>}
      </p>

      {n.risks.length > 0 && (
        <>
          <h3 className={styles.narrHead}>Why it exists <HelpDot k="action_detail.record_why" placement="bottom" /></h3>
          <ul className={styles.narrList}>
            {n.risks.map(r => (
              <li key={r.id}>
                {r.headline}.{' '}
                {r.baseline
                  ? <>Scored <strong>{r.baseline}</strong> when the action was accepted; it stands at <strong>{r.now}</strong> today.</>
                  : <>It stands at <strong>{r.now}</strong> today; no baseline was recorded at acceptance.</>}
              </li>
            ))}
          </ul>
        </>
      )}

      {isSubject ? null : <>
      <h3 className={styles.narrHead}>What it changes <HelpDot k="action_detail.record_changes" placement="bottom" /></h3>
      {n.items.length === 0 ? (
        <p className={styles.narrPara}>No items are recorded against this action.</p>
      ) : (
        <ol className={styles.narrItems}>
          {n.items.map(i => (
            <li key={i.id} className={styles.narrItem}>
              <span className={styles.narrItemHead}>{i.headline}</span>
              <span className={styles.narrItemLine}>
                Responsible: <strong>{i.responsible || 'not named — falls to the system owner'}</strong>
                {i.target && <> · planned residual <strong>{i.target}</strong></>}
              </span>
              {i.rationale && (
                <span className={styles.narrItemLine}>Rationale given: “{i.rationale}”</span>
              )}
              {i.notes.length > 0 && (
                <ul className={styles.narrNotes}>
                  {i.notes.map(n => (
                    <li key={n.id}>
                      “{n.text}” — <strong>{n.by}</strong>{n.on ? `, ${n.on}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {i.withdrawn ? (
                <span className={styles.narrItemWithdrawn}>
                  Withdrawn — planned, then judged unnecessary. It remains on the record
                  so the decision is visible; see the note below for the reason.
                </span>
              ) : i.done ? (
                <span className={styles.narrItemDone}>
                  Completed by <strong>{i.completion.by}</strong>
                  {i.completion.on ? ` on ${i.completion.on}` : ''}
                  {i.confirmed && <> · residual confirmed at <strong>{i.confirmed}</strong>
                    {i.target && i.confirmed !== i.target && <> (the plan assumed {i.target})</>}</>}.
                </span>
              ) : (
                <span className={styles.narrItemOpen}>Not yet complete.</span>
              )}
            </li>
          ))}
        </ol>
      )}
      </>}

      {n.notes.length > 0 && (
        <>
          <h3 className={styles.narrHead}>Progress recorded against the action <HelpDot k="action_detail.record_progress" placement="bottom" /></h3>
          <ul className={styles.narrNotes}>
            {n.notes.map(x => (
              <li key={x.id}>
                “{x.text}” — <strong>{x.by}</strong>{x.on ? `, ${x.on}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {n.gaps.length > 0 && (
        <>
          <h3 className={styles.narrHead}>What this record does not say <HelpDot k="action_detail.record_gaps" placement="bottom" /></h3>
          <ul className={styles.narrGaps}>
            {n.gaps.map(g => <li key={g}>{g}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

// Add a progress note against one remediation item. Notes append (0116), so this
// is "add", never "edit" — the previous note stays on the record. The count is
// shown so a reader can see dialogue exists without opening it; the text itself
// is rendered in the narrative below, in time order.
function ItemNoteCell({ actionId, item, onSaved }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  const count = (item.notes ?? []).length;

  async function save() {
    const note = text.trim();
    if (!note) return;
    setBusy(true); setErr('');
    try {
      await updateActionProgress(actionId, note, item.id);
      setText(''); setOpen(false);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not save the note.');
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button className={styles.itemActGhost} onClick={() => setOpen(true)}
        title={count ? `${count} note${count === 1 ? '' : 's'} recorded — add another` : 'Record progress on this item'}>
        + note{count ? ` (${count})` : ''}
      </button>
    );
  }

  return (
    <span className={styles.itemConfirm}>
      <input
        className={styles.itemNoteInput}
        autoFocus
        placeholder="What has happened?"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}
        aria-label={`Progress note for ${item.label}`}
      />
      <button className={styles.itemActPrimary} disabled={busy || !text.trim()} onClick={save}>
        {busy ? 'Saving…' : 'Add'}
      </button>
      <button className={styles.itemActGhost} disabled={busy}
        onClick={() => { setOpen(false); setErr(''); }}>Cancel</button>
      {err && <span className={styles.itemErr}>{err}</span>}
    </span>
  );
}

// One item's completion affordance, mirroring the risk page's ActionItemRow.
// A component item just flips operational; a control item also writes its
// confirmed residual probability, pre-filled from the item's target but
// editable — that number is what the MIN-over-deployed derivation consumes to
// drop the risk, so it must be confirmed by whoever does the work rather than
// assumed from the plan.
function ItemCompleteCell({ item, riskId, onDone, threatInherent }) {
  const [confirming, setConfirming] = useState(false);
  // One figure, not three (owner, 2026-09-18) — expanded across C/I/A on submit,
  // each dimension capped by the threat's own inherent ceiling.
  const [resid, setResid] = useState(collapse(item.target, ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  async function complete(body) {
    setBusy(true); setErr('');
    try {
      await completeActionItem(riskId, item.id, body);
      onDone();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not complete this item.');
      setBusy(false);
    }
  }

  if (err && !confirming) {
    return <span className={styles.itemErr}>{err}</span>;
  }

  if (item.element_type === 'component') {
    return (
      <button className={styles.itemAct} disabled={busy} onClick={() => complete({})}>
        {busy ? 'Saving…' : 'Mark operational'}
      </button>
    );
  }

  if (!confirming) {
    return (
      <button className={styles.itemAct} onClick={() => setConfirming(true)}>
        Complete…
      </button>
    );
  }

  return (
    <span className={styles.itemConfirm}>
      <span title="The attack probability now this control is working. One figure — applied across confidentiality, integrity and availability, each capped by the threat's own ceiling.">
        probability now it is working
      </span>
      <ChipSelector
        value={resid}
        wordScale="probability"
        onChange={setResid}
      />
      <button
        className={styles.itemActPrimary}
        disabled={busy || !(resid >= 1 && resid <= 5)}
        onClick={() => complete(expand(resid, threatInherent))}
      >
        {busy ? 'Saving…' : 'Confirm'}
      </button>
      <button className={styles.itemActGhost} disabled={busy}
        onClick={() => { setConfirming(false); setErr(''); }}>
        Cancel
      </button>
      {err && <span className={styles.itemErr}>{err}</span>}
    </span>
  );
}

function Field({ label, children }) {
  if (!children) return null;
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{children}</span>
    </div>
  );
}

export function ActionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasCapability } = useAuth();
  const [action,  setAction]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Lifecycle-action state
  const [busy,        setBusy]        = useState(false);
  const [actionError, setActionError] = useState('');

  // Progress-notes editor state
  const [progressEditing, setProgressEditing] = useState(false);
  const [progressDraft,   setProgressDraft]   = useState('');
  const [progressBusy,    setProgressBusy]     = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const d = await getSecurityActionDetail(id);
      setAction(d);
      setError('');
    } catch {
      setError('Could not load action details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Acceptance is risk-scoped; any linked risk validates the link.
  const riskId  = action?.risks?.[0]?.risk_id ?? null;
  const isOwner = action?.owner_id === user?.id;
  const role    = user?.role;
  const status  = action?.status;
  const items   = action?.items ?? [];
  const itemsDone = items.filter(i => i.status === 'completed').length;

  // An action about something other than a risk has no items and no risk: it is
  // accepted and completed as a whole (POST /actions/:id/accept | /complete).
  const isSubject = !!action?.subject_type && action.subject_type !== 'risk';

  const canAccept = status === 'proposed' && hasCapability('actions.adopt')
                    && (isSubject || (riskId && items.length > 0));
  const canCompleteSubject = isSubject && ['planned', 'in_progress'].includes(status)
    && (isOwner || ['ciso', 'risk_analyst', 'admin'].includes(user?.role));

  // Items are completed from HERE as well as from the risk — this page used to
  // link across instead, which left the system owner (often the only person
  // named Responsible on the items) with no affordance anywhere in the product.
  // Evaluated per item, because the system owner is a property of the item's
  // system and one action may span several.
  const mayComplete = (item) => mayCompleteItem({
    actionStatus: status,
    itemStatus: item.status,
    role,
    userId: user?.id,
    systemOwnerUserId: item.system?.owner_user_id,
  });

  // Completion is recorded against the risk that shares the item's system, so a
  // control's confirmed residual lands on the right risk when an action spans
  // several. Falls back to the first linked risk for a single-risk action.
  const riskIdForItem = (item) =>
    action?.risks?.find(r => r.system_id === item.system?.id)?.risk_id ?? riskId;

  // Each risk carries its threat's inherent probability — the per-dimension
  // ceiling the single confirmed figure is expanded under.
  const inherentFor = (item) => {
    const r = action?.risks?.find(x => x.system_id === item.system?.id) ?? action?.risks?.[0];
    return r ? { c: r.inherent_c, i: r.inherent_i, a: r.inherent_a } : undefined;
  };

  // "Informed" audience: can read (it affects a risk in their area) but holds no
  // action-write capability at all — show the view-only cue. Someone who may
  // complete an item is not informed-only, whatever capabilities they hold.
  const canCompleteAny = items.some(mayComplete) || canCompleteSubject;
  const informedOnly = !canCompleteAny
    && !hasCapability('actions.complete') && !hasCapability('actions.adopt');

  async function handleAccept() {
    setBusy(true);
    setActionError('');
    try {
      if (isSubject) await acceptSubjectAction(id);
      else await acceptAction(riskId, id);
      await load(false);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Acceptance failed.');
    } finally {
      setBusy(false);
    }
  }

  // The server refuses while the finding still holds, naming what is missing.
  async function handleCompleteSubject() {
    setBusy(true);
    setActionError('');
    try {
      await completeSubjectAction(id);
      await load(false);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Could not complete the action.');
    } finally {
      setBusy(false);
    }
  }

  // Progress notes: the owner (or CISO/analyst/admin) can log progress on a
  // non-terminal action — mirrors PATCH /actions/:id/progress.
  const canLogProgress = action
    && (isOwner || ['ciso', 'risk_analyst', 'admin'].includes(role))
    && !['cancelled', 'completed'].includes(status);

  function openProgressEditor() {
    setProgressDraft(action?.progress_notes ?? '');
    setProgressEditing(true);
  }

  async function saveProgress() {
    setProgressBusy(true);
    setActionError('');
    try {
      await updateActionProgress(id, progressDraft);
      setProgressEditing(false);
      await load(false);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Could not save progress.');
    } finally {
      setProgressBusy(false);
    }
  }

  const fmtDate = d => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  // 'YYYY-MM-DD' → 'D Mon YYYY' without a Date() timezone shift.
  const fmtYmd = ymd => {
    if (!ymd) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />

        {loading && <div className={styles.loadingBar} aria-label="Loading…" />}
        {error   && <p className={styles.error}>{error}</p>}

        {!loading && action && (
          <>
            {/* ── Header ── */}
            <div className={styles.header}>
              <div className={styles.headerMain}>
                <h1 className={styles.title}>{action.title} <HelpDot k="action_detail.title" placement="bottom" /></h1>
                <div className={styles.headerMeta}>
                  <StatusPill status={action.status} isOverdue={action.is_overdue} />
                  {items.length > 0 && (
                    <span className={styles.typeTag}>
                      {itemsDone}/{items.length} items done
                    </span>
                  )}
                  {action.requires_siro_signoff && (
                    <span className={styles.siroTag}>
                      {action.siro_signoff_at ? '✓ SIRO signed off' : 'SIRO sign-off required'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Lifecycle actions (concerned parties only) ── */}
            {canAccept ? (
              <div className={styles.lifecycleBar}>
                <button className={styles.btnAdopt} disabled={busy} onClick={handleAccept}>
                  {busy ? 'Working…'
                    : isSubject ? 'Accept action'
                    : `Accept ${items.length} item${items.length !== 1 ? 's' : ''}`}
                </button>
                {actionError && <span className={styles.actionError}>{actionError}</span>}
              </div>
            ) : canCompleteSubject ? (
              <div className={styles.lifecycleBar}>
                <button className={styles.btnAdopt} disabled={busy} onClick={handleCompleteSubject}>
                  {busy ? 'Working…' : 'Mark complete'}
                </button>
                {actionError && <span className={styles.actionError}>{actionError}</span>}
              </div>
            ) : (!riskId && !isSubject && !informedOnly) ? (
              // Owner / actor, but the action has no active linked risk — every
              // lifecycle step is recorded against a risk, so it can't be progressed.
              <div className={styles.unlinkedNotice}>
                <strong>Not linked to an active risk.</strong> This action isn&rsquo;t attached to a
                risk, so it can&rsquo;t be accepted or progressed — each step is recorded against
                the risk it mitigates. Link it to a risk to progress it.
              </div>
            ) : informedOnly ? (
              <ReadOnlyBadge reason="You can view this action because it affects a risk in your area. Only those responsible for it can make changes." />
            ) : null}

            {/* ── Update-required prompt: a meeting is scheduled, refresh progress ── */}
            {action.needs_update && (
              <div className={`${styles.verifyNotice} ${styles.updateNotice}`}>
                <strong>Progress update required.</strong>{' '}
                A Security Working Group meeting{action.update_required_meeting_date
                  ? ` is scheduled for ${fmtYmd(action.update_required_meeting_date)}`
                  : ' is scheduled'}, so this action&rsquo;s progress needs refreshing.{' '}
                {canLogProgress
                  ? 'Log a progress note below to clear this flag.'
                  : 'The action owner needs to log progress.'}
              </div>
            )}

            {/* ── Where the action stands ── */}
            {action.status === 'proposed' && (
              <div className={`${styles.verifyNotice} ${styles.verifyPending}`}>
                <strong>Awaiting acceptance.</strong>{' '}
                {isSubject
                  ? <>The SWG has yet to accept this action and its owner.</>
                  : <>The SWG has yet to accept this action. Accepting freezes its items, owners and
                    targets, and records the risk&rsquo;s current scores as the baseline to measure
                    progress against.</>}
              </div>
            )}
            {action.status === 'completed' && (
              <div className={`${styles.verifyNotice} ${styles.verifyPass}`}>
                <strong>Complete.</strong>{' '}
                {isSubject ? <>
                  The finding it answered no longer holds
                  {action.completed_at ? ` — finished ${fmtDate(action.completed_at)}` : ''}.
                </> : <>
                  Every remediation item has been delivered
                  {action.completed_at ? ` — finished ${fmtDate(action.completed_at)}` : ''}. Each
                  item set its control or component operational on its system as it landed, so the
                  risk score already reflects this work.
                </>}
              </div>
            )}

            {/* ── Summary fields ── */}
            <div className={styles.card}>
              <div className={styles.fieldGrid}>
                <Field label="Owner">{action.owner_name}</Field>
                <Field label="Plan">{action.plan_title}</Field>
                <Field label="Target date">
                  {action.is_overdue
                    ? <span className={styles.overdue}>{fmtDate(action.target_date)} — overdue</span>
                    : fmtDate(action.target_date)}
                </Field>
                {action.completed_at && (
                  <Field label="Completed">{fmtDate(action.completed_at)}</Field>
                )}
              </div>

              {action.description && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Description <HelpDot k="action_detail.description" placement="bottom" /></h2>
                  <p className={styles.body}>{action.description}</p>
                </div>
              )}

              {(action.progress_notes || canLogProgress) && (
                <div className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Progress &amp; completion notes <HelpDot k="action_detail.progress_notes" placement="bottom" /></h2>
                    {canLogProgress && !progressEditing && (
                      <button className={styles.linkBtn} onClick={openProgressEditor}>
                        {action.progress_notes ? 'Update' : 'Add a note'}
                      </button>
                    )}
                  </div>
                  {!progressEditing ? (
                    action.progress_notes
                      ? <p className={styles.body}>{action.progress_notes}</p>
                      : <p className={styles.bodyMuted}>No progress notes logged yet.</p>
                  ) : (
                    <div className={styles.progressEditor}>
                      <textarea
                        className={styles.progressTextarea}
                        rows={4}
                        value={progressDraft}
                        onChange={e => setProgressDraft(e.target.value)}
                        placeholder="Record progress or completion comments…"
                        disabled={progressBusy}
                      />
                      <div className={styles.progressButtons}>
                        <button className={styles.btnStart} disabled={progressBusy} onClick={saveProgress}>
                          {progressBusy ? 'Saving…' : 'Save'}
                        </button>
                        <button className={styles.btnCancelGhost} disabled={progressBusy}
                          onClick={() => setProgressEditing(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── What it is about, when that is not a risk ── */}
            {isSubject && (
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>About <HelpDot k="action_detail.about" placement="bottom" /></h2>
                <p className={styles.narrPara}>
                  <strong>{SUBJECT_LABEL[action.subject_type] || action.subject_type}:</strong>{' '}
                  {action.subject_type === 'supplier_relationship' && action.subject_parent_id ? (
                    <button className={styles.linkBtn}
                      onClick={() => navigate(`/suppliers/${action.subject_parent_id}`)}>
                      {action.subject_name || 'Open'}
                    </button>
                  ) : SUBJECT_PATH[action.subject_type] && action.subject_id ? (
                    <button className={styles.linkBtn}
                      onClick={() => navigate(`${SUBJECT_PATH[action.subject_type]}/${action.subject_id}`)}>
                      {action.subject_name || 'Open'}
                    </button>
                  ) : (action.subject_name || '')}
                </p>
                {ORIGIN_TEXT[action.origin] && <p className={styles.narrPara}>{ORIGIN_TEXT[action.origin]}</p>}
              </div>
            )}

            {/* ── Linked risks ── */}
            {action.risks && action.risks.length > 0 && (
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>Linked risks <HelpDot k="action_detail.linked_risks" placement="bottom" /></h2>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Risk <HelpDot k="action_detail.col.risk" placement="bottom" /></th>
                      <th className={styles.th}>System <HelpDot k="col.system" placement="bottom" /></th>
                      <th className={styles.th}>Department <HelpDot k="col.department" placement="bottom" /></th>
                      <th className={styles.th}>Level <HelpDot k="action_detail.col.level" placement="bottom" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {action.risks.map(r => (
                      <tr
                        key={r.risk_id}
                        className={styles.riskRow}
                        onClick={() => navigate(`/risks/${r.risk_id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && navigate(`/risks/${r.risk_id}`)}
                      >
                        <td className={styles.td}>{r.threat_name}</td>
                        <td className={styles.td}>{r.system_name}</td>
                        <td className={styles.td}>{r.department || '—'}</td>
                        <td className={styles.td}>
                          <span className={`${styles.levelPill} ${LEVEL_CLASS[scoreLevel(r.risk_score)] ?? ''}`}>
                            {scoreLevel(r.risk_score)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Remediation items ── */}
            {items.length > 0 && (
              <div className={styles.card}>
                <h2 className={styles.sectionTitle}>
                  Remediation items ({itemsDone}/{items.length} complete) <HelpDot k="action_detail.items" placement="bottom" />
                </h2>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Ref <HelpDot k="action_detail.col.ref" placement="bottom" /></th>
                      <th className={styles.th}>Element <HelpDot k="action_detail.col.element" placement="bottom" /></th>
                      <th className={styles.th}>Change <HelpDot k="action_detail.col.change" placement="bottom" /></th>
                      <th className={styles.th}>System <HelpDot k="action_detail.col.system" placement="bottom" /></th>
                      <th className={styles.th}>Responsible <HelpDot k="action_detail.col.responsible" placement="bottom" /></th>
                      <th className={styles.th}>Target <HelpDot k="action_detail.col.target" placement="bottom" /></th>
                      <th className={styles.th}>Status <HelpDot k="action_detail.col.status" placement="bottom" /></th>
                      <th className={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} className={styles.tr}>
                        <td className={`${styles.td} ${styles.tdMono}`}>{it.framework_ref || '—'}</td>
                        <td className={styles.td}>{it.label}</td>
                        <td className={styles.td}>{CHANGE_KIND_LABEL[it.change_kind] ?? it.change_kind}</td>
                        <td className={styles.td}>{it.system?.name ?? '—'}</td>
                        <td className={styles.td}>{it.owner?.name ?? '—'}</td>
                        <td className={`${styles.td} ${styles.tdMono}`}>
                          {it.target && it.target.c != null
                            ? `${it.target.c}/${it.target.i}/${it.target.a}`
                            : '—'}
                        </td>
                        <td className={styles.td}>
                          {it.status === 'completed'
                            ? <span className={styles.itemDone}>✓ {it.completed_by?.name ?? 'done'}</span>
                            : it.status}
                        </td>
                        <td className={styles.td}>
                          <span className={styles.itemActions}>
                            {mayComplete(it) && riskIdForItem(it) && (
                              <ItemCompleteCell
                                item={it}
                                riskId={riskIdForItem(it)}
                                threatInherent={inherentFor(it)}
                                onDone={() => load(false)}
                              />
                            )}
                            {canLogProgress && (
                              <ItemNoteCell actionId={id} item={it} onSaved={() => load(false)} />
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {riskId && itemsDone < items.length && action.status !== 'proposed'
                  && !canCompleteAny && (
                  <p className={styles.bodyMuted}>
                    Outstanding items are completed by the CISO, a risk analyst, or the owner of the
                    item&rsquo;s system.{' '}
                    <button className={styles.linkBtn} onClick={() => navigate(`/risks/${riskId}`)}>
                      Open the risk →
                    </button>
                  </p>
                )}
                {action.status === 'proposed' && items.length > 0 && (
                  <p className={styles.bodyMuted}>
                    Items can be completed once the action is accepted.
                  </p>
                )}
              </div>
            )}

            {!isSubject && action.risks?.length === 0 && items.length === 0 && (
              <p className={styles.noLinks}>
                No linked risks or remediation items recorded against this action.
              </p>
            )}

            {/* Last, deliberately: the narrative summarises everything above it. */}
            <ActionNarrative action={action} />
          </>
        )}
      </div>
    </Shell>
  );
}

