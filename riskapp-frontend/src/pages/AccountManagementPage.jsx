'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect } from 'react';
import {
  getAdminUsers, createUser, patchAdminUser,
  resetUserPassword, resetUserTotp, getDepartments,
} from '../api';
import { Shell }      from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { useAuth }    from '../context/AuthContext';
import { HelpDot } from '../components/HelpDot';
import styles from './AccountManagementPage.module.css';

// Assignable (human) roles. An explicit ALLOW-list, which is why the machine
// identities (ai_agent, and soc_integration from v111) need no entry here to be
// excluded — they simply are not on it. Deny-lists elsewhere had to be edited.
export const ASSIGNABLE_ROLES = [
  'ciso', 'risk_analyst', 'information_asset_manager', 'information_asset_owner',
  'security_consultant', 'security_architect', 'siro', 'meeting_secretary', 'admin',
];
const prettyRole = (r) => r.replace(/_/g, ' ');

export function AccountManagementPage() {
  const { user } = useAuth();
  const selfId = user?.id;

  const [users, setUsers]   = useState([]);
  const [depts, setDepts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const blankForm = { email: '', full_name: '', role: 'risk_analyst', department_id: '', password: '' };
  const [form, setForm]       = useState(blankForm);
  const [createErr, setCreateErr] = useState(null);
  const [createBusy, setCreateBusy] = useState(false);

  const [pwOpenFor, setPwOpenFor] = useState(null);   // user id whose password field is open
  const [pwValue, setPwValue]     = useState('');
  const [rowMsg, setRowMsg]       = useState({});      // { [id]: string }
  const [rowErr, setRowErr]       = useState({});      // { [id]: string }

  async function load() {
    setLoading(true); setError(null);
    try {
      const [u, d] = await Promise.all([getAdminUsers(), getDepartments()]);
      setUsers(u);
      setDepts(d);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load accounts.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const deptName = (id) => depts.find((d) => d.id === id)?.name ?? '—';
  const setMsg = (id, msg) => setRowMsg((m) => ({ ...m, [id]: msg }));
  const setErr = (id, msg) => setRowErr((m) => ({ ...m, [id]: msg }));

  async function handleCreate(e) {
    e.preventDefault();
    setCreateErr(null); setCreateBusy(true);
    try {
      const payload = { ...form, department_id: form.department_id || null };
      const created = await createUser(payload);
      setUsers((prev) => [{ ...created, additional_roles: [] }, ...prev]);
      setForm(blankForm);
    } catch (err) {
      setCreateErr(err.response?.data?.error || 'Could not create account.');
    } finally { setCreateBusy(false); }
  }

  async function patchField(u, field, value) {
    setErr(u.id, null); setMsg(u.id, null);
    try {
      const { needs_reassignment, ...updated } = await patchAdminUser(u.id, { [field]: value });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
      if (field === 'full_name') setMsg(u.id, 'Name saved.');
      // After a department move, flag records left behind in the old department.
      if (needs_reassignment && needs_reassignment.total > 0) {
        const parts = Object.entries(needs_reassignment.counts)
          .map(([entity, n]) => `${n} ${entity}${n === 1 ? '' : 's'}`);
        setErr(u.id, `${needs_reassignment.total} record${needs_reassignment.total === 1 ? '' : 's'} need reassignment (${parts.join(', ')}) — now outside this user's department.`);
      }
    } catch (err) {
      setErr(u.id, err.response?.data?.error || 'Update failed.');
    }
  }

  async function doResetPassword(u) {
    setErr(u.id, null); setMsg(u.id, null);
    if (!pwValue || pwValue.length < 8) { setErr(u.id, 'Password must be at least 8 characters.'); return; }
    try {
      await resetUserPassword(u.id, pwValue);
      setPwOpenFor(null); setPwValue('');
      setMsg(u.id, 'Password reset.');
    } catch (err) {
      setErr(u.id, err.response?.data?.error || 'Reset failed.');
    }
  }

  async function doResetTotp(u) {
    setErr(u.id, null); setMsg(u.id, null);
    try {
      await resetUserTotp(u.id);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, totp_enabled: false } : x)));
      setMsg(u.id, 'Two-factor reset.');
    } catch (err) {
      setErr(u.id, err.response?.data?.error || 'Reset failed.');
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton />
          <h1 className={styles.heading}>Account Management<HelpDot k="admin.account_management" placement="bottom" label="About account management" /></h1>
        </div>
        <p className={styles.intro}>Create, edit and deactivate user accounts, assign departments and roles, and reset credentials.</p>

        {loading && <div className={styles.loadingBar} />}
        {!loading && error && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && (
          <>
            {/* New account */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>New account</h2>
              <form className={styles.createForm} onSubmit={handleCreate}>
                <input className={styles.input} type="email" placeholder="email" required
                  value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                <input className={styles.input} placeholder="full name" required
                  value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
                <select className={styles.select} value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{prettyRole(r)}</option>)}
                </select>
                <select className={styles.select} value={form.department_id}
                  onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}>
                  <option value="">— no department —</option>
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input className={styles.input} type="password" placeholder="temporary password (min 8)" required
                  autoComplete="new-password"
                  value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                <button className={styles.primaryBtn} type="submit" disabled={createBusy}>
                  {createBusy ? 'Creating…' : 'Create account'}
                </button>
              </form>
              {createErr && <p className={styles.errorMsg}>{createErr}</p>}
            </section>

            {/* Accounts */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Accounts ({users.length})</h2>
              <table className={styles.table}>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Active</th><th>Credentials</th></tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === selfId;
                    const selfTitle = 'You cannot change your own role, department or active status from this panel.';
                    return (
                      <tr key={u.id} className={`${u.is_active ? '' : styles.inactiveRow} ${isSelf ? styles.selfRow : ''}`}>
                        <td>
                          {/* The name is edited in place: it saves when you leave the
                              field or press Enter, and Esc puts it back. Your own name
                              can be corrected too — unlike your role, it grants nothing. */}
                          <input
                            className={styles.nameInput}
                            defaultValue={u.full_name}
                            aria-label={`Name of ${u.email}`}
                            title="Edit the name — saved when you press Enter or leave the field"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') { e.currentTarget.value = u.full_name; e.currentTarget.blur(); }
                            }}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (!v) { e.target.value = u.full_name; return; }
                              if (v !== u.full_name) patchField(u, 'full_name', v);
                            }}
                          />
                          {isSelf && <span className={styles.youBadge}>you</span>}
                          {u.additional_roles?.length > 0 && (
                            <div className={styles.extraRoles}>+ {u.additional_roles.map(prettyRole).join(', ')}</div>
                          )}
                        </td>
                        <td className={styles.email}>{u.email}</td>
                        <td>
                          <select className={styles.select} value={u.role} disabled={isSelf}
                            title={isSelf ? selfTitle : undefined}
                            onChange={(e) => patchField(u, 'role', e.target.value)}>
                            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{prettyRole(r)}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className={styles.select} value={u.department_id || ''} disabled={isSelf}
                            title={isSelf ? selfTitle : undefined}
                            onChange={(e) => patchField(u, 'department_id', e.target.value || null)}>
                            <option value="">— none —</option>
                            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="checkbox" checked={u.is_active} disabled={isSelf}
                            title={isSelf ? selfTitle : undefined}
                            onChange={(e) => patchField(u, 'is_active', e.target.checked)} />
                        </td>
                        <td>
                          <div className={styles.credCell}>
                            {pwOpenFor === u.id ? (
                              <span className={styles.pwBox}>
                                {/* Hidden username hint = the TARGET user, so Safari/Chrome
                                    attribute any credential to them, not the logged-in admin,
                                    and new-password stops "update your saved password" prompts. */}
                                <input type="text" value={u.email} readOnly autoComplete="username"
                                  aria-hidden="true" tabIndex={-1}
                                  style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
                                <input className={styles.input} type="password" placeholder="new password"
                                  autoComplete="new-password"
                                  value={pwValue} onChange={(e) => setPwValue(e.target.value)} autoFocus />
                                <button className={styles.smallBtn} onClick={() => doResetPassword(u)}>Set</button>
                                <button className={styles.linkBtn} onClick={() => { setPwOpenFor(null); setPwValue(''); }}>Cancel</button>
                              </span>
                            ) : (
                              <button className={styles.smallBtn} onClick={() => { setPwOpenFor(u.id); setPwValue(''); setMsg(u.id, null); setErr(u.id, null); }}>
                                Reset password
                              </button>
                            )}
                            <button className={styles.smallBtn} disabled={!u.totp_enabled}
                              title={u.totp_enabled ? 'Clear their authenticator enrolment' : 'No 2FA enrolled'}
                              onClick={() => doResetTotp(u)}>
                              Reset 2FA{u.totp_enabled ? '' : ' (off)'}
                            </button>
                            {rowMsg[u.id] && <span className={styles.okMsg}>{rowMsg[u.id]}</span>}
                            {rowErr[u.id] && <span className={styles.errInline}>{rowErr[u.id]}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
