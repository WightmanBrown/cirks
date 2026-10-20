// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * context/HelpContext.jsx
 *
 * Loads the contextual-help catalogue (GET /help) once and exposes lookups to the
 * <HelpDot> components scattered through the UI. Help text is author-owned and
 * lives in the DB (not in code / i18n resource files), so changing a description
 * needs no deploy.
 *
 * Edit mode is a global UI toggle, available only to admins (admin.manage). When
 * on, every instrumented element shows its ⓘ dot (even with no text yet) and
 * clicking it opens an inline editor that PUTs the text back.
 *
 * Phase 1 is single-locale ('en'); the locale axis already exists end-to-end
 * (API + table PK) so Phase 2 only adds a locale picker here.
 */
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { getHelp, saveHelp as apiSaveHelp, registerHelpKey } from '../api';

const HelpContext = createContext(null);

const LOCALE = 'en'; // Phase 1

export function HelpProvider({ children }) {
  const { user, hasCapability } = useAuth();
  const [entries,   setEntries]   = useState({});      // key -> { title, body, placement, ... }
  const [knownKeys, setKnownKeys] = useState(new Set());
  const [editMode,  setEditMode]  = useState(false);

  const canEditHelp = hasCapability('admin.manage');

  const load = useCallback(async () => {
    try {
      const data = await getHelp(LOCALE);
      setEntries(data?.entries || {});
      setKnownKeys(new Set(data?.known_keys || []));
    } catch {
      // Non-fatal: help is supplementary. Leave whatever we have.
    }
  }, []);

  // Load once we have an authenticated user; clear on logout.
  useEffect(() => {
    if (user) load();
    else { setEntries({}); setKnownKeys(new Set()); setEditMode(false); }
  }, [user, load]);

  // Leaving edit mode whenever the user can no longer edit (role switch / logout).
  useEffect(() => { if (!canEditHelp) setEditMode(false); }, [canEditHelp]);

  const help = useCallback((key) => entries[key] || null, [entries]);

  const saveHelp = useCallback(async (key, payload) => {
    await apiSaveHelp(key, { locale: LOCALE, ...payload });
    await load(); // refresh the catalogue so the dot reflects the new text
  }, [load]);

  // Called by a HelpDot in edit mode when its key isn't registered yet, so the
  // coverage view can list instrumented-but-unwritten elements. Fire-and-forget,
  // admin-only, idempotent server-side.
  const ensureKey = useCallback((key, placement) => {
    if (!canEditHelp || knownKeys.has(key)) return;
    setKnownKeys(prev => new Set(prev).add(key)); // optimistic — don't re-POST
    registerHelpKey(key, placement).catch(() => {});
  }, [canEditHelp, knownKeys]);

  const value = useMemo(() => ({
    help, knownKeys, editMode, setEditMode, canEditHelp, saveHelp, ensureKey, locale: LOCALE,
  }), [help, knownKeys, editMode, canEditHelp, saveHelp, ensureKey]);

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

// Safe defaults so a <HelpDot> rendered outside a provider (e.g. an isolated
// component test, or a widget mounted standalone) degrades to "no help" rather
// than throwing. In the running app the provider is always present (App.jsx).
const NO_HELP = {
  help: () => null,
  knownKeys: new Set(),
  editMode: false,
  setEditMode: () => {},
  canEditHelp: false,
  saveHelp: async () => {},
  ensureKey: () => {},
  locale: 'en',
};

export function useHelp() {
  return useContext(HelpContext) || NO_HELP;
}
