// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test, expect } from '../support/fixtures.js';
import { loginAs, apiToken } from '../support/auth.js';
import { MEETINGS, USERS } from '../support/constants.js';

// Admin has read-all visibility and manages the meeting attendee list
// (canManageAttendees = secretary | admin), but is not the secretary that runs
// the close/issue machinery (covered in rbac-negative).
test.describe('SWG flow — admin', () => {
  test('can read the meetings list', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/meetings');
    await expect(page.getByText(/SWG Meeting|Meetings/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('manages the open meeting attendee list', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request, 'admin')}` };

    // The consultant is not yet an attendee on the open meeting (seed: ciso,
    // analyst, siro). Admin adds them.
    const add = await request.post(`/api/v1/meetings/${MEETINGS.open}/attendees`, {
      headers,
      data: { user_id: USERS.consultant.id, role_at_meeting: 'member' },
    });
    expect(add.status(), `add attendee → ${add.status()}`).toBe(201);

    // Confirm via the meeting detail that the attendee is now present.
    const res = await request.get(`/api/v1/meetings/${MEETINGS.open}`, { headers });
    const meeting = await res.json();
    const attendees = meeting.meeting?.attendees ?? meeting.attendees ?? [];
    const ids = attendees.map(a => a.user_id);
    expect(ids).toContain(USERS.consultant.id);
  });
});
