// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './ErrorPage.module.css';

export function UnauthorizedPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.code}>403</span>
        <h1 className={styles.title}>Access Denied</h1>
        <p className={styles.message}>
          Your role <strong>{user?.role}</strong> does not have permission to access this resource.
        </p>
        <button className={styles.btn} onClick={handleLogout}>
          Sign out and switch account
        </button>
      </div>
    </div>
  );
}
