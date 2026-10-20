// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { previewControlWithdrawal, withdrawControlFromUse } from '../api';
import styles from './WithdrawControlDialog.module.css';

// Taking a control out of use (v131). Backing one out used to be a threat
// unlink, a deletion per system and an SoA edit, with no reason recorded and no
// warning that a risk was about to rise — removing ID.RA-09 would have taken one
// risk from 10 to 20, because it was the only judged control holding it down.
//
// So the dialog answers "what would this do?" BEFORE asking for confirmation,
// and the answer comes from the server running the real withdrawal and rolling
// it back — not from a second implementation of the arithmetic.

export default function WithdrawControlDialog({ controlId, title, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [error, setError]     = useState('');
  const [reason, setReason]   = useState('');
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    let live = true;
    previewControlWithdrawal(controlId)
      .then(d => { if (live) setPreview(d); })
      .catch(e => { if (live) setError(e?.response?.data?.error || 'Could not work out what this would do.'); });
    return () => { live = false; };
  }, [controlId]);

  async function confirm() {
    if (!reason.trim()) { setError('Say why it is being withdrawn — the reason is kept with the record.'); return; }
    setBusy(true); setError('');
    try {
      onDone(await withdrawControlFromUse(controlId, reason.trim()));
    } catch (e) {
      setError(e?.response?.data?.error || 'It was not withdrawn. What you typed is still here — try again.');
      setBusy(false);
    }
  }

  const r = preview?.removed;
  const risks = preview?.risks_moved || [];

  return (
    <Modal label={`Withdraw ${title} from use`} onClose={busy ? () => {} : onClose} busy={busy}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Withdraw from use</h2>
        <p className={styles.lede}>{title}</p>

        {error && !preview && <p className={styles.error} role="alert">{error}</p>}
        {!preview && !error && <p className={styles.loading}>Working out what this would do…</p>}

        {preview && (
          <>
            <ul className={styles.effects}>
              <li><strong>{r.systems.length}</strong> system{r.systems.length === 1 ? '' : 's'} it is recorded on
                {r.systems.length > 0 && (
                  <span className={styles.detail}>{r.systems.map(s => `${s.name} (${s.status})`).join(', ')}</span>
                )}
              </li>
              <li><strong>{r.threats.length}</strong> threat link{r.threats.length === 1 ? '' : 's'}
                {r.threats.length > 0 && <span className={styles.detail}>{r.threats.map(t => t.name).join(', ')}</span>}
                <span className={styles.detail}>This is what removes it from the risks it counts on.</span>
              </li>
              <li><strong>{r.judged_residuals}</strong> judged residual{r.judged_residuals === 1 ? '' : 's'}
                <span className={styles.detail}>
                  Assessments of what it reduces a risk to. Left behind, they come back if it is ever
                  linked to that threat again.
                </span>
              </li>
              {r.open_items > 0 && (
                <li><strong>{r.open_items}</strong> planned item{r.open_items === 1 ? '' : 's'} withdrawn
                  <span className={styles.detail}>Kept on the record with a note saying why.</span></li>
              )}
            </ul>

            {risks.length > 0 ? (
              <div className={styles.risks}>
                <h3 className={styles.risksTitle}>
                  {risks.length} risk{risks.length === 1 ? '' : 's'} rise{risks.length === 1 ? 's' : ''} when it goes
                </h3>
                <p className={styles.risksNote}>
                  This control is holding {risks.length === 1 ? 'it' : 'them'} down. The new figures are what the
                  register will say.
                </p>
                <table className={styles.table}>
                  <thead><tr><th>System</th><th>Threat</th><th>Now</th><th>After</th></tr></thead>
                  <tbody>
                    {risks.map(x => (
                      <tr key={x.risk_id}>
                        <td>{x.system}</td><td>{x.threat}</td>
                        <td>{x.before} ({x.before_score})</td>
                        <td className={styles.after}>{x.after} ({x.after_score})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.noRisks}>No risk score changes.</p>
            )}

            <label className={styles.field}>
              <span className={styles.label}>Why it is being withdrawn (required)</span>
              <textarea className={styles.input} rows={3} value={reason} autoFocus
                        onChange={e => setReason(e.target.value)}
                        placeholder="e.g. Attached in error — it does not counter this threat" />
            </label>
            <p className={styles.note}>
              This does not change the Statement of Applicability. Whether the objective applies at all is a
              separate decision.
            </p>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={styles.danger} onClick={confirm} disabled={busy || !preview}>
            {busy ? 'Withdrawing…' : 'Withdraw from use'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
