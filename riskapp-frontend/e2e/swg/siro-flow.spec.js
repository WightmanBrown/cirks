// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test, expect } from '../support/fixtures.js';
import { loginAs, apiToken } from '../support/auth.js';
import { MEETINGS } from '../support/constants.js';

// SIRO sits on the SWG: reads the meeting pack, can record decisions in the
// kiosk, and can see (and adopt from) the adoption queue. SIRO cannot run the
// secretary-only meeting machinery — that's covered in rbac-negative.
test.describe('SWG flow — SIRO', () => {
  test('can read the open meeting pack', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request, 'siro')}` };
    const res = await request.get(`/api/v1/meetings/${MEETINGS.open}/pack`, { headers });
    expect(res.ok(), `pack → ${res.status()}`).toBeTruthy();
    const pack = await res.json();
    const all = [...(pack.your_prep ?? []), ...(pack.read_in_advance ?? []), ...(pack.full_agenda ?? [])];
    expect(all.length).toBeGreaterThan(0);
  });

  test('records a decision in the kiosk', async ({ page }) => {
    await loginAs(page, 'siro');
    await page.goto(`/meetings/${MEETINGS.open}/run`);

    // Jump to the adoption decision item (a decision category) and record text.
    await page.getByRole('button', { name: /Adopt: Roll out MFA/ }).click();
    await page.locator('textarea').first().fill('SIRO endorses adoption of the MFA rollout.');
    await page.getByRole('button', { name: /Mark as discussed|Update|Update notes/ }).first().click();
    await expect(page.getByText(/1 decided/)).toBeVisible({ timeout: 10000 });
  });

  test('can see the acceptance queue', async ({ page }) => {
    await loginAs(page, 'siro');
    await page.goto('/acceptance-queue');
    await expect(page.getByText('Roll out MFA to HR system')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
  });
});
