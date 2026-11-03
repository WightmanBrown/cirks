// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
//
// My account: what a person sets for themselves. Today that is two-factor
// sign-in (H-05, v166). The secret is shown once, to be scanned; CIRKS never
// shows it again, and switching it on needs a code that proves the app has it.
import { useEffect, useState } from 'react';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import { useAuth } from '../context/AuthContext';
import { getTotpStatus, setupTotp, confirmTotp, disableTotp } from '../api';
import styles from './MyAccountPage.module.css';

const errorOf = (err, fallback) => err?.response?.data?.error || fallback;

export function MyAccountPage() {
  const { user } = useAuth();
  const [status, setStatus]   = useState(null);     // { enabled, enabled_at, pending }
  const [setup, setSetup]     = useState(null);     // { secret, otpauth_url, qr } while scanning
  const [code, setCode]       = useState('');
  const [password, setPassword] = useState('');
  const [turningOff, setTurningOff] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');

  const load = () => getTotpStatus().then(setStatus).catch(err => setError(errorOf(err, 'Could not load your account.')));
  useEffect(() => { load(); }, []);

  async function act(fn) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (err) { setError(errorOf(err, 'That did not work. Try again.')); }
    finally { setBusy(false); }
  }

  const start = () => act(async () => { setSetup(await setupTotp()); setCode(''); });
  const confirm = (e) => {
    e.preventDefault();
    return act(async () => {
      await confirmTotp(code.trim());
      setSetup(null); setCode('');
      setMessage('Two-factor sign-in is on. You will be asked for a code each time you sign in. Any other sessions have been signed out.');
      await load();
    });
  };
  const turnOff = (e) => {
    e.preventDefault();
    return act(async () => {
      await disableTotp(password, code.trim());
      setTurningOff(false); setPassword(''); setCode('');
      setMessage('Two-factor sign-in is off.');
      await load();
    });
  };

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton fallback="/dashboard" />
        <h1 className={styles.title}>My account <HelpDot k="account.title" placement="bottom" /></h1>
        <p className={styles.muted}>{user?.full_name} · {user?.email}</p>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Two-factor sign-in <HelpDot k="account.totp" placement="bottom" /></h2>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {message && <p className={styles.ok} role="status">{message}</p>}

          {status && !status.enabled && !setup && (
            <>
              <p>
                <b>Off.</b> Signing in needs only your password. With two-factor sign-in, it also needs a six-digit
                code from an authenticator app on your phone (Microsoft Authenticator, Google Authenticator, 1Password
                and others), so a stolen password is not enough on its own.
              </p>
              <button className={styles.primary} disabled={busy} onClick={start}>Set up two-factor sign-in</button>
            </>
          )}

          {setup && (
            <form onSubmit={confirm} className={styles.steps}>
              <ol>
                <li>In your authenticator app, add an account and scan this code.
                  <div className={styles.qr}><img src={setup.qr} alt="QR code to scan into your authenticator app" width={220} height={220} /></div>
                  <span className={styles.muted}>Cannot scan? Enter this key by hand: </span>
                  <code className={styles.secret}>{setup.secret.match(/.{1,4}/g).join(' ')}</code>
                </li>
                <li>Type the six-digit code the app now shows, to prove it is set up.
                  <div className={styles.row}>
                    <input className={styles.input} inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                      aria-label="Code from your authenticator app" placeholder="123456"
                      value={code} onChange={e => setCode(e.target.value)} autoFocus />
                    <button className={styles.primary} type="submit" disabled={busy || code.trim().length < 6}>Switch on</button>
                    <button className={styles.link} type="button" onClick={() => { setSetup(null); setCode(''); }}>Cancel</button>
                  </div>
                </li>
              </ol>
              <p className={styles.muted}>
                This key is shown only now. If you lose your phone, an administrator can clear two-factor sign-in
                for you, and you set it up again.
              </p>
            </form>
          )}

          {status?.enabled && !turningOff && (
            <>
              <p><b>On</b>{status.enabled_at ? ` since ${new Date(status.enabled_at).toLocaleDateString()}` : ''}.
                Signing in needs your password and a code from your authenticator app.</p>
              <button className={styles.secondary} onClick={() => { setTurningOff(true); setError(''); setMessage(''); }}>
                Turn off…
              </button>
            </>
          )}

          {status?.enabled && turningOff && (
            <form onSubmit={turnOff} className={styles.row}>
              <input className={styles.input} type="password" autoComplete="current-password" aria-label="Your password"
                placeholder="your password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
              <input className={styles.input} inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                aria-label="Code from your authenticator app" placeholder="code" value={code} onChange={e => setCode(e.target.value)} />
              <button className={styles.danger} type="submit" disabled={busy || !password || code.trim().length < 6}>Turn off</button>
              <button className={styles.link} type="button" onClick={() => { setTurningOff(false); setPassword(''); setCode(''); }}>Cancel</button>
            </form>
          )}
        </section>
      </div>
    </Shell>
  );
}
