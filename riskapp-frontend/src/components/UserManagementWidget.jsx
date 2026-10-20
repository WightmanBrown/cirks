// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useRef, useState } from 'react';
import { getAdminUsers, patchAdminUser }  from '../api';
import { useAuth }                        from '../context/AuthContext';
import { ROLE_LABELS }                    from '../utils/roles';
import { HelpDot }                         from './HelpDot';
import styles                             from './UserManagementWidget.module.css';

// ── Role display labels ───────────────────────────────────────────────────────

const ROLES = [
  { value: 'admin',                     label: 'Admin' },
  { value: 'ciso',                      label: 'CISO' },
  { value: 'risk_analyst',              label: 'Risk Analyst' },
  { value: 'information_asset_manager', label: 'IAM' },
  { value: 'information_asset_owner',   label: 'IAO' },
  { value: 'security_consultant',       label: 'Sec. Consultant' },
  { value: 'security_architect',        label: 'Security Architect' },
  { value: 'siro',                      label: 'SIRO' },
  { value: 'meeting_secretary',         label: 'Secretary' },
];

// System accounts that should not be reassigned via the UI
const SYSTEM_ROLES = new Set(['ai_agent', 'soc_integration']);

// Labels come from utils/roles.js — the shared map — so a role cannot read one
// way here and another in a person picker.
const ROLE_LABEL = ROLE_LABELS;

// ── Component ─────────────────────────────────────────────────────────────────

export function UserManagementWidget() {
  const { user: self }    = useAuth();
  const [users,  setUsers]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Per-row save state: Map<userId, 'saving' | 'saved' | 'error'>
  const [rowState, setRowState] = useState({});
  const savedTimers = useRef({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAdminUsers();
        if (!cancelled) setUsers(data);
      } catch {
        if (!cancelled) setError('Could not load users.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Clear "saved" flash after 2 s
  function flashSaved(userId) {
    clearTimeout(savedTimers.current[userId]);
    setRowState(s => ({ ...s, [userId]: 'saved' }));
    savedTimers.current[userId] = setTimeout(() => {
      setRowState(s => {
        const next = { ...s };
        delete next[userId];
        return next;
      });
    }, 2000);
  }

  async function handleRoleChange(userId, newRole) {
    setRowState(s => ({ ...s, [userId]: 'saving' }));
    // Optimistic update
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    try {
      await patchAdminUser(userId, { role: newRole });
      flashSaved(userId);
    } catch {
      // Roll back
      setRowState(s => ({ ...s, [userId]: 'error' }));
      const fresh = await getAdminUsers().catch(() => null);
      if (fresh) setUsers(fresh);
    }
  }

  async function handleToggleActive(userId, newActive) {
    setRowState(s => ({ ...s, [userId]: 'saving' }));
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: newActive } : u));
    try {
      await patchAdminUser(userId, { is_active: newActive });
      flashSaved(userId);
    } catch {
      setRowState(s => ({ ...s, [userId]: 'error' }));
      const fresh = await getAdminUsers().catch(() => null);
      if (fresh) setUsers(fresh);
    }
  }

  const activeCount   = users.filter(u => u.is_active).length;
  const inactiveCount = users.length - activeCount;

  return (
    <div className={styles.widget}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.title}>User Management<HelpDot k="widget.user_management" placement="bottom" label="About User Management" /></span>
        <div className={styles.headerRight}>
          <span className={styles.badge}>ADMIN</span>
          {!loading && !error && (
            <span className={styles.countChip}>
              {activeCount} active{inactiveCount > 0 ? ` · ${inactiveCount} inactive` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>
        {loading && (
          <div className={styles.skeleton}>
            {[1, 2, 3, 4].map(n => <div key={n} className={styles.skeletonRow} />)}
          </div>
        )}

        {!loading && error && <p className={styles.error}>{error}</p>}

        {!loading && !error && users.length === 0 && (
          <p className={styles.empty}>No users found.</p>
        )}

        {!loading && !error && users.length > 0 && (
          <ul className={styles.list}>
            {users.map(user => {
              const isSelf    = user.id === self?.id;
              const isSystem  = SYSTEM_ROLES.has(user.role);
              const state     = rowState[user.id];
              const disabled  = state === 'saving' || isSelf || isSystem;

              return (
                <li
                  key={user.id}
                  className={`${styles.row} ${!user.is_active ? styles.rowInactive : ''}`}
                >
                  {/* Active status dot */}
                  <span
                    className={user.is_active ? styles.dotActive : styles.dotInactive}
                    title={user.is_active ? 'Active' : 'Inactive'}
                    aria-hidden="true"
                  />

                  {/* Name + email + dept */}
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>
                      {user.full_name}
                      {isSelf   && <span className={styles.selfBadge}>you</span>}
                      {isSystem && <span className={styles.systemBadge}>system</span>}
                    </span>
                    <span className={styles.userMeta}>
                      {user.email}
                      {user.department_name ? ` · ${user.department_name}` : ''}
                    </span>
                    {user.additional_roles?.length > 0 && (
                      <span className={styles.additionalRoles}>
                        +{user.additional_roles.map(r => ROLE_LABEL[r] ?? r).join(', ')}
                      </span>
                    )}
                  </div>

                  {/* Role select (or read-only label for system accounts) */}
                  {isSystem ? (
                    <span className={styles.roleReadOnly}>
                      {ROLE_LABEL[user.role] ?? user.role}
                    </span>
                  ) : (
                    <select
                      className={styles.roleSelect}
                      value={user.role}
                      onChange={e => handleRoleChange(user.id, e.target.value)}
                      disabled={disabled}
                      aria-label={`Primary role for ${user.full_name}`}
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  )}

                  {/* Save state indicator */}
                  <span className={styles.stateIndicator} aria-live="polite">
                    {state === 'saving' && <span className={styles.spinning}>⟳</span>}
                    {state === 'saved'  && <span className={styles.savedMark}>✓</span>}
                    {state === 'error'  && <span className={styles.errorMark} title="Save failed">✕</span>}
                  </span>

                  {/* Active toggle — hidden for own row and system accounts */}
                  {!isSelf && !isSystem && (
                    <button
                      className={user.is_active ? styles.deactivateBtn : styles.reactivateBtn}
                      onClick={() => handleToggleActive(user.id, !user.is_active)}
                      disabled={disabled}
                      aria-label={user.is_active
                        ? `Deactivate ${user.full_name}`
                        : `Reactivate ${user.full_name}`}
                    >
                      {user.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
