// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * components/ProtectedRoute.jsx
 *
 * Redirects to /login if the user is not authenticated.
 * Gating (redirects to the user's role home if authenticated but not permitted):
 *   - `capability` — preferred: requires the resolved RBAC capability (Phase 4).
 *   - `requiredRole` — legacy role check, kept for the few routes without a clean
 *     capability mapping.
 * UI gating is convenience only; the backend enforces authorization regardless.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth }          from '../context/AuthContext';
import { getRoleHome }      from '../utils/getRoleHome';

export function ProtectedRoute({ requiredRole, capability }) {
  const { user, loading, hasCapability, capabilitiesReady } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Don't decide a capability gate until the capability set is actually loaded —
  // otherwise a not-yet-loaded set reads as "denied" and bounces the user away
  // (e.g. a hard refresh before the background capability fetch resolves).
  if (capability && !capabilitiesReady) return null;

  if (capability && !hasCapability(capability)) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  const roles = Array.isArray(requiredRole) ? requiredRole : requiredRole ? [requiredRole] : null;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  return <Outlet />;
}