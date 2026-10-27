// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * components/GoOperationalWidget.jsx
 *
 * security_consultant control for the one-way setup→operational transition.
 *
 * During SETUP the consultant stands up the org's risk picture and can accept
 * any risk exception. Going operational is a deliberate, irreversible milestone:
 * afterwards the consultant's exception-acceptance authority drops to the same
 * level as a risk_analyst. Hence the confirm step.
 */
import { useEffect, useState } from 'react';
import { getOrgPhase, goOperational } from '../api';
import styles from './GoOperationalWidget.module.css';
import { HelpDot } from './HelpDot';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function GoOperationalWidget() {
  const [phase,     setPhase]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy,      setBusy]      = useState(false);

  async function load() {
    try {
      const p = await getOrgPhase();
      setPhase(p);
    } catch {
      setError('Could not load the organisation phase.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleGo() {
    setBusy(true);
    setError(null);
    try {
      const p = await goOperational();
      setPhase(p);
      setConfirming(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not move to operational.');
    } finally {
      setBusy(false);
    }
  }

  const isSetup = phase?.setup_phase_active === true;

  return (
    <div className={`${styles.widget} ${isSetup ? styles.setup : styles.operational}`}>
      <div className={styles.header}>
        <span className={styles.title}>Onboarding Handover<HelpDot k="widget.onboarding_handover" placement="bottom" /></span>
        <span className={`${styles.badge} ${isSetup ? styles.badgeSetup : styles.badgeOp}`}>
          {loading ? '…' : isSetup ? 'SETUP' : 'OPERATIONAL'}
        </span>
      </div>

      <div className={styles.body}>
        {loading && <div className={styles.skeleton} aria-label="Loading…" />}
        {!loading && error && <p className={styles.error}>{error}</p>}

        {!loading && phase && !isSetup && (
          <p className={styles.opMsg}>
            The organisation went operational on <strong>{fmtDate(phase.setup_completed_at)}</strong>.
            Your exception-acceptance authority now matches the risk analyst.
          </p>
        )}

        {!loading && isSetup && !confirming && (
          <>
            <p className={styles.setupMsg}>
              The organisation is in <strong>setup</strong>. While in setup you can accept any
              risk exception to stand up the initial risk picture. Going operational is a
              one-way step — afterwards you accept exceptions at risk-analyst level.
            </p>
            <button className={styles.btnGo} onClick={() => { setError(null); setConfirming(true); }}>
              Go operational →
            </button>
          </>
        )}

        {!loading && isSetup && confirming && (
          <div className={styles.confirmBox}>
            <p className={styles.confirmMsg}>
              This cannot be undone. Move the organisation to <strong>operational</strong> now?
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.btnCancel} onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
              <button className={styles.btnConfirm} onClick={handleGo} disabled={busy}>
                {busy ? 'Working…' : 'Confirm — go operational'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
