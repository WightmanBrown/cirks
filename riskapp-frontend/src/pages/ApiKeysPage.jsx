'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useState } from 'react';
import { getApiKeys, createApiKey, revokeApiKey } from '../api';
import { Shell }      from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import styles from './ApiKeysPage.module.css';
import { DateField } from '../components/DateField';
import { SortableTh } from '../components/SortableTh';
import { useTableSort } from '../hooks/useTableSort';
import { useUrlSortState } from '../hooks/useUrlState';

// Admin management of machine API keys (SOC enrichment — Stage 3). A key is shown
// exactly ONCE, on creation; thereafter only its metadata is visible.

function fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function statusWord(k) {
  if (k.revoked_at) return 'Revoked';
  if (k.expires_at && new Date(k.expires_at) <= new Date()) return 'Expired';
  return 'Active';
}

const STATUS_CLASS = { Revoked: styles.revoked, Expired: styles.expired, Active: styles.active };

function statusOf(k) {
  const label = statusWord(k);
  return { label, cls: STATUS_CLASS[label] };
}

// Column key → value, for sorting the keys by a header (useTableSort). Status
// sorts by the word shown; the timestamps sort as ISO strings, never-used last.
export const API_KEY_ACCESSORS = {
  label:     (k) => k.label,
  prefix:    (k) => k.key_prefix,
  role:      (k) => k.role,
  status:    (k) => statusWord(k),
  last_used: (k) => k.last_used_at,
  expires:   (k) => k.expires_at,
  created:   (k) => k.created_at,
};

export function ApiKeysPage() {
  const [keys, setKeys]     = useState(null);
  const [error, setError]   = useState(null);
  const [label, setLabel]   = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy]     = useState(false);
  const [newKey, setNewKey] = useState(null); // { key, label } — shown once
  const [copied, setCopied] = useState(false);

  async function load() {
    setError(null);
    try { setKeys(await getApiKeys()); }
    catch { setError('Could not load API keys.'); }
  }
  useEffect(() => { load(); }, []);

  const sortState = useUrlSortState();
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(keys ?? [], { accessors: API_KEY_ACCESSORS, state: sortState });
  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  async function handleCreate(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true); setError(null); setNewKey(null); setCopied(false);
    try {
      const body = { label: label.trim() };
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
      const created = await createApiKey(body);
      setNewKey({ key: created.key, label: created.label });
      setLabel(''); setExpiresAt('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not create the key.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id, lbl) {
    if (!window.confirm(`Revoke the key "${lbl}"? Any integration using it will stop working immediately.`)) return;
    setError(null);
    try { await revokeApiKey(id); await load(); }
    catch { setError('Could not revoke the key.'); }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton />
          <h1 className={styles.heading}>API Keys <HelpDot k="api_keys.title" placement="bottom" /></h1>
        </div>
        <p className={styles.intro}>
          Machine credentials for SOC integrations (e.g. Wazuh) that call the knowledge
          enrichment API. A key authenticates via the <code>X-API-Key</code> header and
          assumes the <strong>soc_integration</strong> role, which answers enrichment questions (host/IP → system) and nothing else.
          Keys are shown once on creation — copy and store it securely.
        </p>

        {error && <p className={styles.errorMsg}>{error}</p>}

        {newKey && (
          <div className={styles.reveal}>
            <div className={styles.revealHead}>New key “{newKey.label}” — copy it now, it won’t be shown again.</div>
            <div className={styles.revealRow}>
              <code className={styles.keyValue}>{newKey.key}</code>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => { navigator.clipboard?.writeText(newKey.key); setCopied(true); }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className={styles.dismissBtn} onClick={() => setNewKey(null)}>Dismiss</button>
            </div>
          </div>
        )}

        <form className={styles.createCard} onSubmit={handleCreate}>
          <h2 className={styles.cardTitle}>Create a key <HelpDot k="api_keys.create" placement="bottom" /></h2>
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Label (integration name)</span>
              <input
                className={styles.input}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Wazuh prod"
                maxLength={120}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Expires (optional)</span>
              <DateField
                className={styles.input}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
            <button className={styles.createBtn} disabled={busy || !label.trim()}>
              {busy ? 'Creating…' : 'Create key'}
            </button>
          </div>
        </form>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Existing keys <HelpDot k="api_keys.existing" placement="bottom" /></h2>
          {keys === null ? (
            <p className={styles.muted}>Loading…</p>
          ) : keys.length === 0 ? (
            <p className={styles.muted}>No API keys yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <SortableTh column="label" {...sortProps} helpKey="api_keys.col.label">Label</SortableTh>
                  <SortableTh column="prefix" {...sortProps} helpKey="api_keys.col.prefix">Prefix</SortableTh>
                  <SortableTh column="role" {...sortProps} helpKey="api_keys.col.role">Role</SortableTh>
                  <SortableTh column="status" {...sortProps} helpKey="api_keys.col.status">Status</SortableTh>
                  <SortableTh column="last_used" {...sortProps} helpKey="api_keys.col.last_used">Last used</SortableTh>
                  <SortableTh column="expires" {...sortProps} helpKey="api_keys.col.expires">Expires</SortableTh>
                  <SortableTh column="created" {...sortProps} helpKey="col.created">Created</SortableTh>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((k) => {
                  const st = statusOf(k);
                  return (
                    <tr key={k.id}>
                      <td>{k.label}</td>
                      <td><code className={styles.prefix}>{k.key_prefix}…</code></td>
                      <td>{k.role}</td>
                      <td><span className={`${styles.badge} ${st.cls}`}>{st.label}</span></td>
                      <td>{fmt(k.last_used_at)}</td>
                      <td>{fmt(k.expires_at)}</td>
                      <td>{fmt(k.created_at)}</td>
                      <td>
                        {!k.revoked_at && (
                          <button className={styles.revokeBtn} onClick={() => handleRevoke(k.id, k.label)}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </Shell>
  );
}
