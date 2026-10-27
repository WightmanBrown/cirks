'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useMemo } from 'react';
import {
  getAdminRbac, putRolePermissions, patchSodRule, patchDepartmentIsolation,
  getAdminUsers, patchAdminUser, addUserRole, removeUserRole,
} from '../api';
import { Shell }      from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { useAuth }    from '../context/AuthContext';
import { HelpDot } from '../components/HelpDot';
import styles from './AdminRbacPage.module.css';

// Machine identities: never assignable to a person, never a row in the role
// editor. ai_agent predates this; soc_integration joined in v111.
const SYSTEM_ROLES = new Set(['ai_agent', 'soc_integration']);

// Pure: group the capability catalogue by resource, preserving sorted order.
export function groupByResource(capabilities) {
  const groups = new Map();
  for (const c of [...capabilities].sort((a, b) => a.key.localeCompare(b.key))) {
    if (!groups.has(c.resource)) groups.set(c.resource, []);
    groups.get(c.resource).push(c);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const prettyRole = (r) => r.replace(/_/g, ' ');

export function AdminRbacPage() {
  const { refreshCapabilities, user } = useAuth();
  const selfId = user?.id;

  const [data,    setData]    = useState(null);
  const [users,   setUsers]   = useState([]);
  const [usersErr, setUsersErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const [role,    setRole]    = useState(null);
  const [grants,  setGrants]  = useState({});   // { capability_key: scope } for the selected role
  const [dirty,   setDirty]   = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveErr, setSaveErr] = useState(null);

  function loadRoleGrants(d, r) {
    const map = {};
    for (const g of d.matrix[r] || []) map[g.capability_key] = g.scope;
    setGrants(map);
    setDirty(false);
    setSaveMsg(null);
    setSaveErr(null);
  }

  async function load() {
    setLoading(true); setError(null);
    try {
      const [d, u] = await Promise.all([getAdminRbac(), getAdminUsers()]);
      setData(d);
      setUsers(u);
      const first = (d.roles || []).find((r) => !SYSTEM_ROLES.has(r)) || d.roles[0];
      setRole(first);
      loadRoleGrants(d, first);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load RBAC configuration.');
    } finally {
      setLoading(false);
    }
  }

  async function changePrimaryRole(u, newRole) {
    setUsersErr(null);
    try {
      await patchAdminUser(u.id, { role: newRole });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)));
    } catch (err) { setUsersErr(err.response?.data?.error || 'Could not change role.'); }
  }
  async function grantRole(u, newRole) {
    if (!newRole) return;
    setUsersErr(null);
    try {
      const res = await addUserRole(u.id, newRole);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, additional_roles: res.additional_roles } : x)));
    } catch (err) { setUsersErr(err.response?.data?.error || 'Could not grant role.'); }
  }
  async function revokeRole(u, r) {
    setUsersErr(null);
    try {
      const res = await removeUserRole(u.id, r);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, additional_roles: res.additional_roles } : x)));
    } catch (err) { setUsersErr(err.response?.data?.error || 'Could not revoke role.'); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  useEffect(() => { load(); }, []);

  const capGroups = useMemo(() => (data ? groupByResource(data.capabilities) : []), [data]);

  function selectRole(r) { setRole(r); loadRoleGrants(data, r); }

  function toggleCap(key) {
    setGrants((prev) => {
      const next = { ...prev };
      if (key in next) delete next[key];
      else next[key] = 'all_depts';
      return next;
    });
    setDirty(true); setSaveMsg(null);
  }

  function setScope(key, scope) {
    setGrants((prev) => ({ ...prev, [key]: scope }));
    setDirty(true); setSaveMsg(null);
  }

  async function saveRole() {
    setSaveErr(null);
    try {
      const payload = Object.entries(grants).map(([capability_key, scope]) => ({ capability_key, scope }));
      const res = await putRolePermissions(role, payload);
      setData((d) => ({ ...d, matrix: { ...d.matrix, [role]: res.grants } }));
      loadRoleGrants({ ...data, matrix: { ...data.matrix, [role]: res.grants } }, role);
      setSaveMsg('Saved — applied live.');
      refreshCapabilities?.(); // our own nav may change if we edited our active role
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Save failed.');
    }
  }

  async function toggleSod(key, enabled) {
    try {
      const res = await patchSodRule(key, enabled);
      setData((d) => ({ ...d, sod_rules: d.sod_rules.map((s) => (s.key === key ? res : s)) }));
    } catch { /* surface nothing fatal — leave as-is */ }
  }

  async function toggleIsolation(enabled) {
    try {
      const res = await patchDepartmentIsolation(enabled);
      setData((d) => ({ ...d, department_isolation: res.department_isolation }));
    } catch { /* no-op */ }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton />
          <h1 className={styles.heading}>Access Control <HelpDot k="rbac.title" placement="bottom" /></h1>
        </div>
        <p className={styles.intro}>
          Configure which roles can perform which actions, separation-of-duties rules,
          and whether departments are isolated. Changes apply immediately.
        </p>

        {loading && <div className={styles.loadingBar} />}
        {!loading && error && <p className={styles.errorMsg}>{error}</p>}

        {!loading && !error && data && (
          <>
            {/* Users & roles */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Users &amp; roles <HelpDot k="rbac.users_roles" placement="bottom" /></h2>
              {usersErr && <p className={styles.errorMsg}>{usersErr}</p>}
              <table className={styles.userTable}>
                <thead>
                  <tr>
                    <th>User <HelpDot k="rbac.col.user" placement="bottom" /></th>
                    <th>Primary role <HelpDot k="rbac.col.primary_role" placement="bottom" /></th>
                    <th>Additional roles <HelpDot k="rbac.col.additional_roles" placement="bottom" /></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === selfId;
                    const assignable = data.roles.filter((r) => !SYSTEM_ROLES.has(r));
                    const addable = assignable.filter((r) => r !== u.role && !(u.additional_roles || []).includes(r));
                    return (
                      <tr key={u.id} className={u.is_active ? '' : styles.inactiveRow}>
                        <td>
                          <div className={styles.userName}>
                            {u.full_name}{!u.is_active && <span className={styles.inactiveTag}>inactive</span>}
                          </div>
                          <div className={styles.userEmail}>{u.email}</div>
                        </td>
                        <td>
                          <select
                            className={styles.scopeSelect}
                            value={u.role}
                            disabled={isSelf}
                            title={isSelf ? "You can't change your own role here" : ''}
                            onChange={(e) => changePrimaryRole(u, e.target.value)}
                          >
                            {assignable.map((r) => <option key={r} value={r}>{prettyRole(r)}</option>)}
                          </select>
                        </td>
                        <td>
                          <div className={styles.roleChips}>
                            {(u.additional_roles || []).map((r) => (
                              <span key={r} className={styles.roleChip}>
                                {prettyRole(r)}
                                {!isSelf && (
                                  <button className={styles.chipX} title="Revoke" onClick={() => revokeRole(u, r)}>×</button>
                                )}
                              </span>
                            ))}
                            {!isSelf && addable.length > 0 && (
                              <select
                                className={styles.addRole}
                                value=""
                                onChange={(e) => { grantRole(u, e.target.value); e.target.value = ''; }}
                              >
                                <option value="">+ add role</option>
                                {addable.map((r) => <option key={r} value={r}>{prettyRole(r)}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {/* Department isolation */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Department isolation <HelpDot k="rbac.department_isolation" placement="bottom" /></h2>
              <label className={styles.switchRow}>
                <input
                  type="checkbox"
                  checked={data.department_isolation}
                  onChange={(e) => toggleIsolation(e.target.checked)}
                />
                <span>
                  {data.department_isolation
                    ? 'On — department-scoped roles see only their own department.'
                    : 'Off — every role sees all departments (spreadsheet mode).'}
                </span>
              </label>
            </section>

            {/* Separation of duties */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Separation of duties <HelpDot k="rbac.sod" placement="bottom" /></h2>
              <ul className={styles.sodList}>
                {data.sod_rules.map((s) => (
                  <li key={s.key} className={styles.sodItem}>
                    <label className={styles.switchRow}>
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => toggleSod(s.key, e.target.checked)}
                      />
                      <span><code className={styles.code}>{s.key}</code> — {s.description}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            {/* Role permissions matrix (per role) */}
            <section className={styles.card}>
              <div className={styles.roleEditorHead}>
                <h2 className={styles.cardTitle}>Role permissions <HelpDot k="rbac.role_permissions" placement="bottom" /></h2>
                <label className={styles.roleSelect}>
                  Role:&nbsp;
                  <select value={role || ''} onChange={(e) => selectRole(e.target.value)}>
                    {data.roles.filter((r) => !SYSTEM_ROLES.has(r)).map((r) => (
                      <option key={r} value={r}>{prettyRole(r)}</option>
                    ))}
                  </select>
                </label>
                <button className={styles.saveBtn} onClick={saveRole} disabled={!dirty}>
                  {dirty ? 'Save changes' : 'Saved'}
                </button>
                {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
                {saveErr && <span className={styles.errorMsg}>{saveErr}</span>}
              </div>

              {capGroups.map(([resource, caps]) => (
                <div key={resource} className={styles.resourceGroup}>
                  <h3 className={styles.resourceLabel}>{resource} <HelpDot k="rbac.resource" placement="bottom" /></h3>
                  {caps.map((c) => {
                    const granted = c.key in grants;
                    return (
                      <div key={c.key} className={styles.capRow}>
                        <label className={styles.capLabel}>
                          <input type="checkbox" checked={granted} onChange={() => toggleCap(c.key)} />
                          <code className={styles.code}>{c.key}</code>
                          <span className={styles.capDesc}>{c.description}</span>
                        </label>
                        {granted && c.dept_scopable && (
                          <select
                            className={styles.scopeSelect}
                            value={grants[c.key]}
                            onChange={(e) => setScope(c.key, e.target.value)}
                          >
                            <option value="all_depts">all departments</option>
                            <option value="own_dept">own department</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
