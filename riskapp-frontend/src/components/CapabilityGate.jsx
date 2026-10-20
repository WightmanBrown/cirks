// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shell } from './Shell';
import styles from '../pages/ErrorPage.module.css';

/**
 * Up-front permission gate for data-entry flows (wizards, multi-step forms).
 *
 * Hitting a 403 at the END of a long data-entry flow is death to an app, so any
 * such flow must check the required capability on entry and show this warning
 * INSTEAD of the form — never let the user fill it in and fail on save.
 *
 * Usage (early-return, after all hooks):
 *   const { hasCapability } = useAuth();
 *   if (!hasCapability('departments.write')) {
 *     return <CapabilityGate capability="departments.write" feature="set up departments" />;
 *   }
 *
 * Or as a wrapper around a single-return page:
 *   <CapabilityGate capability="x" feature="…">{content}</CapabilityGate>
 *
 * `capability` may be a string or an array (all required). The backend remains
 * the real authority — this is a courtesy gate, not the security boundary.
 */
export function CapabilityGate({ capability, feature, children = null }) {
  const { user, hasCapability } = useAuth();
  const navigate = useNavigate();

  const caps    = Array.isArray(capability) ? capability : [capability];
  const allowed = caps.every(c => hasCapability(c));

  if (allowed) return children;

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.card}>
          <span className={styles.code} aria-hidden="true">🔒</span>
          <h1 className={styles.title}>Insufficient permissions</h1>
          <p className={styles.message}>
            You can’t {feature || 'use this feature'}. Your current role{' '}
            <strong>{user?.role}</strong> doesn’t have the permission this
            needs. Ask an administrator to grant{' '}
            <strong>{caps.join(', ')}</strong> on the Access Control page, or
            switch to a role that has it.
          </p>
          <button className={styles.btn} onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </button>
        </div>
      </div>
    </Shell>
  );
}
