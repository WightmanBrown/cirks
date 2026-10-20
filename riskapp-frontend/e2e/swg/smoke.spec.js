// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test, expect } from '../support/fixtures.js';
import { loginAs, apiToken } from '../support/auth.js';

// Harness sanity check: the test stack boots, the seed is live, and login works.
test.describe('harness smoke', () => {
  test('secretary can log in and reach the app', async ({ page }) => {
    await loginAs(page, 'secretary');
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('seed baseline is present via API', async ({ request }) => {
    const token = await apiToken(request, 'secretary');
    const res = await request.get('/api/v1/meetings', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Seed has three meetings: one open, one closed-unissued, one minutes-issued.
    expect(body.count).toBe(3);
  });
});
