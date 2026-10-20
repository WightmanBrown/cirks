// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * pages/LoginPage.jsx
 *
 * Login form with optional TOTP step.
 * On success, navigates to the dashboard (the common landing page for every role).
 */
import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate                  = useNavigate();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpStep, setTotpStep] = useState(false); // show TOTP input

  // Licence and source link, fetched unauthenticated from the server so a
  // modified deployment links to ITS source, not upstream's. Falls back to the
  // upstream repository if the call fails.
  const [meta, setMeta] = useState({
    source_url: 'https://github.com/WightmanBrown/cirks',
    license: 'Apache-2.0',
    modified: false,
  });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/meta')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !cancelled) setMeta(m => ({ ...m, ...d })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  // Already logged in — skip the form.
  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      await login({
        email:     email.trim(),
        password,
        totp_code: totpStep ? totpCode.trim() : undefined,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const data = err.response?.data;

      if (data?.totp_required) {
        // Server says TOTP is needed — show TOTP input.
        setTotpStep(true);
        setError('');
      } else {
        setError(data?.error || 'Login failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      {/* Background grid */}
      <div className={styles.grid} aria-hidden />

      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.mark}>▲</span>
          <h1 className={styles.title}>CIRKS</h1>
          <p className={styles.subtitle}>Governance Console — Restricted Access</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {!totpStep ? (
            <>
              <Field
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="username"
                placeholder="you@organisation.gov"
                disabled={busy}
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                placeholder="••••••••••••"
                disabled={busy}
              />
            </>
          ) : (
            <div className={styles.totpStep}>
              <p className={styles.totpHint}>
                Enter the 6-digit code from your authenticator app.
              </p>
              <Field
                label="TOTP code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={setTotpCode}
                autoComplete="one-time-code"
                placeholder="000000"
                disabled={busy}
                autoFocus
              />
            </div>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={busy}
          >
            {busy
              ? 'Authenticating…'
              : totpStep
              ? 'Verify code'
              : 'Sign in'}
          </button>

          {totpStep && (
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => { setTotpStep(false); setTotpCode(''); }}
              disabled={busy}
            >
              ← Back
            </button>
          )}
        </form>

        <p className={styles.footer}>
          Authorised users only. All sessions are logged and audited.
        </p>

        {/* Copyright and trademark notice: keep it on the screen every user
            sees (TRADEMARKS.md, "Always"). The source URL comes from the
            server so that an operator running a MODIFIED CIRKS can point it
            at their own repository. */}
        <p className={styles.sourceOffer}>
          © 2026 Wightman Brown Limited. CIRKS is a trademark of Wightman
          Brown Limited.
          <br />
          <a href={meta.source_url} target="_blank" rel="noreferrer">
            {meta.modified ? 'Modified source' : 'Source'}
          </a>
          {' · '}{meta.license}
        </p>
      </div>
    </div>
  );
}

// ── Small form field component ────────────────────────────────────────────────

function Field({ label, type, value, onChange, disabled, autoFocus, ...rest }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input
        className={styles.input}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        {...rest}
      />
    </div>
  );
}
