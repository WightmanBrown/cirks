// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * context/AuthContext.jsx
 *
 * Stores auth state in React context.
 * Tokens are persisted to localStorage; the user object is kept in state.
 * On mount, rehydrates from localStorage so a page refresh doesn't log you out.
 *
 * Also holds the caller's resolved RBAC capability set (GET /users/me/capabilities)
 * so nav + route visibility derive from capabilities rather than hardcoded role
 * lists. Capabilities follow the ACTIVE role, so they are refreshed on login and
 * on role switch.
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  login as apiLogin,
  logout as apiLogout,
  switchRole as apiSwitchRole,
  getMyCapabilities,
} from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(null);
  const [capabilities, setCapabilities] = useState([]);     // array of capability keys
  const [departmentIsolation, setDepartmentIsolation] = useState(false);
  const [loading,      setLoading]      = useState(true);
  // True once we have a definitive capability set for the current user (loaded
  // from localStorage or fetched). Capability-gated routes must wait for this
  // before deciding — otherwise "not yet loaded" reads as "denied" and bounces
  // the user away (the ProtectedRoute race).
  const [capabilitiesReady, setCapabilitiesReady] = useState(false);

  const applyCaps = useCallback((data) => {
    const keys = (data?.capabilities || []).map((c) => c.key);
    setCapabilities(keys);
    setDepartmentIsolation(!!data?.department_isolation);
    setCapabilitiesReady(true);
    localStorage.setItem('capabilities', JSON.stringify(keys));
    localStorage.setItem('department_isolation', JSON.stringify(!!data?.department_isolation));
  }, []);

  const refreshCapabilities = useCallback(async () => {
    try {
      applyCaps(await getMyCapabilities());
    } catch {
      // Keep whatever we have; backend still enforces regardless of UI gating.
      // Unblock route gating either way so we don't hang on a failed fetch.
      setCapabilitiesReady(true);
    }
  }, [applyCaps]);

  // ── Rehydrate from localStorage on first render ───────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      // A user object with no token beside it is not a session — it is the
      // wreckage of one. Restoring it makes the app believe it is logged in,
      // so LoginPage bounces it to /dashboard, whose requests 401 and send it
      // back: a redirect loop broken only by the browser's navigation throttle.
      // Storage can end up in that state whenever a clear is partial, and the
      // cheapest defence is to refuse to believe half of it.
      const hasToken = !!(localStorage.getItem('access_token')
                       || localStorage.getItem('refresh_token'));
      if (raw && !hasToken) {
        localStorage.removeItem('user');
        localStorage.removeItem('capabilities');
        localStorage.removeItem('department_isolation');
        setCapabilitiesReady(true);
      } else if (raw) {
        setUser(JSON.parse(raw));
        const caps = localStorage.getItem('capabilities');
        if (caps) {
          // We have a known set from last session — gating can proceed now.
          setCapabilities(JSON.parse(caps));
          setCapabilitiesReady(true);
        }
        const di = localStorage.getItem('department_isolation');
        if (di) setDepartmentIsolation(JSON.parse(di));
        // Refresh in the background in case the matrix changed since last load.
        // If no cached caps existed, this resolving is what flips capabilitiesReady.
        refreshCapabilities();
      } else {
        // No authenticated user — nothing to gate; ProtectedRoute redirects to login.
        setCapabilitiesReady(true);
      }
    } catch {
      localStorage.removeItem('user');
      setCapabilitiesReady(true);
    } finally {
      setLoading(false);
    }
  }, [refreshCapabilities]);

  // ── login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (credentials) => {
    const data = await apiLogin(credentials.email, credentials.password, credentials.totp_code);
    localStorage.setItem('access_token',  data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user',          JSON.stringify(data.user));
    setUser(data.user);
    await refreshCapabilities();
    return data;
  }, [refreshCapabilities]);

  // ── logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    try {
      await apiLogout(refreshToken);
    } catch {
      // Always clear locally even if server call fails.
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('capabilities');
    localStorage.removeItem('department_isolation');
    setUser(null);
    setCapabilities([]);
    setDepartmentIsolation(false);
    setCapabilitiesReady(false);
  }, []);

  // ── switchRole ────────────────────────────────────────────────────────────
  const switchRole = useCallback(async (role) => {
    const data = await apiSwitchRole(role);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user',         JSON.stringify(data.user));
    setUser(data.user);
    await refreshCapabilities(); // capabilities follow the active role
    return data;
  }, [refreshCapabilities]);

  const hasCapability = useCallback(
    (key) => capabilities.includes(key),
    [capabilities],
  );

  return (
    <AuthContext.Provider value={{
      user, login, logout, switchRole, loading,
      capabilities, hasCapability, capabilitiesReady, departmentIsolation, refreshCapabilities,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
