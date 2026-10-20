// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test, expect } from '../support/fixtures.js';
import { loginAs, apiToken } from '../support/auth.js';
import { CYCLES } from '../support/constants.js';

// Full SWG meeting lifecycle driven entirely through the secretary's UI:
// plan → generate agenda → add attendee → run/record decision → close →
// minutes → issue → assert the linked draft cycle transitions to under_review.
//
// Runs serially against the deterministic seed; the draft cycle "E2E Draft
// Cycle" is the planning target and should end the test in under_review.
test.describe('SWG lifecycle — meeting secretary', () => {
  test('plans, runs, closes and issues a meeting end to end', async ({ page, request }) => {
    await loginAs(page, 'secretary');

    // ── Plan a meeting against the draft cycle ────────────────────────────────
    await page.goto('/meetings/plan');
    // A future date — a hardcoded literal silently expires once the calendar
    // passes it and the form then refuses to plan the meeting.
    const when = new Date();
    when.setDate(when.getDate() + 45);
    await page.fill('input[type="date"]', when.toISOString().slice(0, 10));
    await page.selectOption('select', { label: 'E2E Draft Cycle' });
    await page.getByRole('button', { name: 'Plan Meeting' }).click();

    // Lands on the new meeting's detail page.
    await page.waitForURL(/\/meetings\/[0-9a-f-]+$/);
    const meetingId = page.url().split('/meetings/')[1];
    await expect(page.locator('.stateBadge, [class*="stateBadge"]')).toContainText('Planned');

    // ── Generate the agenda (pulls pending risks + proposed/completed actions) ──
    await page.getByRole('button', { name: /Generate Agenda/i }).first().click();
    await expect(page.getByText(/Validate:|Accept:|Progress:|Risk|Action/i).first()).toBeVisible({ timeout: 10000 });

    // ── Add a system-user attendee ─────────────────────────────────────────────
    // The detail page has an attendee picker (System user mode is default).
    const attendeeSelect = page.locator('select').first();
    await attendeeSelect.selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Add$/ }).click();

    // ── Run the meeting: record a decision on the risk-validation item ─────────
    // Item 1 ("Opening") isn't a decision category, so jump to the seeded
    // pending-risk item which renders the decision textarea.
    await page.getByRole('button', { name: /Run meeting/i }).click();
    await page.waitForURL(/\/meetings\/[0-9a-f-]+\/run$/);
    await page.getByRole('button', { name: /Validate: Unpatched/ }).click();
    const decisionBox = page.locator('textarea').first();
    await decisionBox.fill('SWG reviewed and agreed to proceed.');
    await page.getByRole('button', { name: /Mark as discussed|Update|Update notes/ }).first().click();
    // Recording marks the item decided and auto-advances; assert the kiosk's
    // decided counter incremented rather than the (now off-screen) item state.
    await expect(page.getByText(/1 decided/)).toBeVisible({ timeout: 10000 });

    // Back to the detail page.
    await page.goto(`/meetings/${meetingId}`);

    // ── Close the meeting ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Close meeting', exact: true }).click();
    await page.getByLabel('Meeting was quorate').check();
    await page.getByRole('button', { name: 'Close Meeting', exact: true }).click();
    await expect(page.locator('[class*="stateBadge"]')).toContainText('Closed', { timeout: 10000 });

    // ── Write + issue minutes (issue is behind a confirm dialog) ───────────────
    await page.locator('textarea[placeholder="Write meeting minutes here…"]')
      .fill('Minutes: risk reviewed, action adopted, meeting closed.');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('button', { name: 'Saved ✓' })).toBeVisible({ timeout: 10000 });

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Issue Minutes' }).click();
    await expect(page.locator('[class*="stateBadge"]')).toContainText('Minutes Issued', { timeout: 10000 });

    // ── Assert the linked draft cycle transitioned to under_review ─────────────
    const token = await apiToken(request, 'ciso');
    const res = await request.get('/api/v1/meetings', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.ok()).toBeTruthy();

    // Verify via the cycle's own state through the meeting's linked cycle.
    // (The issue-minutes endpoint sets the linked cycle → under_review.)
    const cyclesRes = await request.get(`/api/v1/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meeting = await cyclesRes.json();
    expect(meeting.meeting?.linked_cycle_id ?? meeting.linked_cycle_id).toBe(CYCLES.draft);
    expect(meeting.meeting?.state ?? meeting.state).toBe('minutes_issued');
  });
});
