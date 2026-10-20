// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Accept an assurance finding until a date, for a reason (v136). The same act
// as accepting a risk — exceptions.accept — recorded in the same table, so it
// expires through the same sweep and the finding re-surfaces when it does.
import { useState } from 'react';
import { acceptFinding } from '../api';
import styles from './FindingAcceptForm.module.css';
import { DateField } from './DateField';

const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export function FindingAcceptForm({ kind = 'rating-incomplete', subjectId, assetId, onDone, onCancel }) {
  const id = subjectId ?? assetId;
  const [justification, setJustification] = useState('');
  const [expiresAt, setExpiresAt]         = useState(inDays(90));
  const [cadence, setCadence]             = useState('quarterly');
  const [busy, setBusy]                   = useState(false);
  const [err, setErr]                     = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await acceptFinding(kind, id, { justification, expires_at: expiresAt, review_cadence: cadence });
      await onDone();
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Could not record the acceptance.');
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        <span>Why is this acceptable for now?</span>
        <textarea required rows={2} value={justification} onChange={e => setJustification(e.target.value)} />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Accepted until</span>
          <DateField required min={inDays(1)} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Review</span>
          <select value={cadence} onChange={e => setCadence(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
      </div>
      {err && <div className={styles.err}>{err}</div>}
      <div className={styles.buttons}>
        <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className={styles.btnSave} disabled={busy || !justification.trim()}>
          {busy ? 'Recording…' : 'Accept finding'}
        </button>
      </div>
    </form>
  );
}
