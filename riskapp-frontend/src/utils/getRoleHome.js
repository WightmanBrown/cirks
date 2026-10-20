// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// riskapp-frontend/src/utils/getRoleHome.js

/**
 * Maps a role string to the default landing route for that role.
 * Used by App.jsx (root redirect) and ProtectedRoute.jsx (mismatch redirect).
 *
 * Add new roles here as slices are built — do not duplicate this logic elsewhere.
 */
export function getRoleHome(role) {
  switch (role) {
    case 'ciso':               return '/dashboard';
    case 'risk_analyst':       return '/dashboard';
    case 'siro':               return '/dashboard';
    case 'information_asset_manager': return '/dashboard';
    case 'information_asset_owner':      return '/dashboard';
    case 'meeting_secretary':  return '/dashboard';
    case 'security_consultant':return '/dashboard';
    case 'admin':              return '/dashboard';
    default:                   return '/dashboard';
  }
}