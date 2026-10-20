// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// An assurance finding on the page of the thing it is about. The finding is
// derived, so this appears only while it holds. It has one answer or none: an
// open action (linked), an acceptance until a date (v136, with its reason), or
// neither — in which case it offers to raise an action (findings.act, own
// department for IAM/IAO) or to accept it (exceptions.accept).
//
// kind: 'rating-incomplete' (an asset, v134) | 'component-record' (a system, v138).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { seatCanWrite } from '../utils/seatScope';
import { componentRecordReasonItems } from '../utils/componentRecord';
import { FindingReason } from './FindingReason';
import { raiseFindingAction, revokeFindingAcceptance } from '../api';
import { FindingAcceptForm } from './FindingAcceptForm';
import styles from './RatingFindingBanner.module.css';

const STATUS_WORD = {
  proposed: 'awaiting acceptance', planned: 'accepted', in_progress: 'in progress',
  deferred: 'deferred',
};

export function FindingBanner({ kind, subjectId, departmentId, title, detail, action, accepted, onChanged }) {
  const { user, hasCapability, departmentIsolation } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  const [accepting, setAccepting] = useState(false);

  const canAccept = hasCapability('exceptions.accept');
  const canRaise = hasCapability('findings.act')
    && seatCanWrite(user, departmentIsolation, departmentId);

  async function raise() {
    setBusy(true); setErr('');
    try { await raiseFindingAction(kind, subjectId); await onChanged(); }
    catch (e) { setErr(e.response?.data?.error || 'Could not raise the action'); }
    finally { setBusy(false); }
  }

  async function revoke() {
    setBusy(true); setErr('');
    try { await revokeFindingAcceptance(accepted.id); await onChanged(); }
    catch (e) { setErr(e.response?.data?.error || 'Could not revoke the acceptance'); }
    finally { setBusy(false); }
  }

  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className={styles.banner} role="status">
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.detail}>{detail}</div>
        {accepted && (
          <div className={styles.accepted}>
            Accepted until <strong>{fmt(accepted.expires_at)}</strong>
            {accepted.accepted_by_name && <> by {accepted.accepted_by_name}</>}: &ldquo;{accepted.justification}&rdquo;
          </div>
        )}
        {accepting && (
          <FindingAcceptForm kind={kind} subjectId={subjectId}
            onDone={async () => { setAccepting(false); await onChanged(); }}
            onCancel={() => setAccepting(false)} />
        )}
        {err && <div className={styles.error}>{err}</div>}
      </div>
      <div className={styles.side}>
        {accepted ? (
          hasCapability('exceptions.revoke')
            ? <button className={styles.btnGhost} disabled={busy} onClick={revoke}>Revoke acceptance</button>
            : <span className={styles.muted}>Accepted</span>
        ) : action ? (
          <Link to={`/actions/${action.id}`} className={styles.link}>
            Action {STATUS_WORD[action.status] || action.status} →
          </Link>
        ) : (canRaise || canAccept) && !accepting ? (
          <div className={styles.buttons}>
            {canRaise && (
              <button className={styles.btn} disabled={busy} onClick={raise}>
                {busy ? 'Raising…' : 'Raise an action'}
              </button>
            )}
            {canAccept && (
              <button className={styles.btnGhost} disabled={busy} onClick={() => setAccepting(true)}>Accept…</button>
            )}
          </div>
        ) : !accepting ? (
          <span className={styles.muted}>No action raised</span>
        ) : null}
      </div>
    </div>
  );
}

// v134 — an information asset not rated against every mandatory impact table.
export function RatingFindingBanner({ asset, onChanged }) {
  const f = asset?.rating_finding;
  if (!f) return null;
  const n = f.missing_count;
  return (
    <FindingBanner kind="rating-incomplete" subjectId={asset.id} departmentId={asset.department_id}
      action={asset.rating_action} accepted={asset.rating_exception} onChanged={onChanged}
      title={<>{f.band === 'never_rated' ? 'Not yet rated' : 'Not fully rated'} — {n} mandatory impact table{n === 1 ? '' : 's'} missing</>}
      detail={<>{f.missing_table_names.join(', ')}. Until {n === 1 ? 'it is' : 'they are'} rated,
        this asset&rsquo;s impact — and every risk score on the systems holding it — can only be understated.</>} />
  );
}

// v140 — a published policy, standard or procedure past its review date. The
// document has no department, so only organisation-wide roles raise the action.
export function DocumentReviewFindingBanner({ component, onChanged }) {
  if (component?.document_kind === 'guideline') return null;
  // A published document with no review date predates the rule (v141) — it is
  // never flagged by a date, so it is flagged here.
  const noDate = component?.status === 'operational' && !component.document_next_review;
  if (!component?.review_overdue && !noDate) return null;
  const due = component.document_next_review
    ? new Date(`${String(component.document_next_review).slice(0, 10)}T00:00:00`)
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  return (
    <FindingBanner kind="document-review" subjectId={component.id} departmentId={null}
      action={component.review_action} accepted={component.review_exception} onChanged={onChanged}
      title={noDate ? <>Published with no review date</> : <>Overdue for review{due && <> — was due {due}</>}</>}
      detail={noDate
        ? <>A published document must have a review date, or nothing will ever flag it. Record the next review
            date below; the finding closes when you do.</>
        : <>It reads as Under review on every system that relies on it. Review it and record the next
            review date below; the finding closes when you do.</>} />
  );
}

// v138 — a system missing per-system components its own controls need; v148 —
// or what the security architecture asks of it.
export function ComponentRecordFindingBanner({ system, onChanged }) {
  const f = system?.component_finding;
  if (!f) return null;
  const items = componentRecordReasonItems(f);
  const reasons = items;
  return (
    <FindingBanner kind="component-record" subjectId={system.id} departmentId={system.department_id}
      action={f.action} accepted={f.exception} onChanged={onChanged}
      title={<>Record incomplete — {reasons.length === 1 ? <FindingReason item={items[0]} /> : `${reasons.length} things to record or decide`}</>}
      detail={<>
        {reasons.length > 1 && items.map((r, i) => <span key={i}><FindingReason item={r} />. </span>)}
        Until the record is complete, CIRKS cannot say what security this system should have, and the
        controls that depend on what is missing read as incomplete on every risk here.
      </>} />
  );
}
