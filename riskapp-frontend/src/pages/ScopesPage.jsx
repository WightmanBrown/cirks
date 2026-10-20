// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getScopes, createScope } from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { ReadOnlyBadge } from '../components/ReadOnlyBadge';
import styles from './ScopesPage.module.css';

// Scopes (v126): named sets of systems in which a control objective can apply —
// e.g. the cardholder data environment. The whole organisation is the default and
// needs no scope. Drawing one is a governance statement: scopes.manage.
export function ScopesPage() {
  const { hasCapability } = useAuth();
  const canManage = hasCapability('scopes.manage');
  const [data, setData]   = useState(null);
  const [error, setError] = useState('');
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [busy, setBusy]   = useState(false);

  const load = useCallback(async () => {
    try { setData(await getScopes()); setError(''); }
    catch { setError('Could not load scopes.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) { setError('A scope needs a name.'); return; }
    setBusy(true); setError('');
    try {
      await createScope({ name, description: desc });
      setName(''); setDesc('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || 'The scope was not created.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Scopes</h1>
            <p className={styles.desc}>
              Where a control objective applies. By default an adopted objective applies to the
              <b> whole organisation</b> — every active system. A scope narrows it to a named set of
              systems, such as the cardholder data environment for PCI-DSS. A system can be in several scopes.
            </p>
          </div>
          {!canManage && <ReadOnlyBadge reason="Drawing scopes needs the scopes.manage capability (CISO, SIRO, admin)." />}
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {canManage && (
          <form className={styles.create} onSubmit={create}>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)}
                   placeholder="New scope, e.g. Cardholder data environment" aria-label="Scope name" maxLength={200} />
            <input className={styles.input} value={desc} onChange={e => setDesc(e.target.value)}
                   placeholder="What it covers (optional)" aria-label="Scope description" />
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create scope'}</button>
          </form>
        )}

        {data && (
          <table className={styles.table}>
            <thead>
              <tr><th>Scope</th><th>Systems</th><th>Objectives narrowed to it</th></tr>
            </thead>
            <tbody>
              <tr className={styles.orgRow}>
                <td>
                  <span className={styles.name}>Whole organisation</span>
                  <span className={styles.note}>The default — every active system. Not editable.</span>
                </td>
                <td>{data.organisation_system_count}</td>
                <td className={styles.muted}>every adopted objective not narrowed to a scope</td>
              </tr>
              {data.scopes.map(s => (
                <tr key={s.id}>
                  <td>
                    <Link className={styles.name} to={`/scopes/${s.id}`}>{s.name}</Link>
                    {s.description && <span className={styles.note}>{s.description}</span>}
                  </td>
                  <td>{s.system_count}</td>
                  <td>{s.objective_count}</td>
                </tr>
              ))}
              {data.scopes.length === 0 && (
                <tr><td colSpan={3} className={styles.muted}>No scopes yet — every adopted objective applies to the whole organisation.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
