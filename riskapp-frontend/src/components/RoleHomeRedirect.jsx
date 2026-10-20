// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Navigate } from 'react-router-dom';
import { useAuth }  from '../context/AuthContext';
import { getRoleHome } from '../utils/getRoleHome';

export function RoleHomeRedirect() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  // Multi-role users must select a role first.
  if (user.roles && user.roles.length > 1) {
    return <Navigate to="/select-role" replace />;
  }

  // Single-role users go straight to their dashboard.
  return <Navigate to={getRoleHome(user.role)} replace />;
}
