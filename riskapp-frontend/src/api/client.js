// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * api/client.js
 *
 * Axios instance pre-configured for the riskapp API.
 *
 * Interceptors:
 *   Request  — attaches Authorization: Bearer <accessToken> from localStorage.
 *   Response — on 401, attempts a silent token refresh, then retries once.
 *              If the refresh also fails (expired / revoked), clears storage
 *              and hard-redirects to /login.
 */
import axios from 'axios';

const BASE_URL = '/api/v1';

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: inject access token ─────────────────────────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ── Response: silent refresh on 401 ──────────────────────────────────────────
let isRefreshing = false;
let refreshQueue = []; // pending requests waiting for new token

function processQueue(error, token = null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  refreshQueue = [];
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Only intercept 401s from our API that haven't already been retried.
    if (
      error.response?.status !== 401 ||
      original._retried ||
      original.url === '/auth/refresh' ||
      original.url === '/auth/login'
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue this request until the in-flight refresh resolves.
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers['Authorization'] = `Bearer ${token}`;
        return client(original);
      });
    }

    original._retried = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      isRefreshing = false;
      // Clear FIRST, exactly as the failed-refresh path below does. Leaving the
      // `user` object behind while redirecting is an infinite loop: LoginPage
      // sends an apparently-logged-in user straight back to /dashboard, whose
      // requests 401, which lands here again. The browser's navigation throttle
      // is the only thing that stops it, leaving the app parked on a page whose
      // every fetch has failed.
      clearAuthStorage();
      processQueue(error, null);
      redirectToLogin();
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      });

      localStorage.setItem('access_token',  data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);

      // Keep the displayed role honest. The stored user object is what the UI
      // reads, and it used to survive a refresh untouched — so if the refreshed
      // token came back with a different role, the screen went on showing the
      // old one. That is how a silently-lost role switch stayed invisible until
      // an action failed with an unrelated-sounding error.
      //
      // The server decides the role; this only stops the UI contradicting it.
      try {
        const claims = JSON.parse(atob(data.access_token.split('.')[1]));
        const stored = JSON.parse(localStorage.getItem('user') || 'null');
        if (stored && claims?.role && stored.role !== claims.role) {
          localStorage.setItem('user', JSON.stringify({ ...stored, role: claims.role }));
          // A role change mid-session alters what the user may do, and the
          // React tree is holding the old value. Reload rather than leave a
          // stale menu that offers actions the token will now refuse.
          window.location.reload();
          return Promise.reject(new Error('Session role changed; reloading.'));
        }
      } catch {
        // A malformed token is the refresh path's problem, not this block's.
      }

      client.defaults.headers['Authorization'] = `Bearer ${data.access_token}`;
      original.headers['Authorization']        = `Bearer ${data.access_token}`;

      processQueue(null, data.access_token);
      isRefreshing = false;

      return client(original);
    } catch (refreshError) {
      processQueue(refreshError, null);
      isRefreshing = false;
      clearAuthStorage();
      redirectToLogin();
      return Promise.reject(refreshError);
    }
  }
);

function clearAuthStorage() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

function redirectToLogin() {
  // Hard redirect — clears React state completely.
  window.location.href = '/login';
}

export default client;
