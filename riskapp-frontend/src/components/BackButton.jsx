// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './BackButton.module.css';

// Shows a back button only when the user navigated here from within the app
// via a drill-down (not a menu selection). Renders nothing when:
//   - location.state.fromMenu is true  (Shell menu navigation)
//   - location.key === 'default'       (direct URL / new tab / refresh)
export function BackButton({ label = '← Back', className }) {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.state?.fromMenu || location.key === 'default') return null;

  const cls = className ? `${styles.backButton} ${className}` : styles.backButton;

  return (
    <button type="button" className={cls} onClick={() => navigate(-1)}>
      {label}
    </button>
  );
}
