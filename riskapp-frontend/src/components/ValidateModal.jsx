// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * components/ValidateModal.jsx
 *
 * Modal for CISO to validate or return a single risk.
 *
 * Props:
 *   risk      — risk object from v_pending_risks
 *   onClose   — called when the modal should close (no action taken)
 *   onSuccess — called after a successful validate/return action
 */
import { useState } from 'react';
import { validateRisk } from '../api';
import styles from './ValidateModal.module.css';
import { Modal } from './Modal';

export function ValidateModal({ risk, onClose, onSuccess }) {
  const [action, setAction] = useState('validate'); // 'validate' | 'return'
  const [notes,  setNotes]  = useState('');
  const [error,  setError]  = useState('');
  const [busy,   setBusy]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (action === 'return' && !notes.trim()) {
      setError('Notes are required when returning a risk.');
      return;
    }

    setBusy(true);
    try {
      await validateRisk(risk.risk_id, {
        action,
        notes: action === 'return' ? notes.trim() : undefined,
      });
      onSuccess(risk.risk_id, action);
    } catch (err) {
      const data = err.response?.data;
      setError(data?.error || 'Action failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const statusColor = risk.validation_status === 'returned' ? 'var(--red)' : 'var(--amber)';

  return (
    <Modal label="Validate risk" onClose={onClose} busy={busy}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.modalLabel}>RISK VALIDATION</span>
            <h2 className={styles.riskId}>{risk.risk_id}</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </div>

        {/* Risk detail summary */}
        <div className={styles.summary}>
          <Row label="Threat"     value={risk.threat_name} />
          <Row label="Category"   value={risk.threat_category} />
          <Row label="Asset"      value={`${risk.asset_name} — ${risk.system_name}`} />
          <Row label="Department" value={risk.department} />
          <Row label="Status"     value={risk.validation_status} valueStyle={{ color: statusColor, textTransform: 'capitalize' }} />
          {risk.identified_by && (
            <Row label="Identified by" value={risk.identified_by} />
          )}
        </div>

        {/* Rationale */}
        <div className={styles.rationaleBlock}>
          <span className={styles.fieldLabel}>Rationale</span>
          <p className={styles.rationale}>{risk.rationale || '—'}</p>
        </div>

        {/* Return notes from previous action */}
        {risk.validation_notes && (
          <div className={styles.prevNotesBlock}>
            <span className={styles.fieldLabel}>Previous return notes</span>
            <p className={styles.prevNotes}>{risk.validation_notes}</p>
          </div>
        )}

        {/* Action form */}
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.actionToggle}>
            <ActionBtn
              label="✓  Validate"
              active={action === 'validate'}
              variant="validate"
              onClick={() => setAction('validate')}
              disabled={busy}
            />
            <ActionBtn
              label="↩  Return"
              active={action === 'return'}
              variant="return"
              onClick={() => setAction('return')}
              disabled={busy}
            />
          </div>

          {action === 'return' && (
            <div className={styles.notesField}>
              <label className={styles.fieldLabel} htmlFor="return-notes">
                Return notes <span className={styles.required}>*</span>
              </label>
              <textarea
                id="return-notes"
                className={styles.textarea}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Explain what needs to be addressed before re-submission…"
                rows={4}
                disabled={busy}
                autoFocus
              />
            </div>
          )}

          {error && (
            <p className={styles.error} role="alert">{error}</p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${styles.submitBtn} ${styles[action]}`}
              disabled={busy}
            >
              {busy
                ? 'Submitting…'
                : action === 'validate'
                ? 'Confirm validation'
                : 'Return risk'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function Row({ label, value, valueStyle }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-muted)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        minWidth: 90,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--text-secondary)',
        ...valueStyle,
      }}>
        {value || '—'}
      </span>
    </div>
  );
}

function ActionBtn({ label, active, variant, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`${styles.actionToggleBtn} ${active ? styles[`active_${variant}`] : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
