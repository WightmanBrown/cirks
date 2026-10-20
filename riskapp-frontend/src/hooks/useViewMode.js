// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getViewMode, putViewMode } from '../api';

/**
 * Manages the business / expert display mode for a page.
 *
 * - Initialises to the user's account-wide stored default on mount. The DB
 *   default for new accounts is 'business', so everyone starts simple.
 * - Every authenticated user can toggle to expert per-session — non-expert
 *   roles are deliberately NOT locked out, because they often sit with a risk
 *   expert who wants to show the full detail.
 * - `setMode` switches for this session only (no API call).
 * - `saveDefault` persists the current session mode as the new account default.
 *
 * Returns:
 *   mode          – 'business' | 'expert'  (current session value)
 *   isExpert      – mode === 'expert'
 *   canUseExpert  – true for any authenticated user (gates the toggle UI)
 *   setMode       – (newMode) => void
 *   saveDefault   – () => Promise<void>
 *   isDirty       – current session mode differs from the stored account default
 *   loading       – true while fetching the stored default
 */
export function useViewMode() {
  const { user } = useAuth();
  const canUseExpert = !!user;

  const [savedDefault, setSavedDefault] = useState('business');
  const [mode,         setModeState]    = useState('business');
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getViewMode()
      .then(v => {
        if (!cancelled) {
          setSavedDefault(v);
          setModeState(v);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedDefault('business');
          setModeState('business');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // Re-fetch if the user identity changes (e.g. role switch).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  const setMode = useCallback((newMode) => {
    setModeState(newMode);
  }, []);

  const saveDefault = useCallback(async () => {
    await putViewMode(mode);
    setSavedDefault(mode);
  }, [mode]);

  return {
    mode,
    isExpert:     mode === 'expert',
    canUseExpert,
    setMode,
    saveDefault,
    isDirty:      mode !== savedDefault,
    loading,
  };
}
