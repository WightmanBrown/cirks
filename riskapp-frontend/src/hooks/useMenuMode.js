// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useCallback, useEffect, useState } from 'react';
import { getMenuMode, putMenuMode } from '../api';
import { useAuth } from '../context/AuthContext';

// The simple or full menu (v183, owner 2026-11-18). Fetched once per person and
// role, and shared by every Shell on the page: the Shell remounts on each
// navigation, and the menu must not flicker or refetch each time.
// The same defaults as the server (routes/users MENU_SIMPLE_ROLES), used until the
// person's own choice has loaded, so an owner's menu does not flash full first.
export const MENU_SIMPLE_ROLES = new Set([
  'information_asset_owner', 'information_asset_manager', 'siro', 'meeting_secretary', 'soc_analyst',
]);
const roleDefaultOf = (role) => (MENU_SIMPLE_ROLES.has(role) ? 'simple' : 'full');

let cache = { key: null, value: null, promise: null };
const listeners = new Set();

function publish(key, value) {
  cache = { key, value, promise: null };
  for (const l of listeners) l(value);
}

export function useMenuMode() {
  const { user } = useAuth();
  const key = user ? `${user.id}:${user.role}` : null;
  const [state, setState] = useState(cache.key === key ? cache.value : null);

  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);

  useEffect(() => {
    if (!key) return;
    if (cache.key === key && cache.value) { setState(cache.value); return; }
    if (cache.key === key && cache.promise) return;
    const promise = getMenuMode()
      .then((v) => publish(key, v))
      .catch(() => publish(key, null));
    cache = { key, value: null, promise };
  }, [key]);

  const setMenuMode = useCallback(async (mode) => {
    const v = await putMenuMode(mode);
    publish(key, v);
  }, [key]);

  const roleDefault = state?.role_default ?? roleDefaultOf(user?.role);
  const menuMode = state?.menu_mode ?? roleDefault;
  return { simple: menuMode === 'simple', menuMode, chosen: state?.chosen ?? null, roleDefault, setMenuMode };
}

// For tests: forget what was fetched.
export function resetMenuModeCache() { cache = { key: null, value: null, promise: null }; }
