// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * components/ExceptionFormModal.jsx
 *
 * Modal for creating, renewing, or revoking a risk exception.
 *
 * Modes:
 *   mode="create"  fields blank; submits POST /risks/:id/exceptions
 *   mode="renew"   prefilled from current; submits PATCH .../renew
 *   mode="revoke"  notes-only confirm; submits PATCH .../revoke
 */
import { useState } from 'react';
import {
  createRiskException, renewRiskException, revokeRiskException,
} from '../api';
import styles from './ExceptionFormModal.module.css';
import { Modal } from './Modal';
import { DateField } from './DateField';
import { HelpDot } from './HelpDot';

const CADENCES = [
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual',    label: 'Annual' },
];

function defaultExpiry(cadence = 'quarterly') {
  const d = new Date();
  if (cadence === 'monthly')   d.setMonth(d.getMonth() + 1);
  if (cadence === 'quarterly') d.setMonth(d.getMonth() + 3);
  if (cadence === 'annual')    d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function ExceptionFormModal({ mode, riskId, exception, onClose, onSuccess }) {
  const [cadence,       setCadence]       = useState(exception?.review_cadence || 'quarterly');
  const [expiresAt,     setExpiresAt]     = useState(exception?.expires_at?.slice(0, 10) || defaultExpiry('quarterly'));
  const [justification, setJustification] = useState(exception?.justification || '');
  const [notes,         setNotes]         = useState('');
  const [error,         setError]         = useState('');
  const [busy,          setBusy]          = useState(false);

  function handleCadence(value) {
    setCadence(value);
    if (mode !== 'revoke') setExpiresAt(defaultExpiry(value));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode !== 'revoke') {
      if (!justification.trim()) { setError('Justification is required.'); return; }
      if (!expiresAt)            { setError('Expiry date is required.'); return; }
      const d = new Date(expiresAt);
      if (isNaN(d.getTime()) || d <= new Date()) {
        setError('Expiry date must be in the future.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'create') {
        await createRiskException(riskId, {
          justification: justification.trim(),
          expires_at:    expiresAt,
          review_cadence: cadence,
          notes:          notes.trim() || undefined,
        });
      } else if (mode === 'renew') {
        await renewRiskException(riskId, exception.id, {
          justification: justification.trim(),
          expires_at:    expiresAt,
          review_cadence: cadence,
          notes:          notes.trim() || undefined,
        });
      } else if (mode === 'revoke') {
        await revokeRiskException(riskId, exception.id, {
          notes: notes.trim() || undefined,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed.');
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === 'create' ? 'Create acceptance exception' :
    mode === 'renew'  ? 'Renew exception' :
                        'Revoke exception';

  return (
    <Modal label={heading} onClose={onClose} busy={busy}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.heading}>
            {heading}
            {mode === 'create' && <> <HelpDot k="exception_form.create" placement="bottom" /></>}
            {mode === 'renew' && <> <HelpDot k="exception_form.renew" placement="bottom" /></>}
            {mode === 'revoke' && <> <HelpDot k="exception_form.revoke" placement="bottom" /></>}
          </h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          {mode !== 'revoke' && (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Justification</span>
                <textarea
                  rows={4}
                  className={styles.textarea}
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  placeholder="Why is this risk being accepted? Include compensating factors and constraints."
                  disabled={busy}
                  autoFocus
                />
              </label>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>Review cadence</span>
                  <div className={styles.cadenceGroup}>
                    {CADENCES.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        className={`${styles.cadenceBtn} ${cadence === c.value ? styles.cadenceActive : ''}`}
                        onClick={() => handleCadence(c.value)}
                        disabled={busy}
                      >{c.label}</button>
                    ))}
                  </div>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Expires</span>
                  <DateField
                    className={styles.input}
                    value={expiresAt}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={e => setExpiresAt(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
            </>
          )}

          {mode === 'revoke' && (
            <p className={styles.confirmText}>
              Revoking will end the active acceptance immediately. The risk
              returns to needing a treatment decision. This action is logged.
            </p>
          )}

          <label className={styles.field}>
            <span className={styles.label}>Notes (optional)</span>
            <textarea
              rows={2}
              className={styles.textarea}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={mode === 'revoke' ? 'Reason for revocation…' : 'Any additional context…'}
              disabled={busy}
            />
          </label>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className={`${styles.btnSubmit} ${mode === 'revoke' ? styles.btnDanger : ''}`} disabled={busy}>
              {busy ? 'Saving…' :
                mode === 'create' ? 'Create exception' :
                mode === 'renew'  ? 'Renew exception' :
                                    'Confirm revoke'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
