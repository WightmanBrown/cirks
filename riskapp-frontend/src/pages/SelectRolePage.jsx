// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// riskapp-frontend/src/pages/SelectRolePage.jsx

import { useState }    from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';
import { getRoleHome } from '../utils/getRoleHome';
import { HelpDot }     from '../components/HelpDot';
import styles          from './SelectRolePage.module.css';

const ROLE_LABELS = {
  ciso:                      'CISO',
  risk_analyst:              'Risk Analyst',
  siro:                      'SIRO',
  information_asset_manager: 'Information Asset Manager',
  information_asset_owner:    'Information Asset Owner',
  meeting_secretary:         'Meeting Secretary',
  security_consultant:       'Security Consultant',
  security_architect:        'Security Architect',
  admin:                     'Administrator',
};

export function SelectRolePage() {
  const { user, switchRole } = useAuth();
  const navigate             = useNavigate();
  const [loading, setLoading] = useState(null); // role string currently loading
  const [error,   setError]   = useState(null);

  async function handleSelect(role) {
    if (loading) return;
    setError(null);
    setLoading(role);
    try {
      await switchRole(role);
      navigate(getRoleHome(role), { replace: true });
    } catch {
      setError('Could not switch to that role. Please try again.');
      setLoading(null);
    }
  }

  const roles = user?.roles ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.appName}>CIRKS</span>
          <h1 className={styles.title}>Select your role <HelpDot k="select_role.title" placement="bottom" /></h1>
          <p className={styles.subtitle}>
            Welcome back, {user?.full_name ?? user?.email}.
            Choose the role you want to work in for this session.
          </p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <ul className={styles.roleList}>
          {roles.map(role => (
            <li key={role}>
              <button
                className={`${styles.roleButton} ${role === user?.role ? styles.active : ''}`}
                onClick={() => handleSelect(role)}
                disabled={!!loading}
                aria-busy={loading === role}
              >
                <span className={styles.roleLabel}>
                  {ROLE_LABELS[role] ?? role}
                </span>
                {role === user?.role && (
                  <span className={styles.currentBadge}>current</span>
                )}
                {loading === role && (
                  <span className={styles.spinner} aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}