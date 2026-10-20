// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test, expect } from '../support/fixtures.js';
import { loginAs, apiToken } from '../support/auth.js';
import { MEETINGS } from '../support/constants.js';

// The seed dates its meetings RELATIVE to today (next = +30d, issued = -60d) so
// the fixture can never expire; compute the same here rather than hardcoding.
const dateAt = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
};
const ymd = (offsetDays) => dateAt(offsetDays).toISOString().slice(0, 10);
// SwgSummaryWidget formats with en-GB {day:'numeric', month:'short', year:'numeric'}.
const uiDate = (offsetDays) =>
  dateAt(offsetDays).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });


// Issued SWG minutes are visible to every authenticated console user — including
// information_asset_owner, who has no access to the meetings subsystem itself. The widget
// surfaces the next meeting (with iCal) and a link to the latest sealed minutes.
test.describe('SWG minutes visibility — all roles', () => {
  test('information_asset_owner is blocked from meetings but can read the SWG summary', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request, 'business')}` };

    const meetings = await request.get('/api/v1/meetings', { headers });
    expect(meetings.status(), 'full meetings list stays blocked').toBe(403);

    const summary = await request.get('/api/v1/meetings/swg-summary', { headers });
    expect(summary.ok(), `swg-summary → ${summary.status()}`).toBeTruthy();
    const body = await summary.json();
    expect(body.next_meeting?.meeting_date).toBe(ymd(30));
    expect(body.latest_minutes?.meeting_date).toBe(ymd(-60));
  });

  test('published minutes are readable by a non-meetings role; unissued 404s', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request, 'iam')}` };

    const issued = await request.get('/api/v1/meetings/swg-summary', { headers });
    const latestId = (await issued.json()).latest_minutes.id;

    const minutes = await request.get(`/api/v1/meetings/${latestId}/published-minutes`, { headers });
    expect(minutes.ok()).toBeTruthy();
    expect((await minutes.json()).minutes.minutes_body).toContain('SWG minutes');

    // The closed-but-unissued meeting has no published minutes.
    const unissued = await request.get(`/api/v1/meetings/${MEETINGS.closedUnissued}/published-minutes`, { headers });
    expect(unissued.status()).toBe(404);
  });

  test('iCal endpoint returns a calendar invite for the next meeting', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request, 'consultant')}` };
    const summary = await request.get('/api/v1/meetings/swg-summary', { headers });
    const nextId = (await summary.json()).next_meeting.id;

    const ics = await request.get(`/api/v1/meetings/${nextId}/calendar.ics`, { headers });
    expect(ics.ok()).toBeTruthy();
    expect(ics.headers()['content-type']).toContain('text/calendar');
    const text = await ics.text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain(`DTSTART;VALUE=DATE:${ymd(30).replace(/-/g, '')}`);
  });

  test('information_asset_owner dashboard widget links through to the sealed minutes', async ({ page }) => {
    await loginAs(page, 'business');
    await expect(page.getByText('Security Working Group')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: uiDate(-60) }).click();
    await page.waitForURL(/\/swg\/minutes\//);
    await expect(page.getByText(/Sealed — formal record/i)).toBeVisible();
    await expect(page.getByText(/SWG minutes — sealed record/)).toBeVisible();
  });
});
