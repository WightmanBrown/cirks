// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { USERS, PASSWORD } from './constants.js';

// Log in through the real login form and wait for the post-login redirect.
// Seed users each hold a single role, so there's no /select-role gate.
export async function loginAs(page, roleKey) {
  const user = USERS[roleKey];
  if (!user) throw new Error(`Unknown seed role: ${roleKey}`);
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 10000 });
  return user;
}

// Get an access token via the API (for direct request-level checks / RBAC probes).
// Uses the page's request context so it shares the dev-server proxy.
export async function apiToken(request, roleKey) {
  const user = USERS[roleKey];
  if (!user) throw new Error(`Unknown seed role: ${roleKey}`);
  const res = await request.post('/api/v1/auth/login', {
    data: { email: user.email, password: PASSWORD },
  });
  if (!res.ok()) throw new Error(`Login failed for ${roleKey}: ${res.status()}`);
  const body = await res.json();
  return body.access_token;
}
