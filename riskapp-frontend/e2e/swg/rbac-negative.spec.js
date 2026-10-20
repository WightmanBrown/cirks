// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test, expect } from '../support/fixtures.js';
import { apiToken } from '../support/auth.js';
import { MEETINGS, RISKS } from '../support/constants.js';

// RBAC edges around the SWG flow, asserted at the API surface. These are the
// boundaries that are easy to regress and that the UI alone wouldn't catch
// (e.g. the secretary kiosk can record decisions but the role cannot reach the
// adoption queue, and only the CISO can validate a risk).
async function auth(request, role) {
  return { Authorization: `Bearer ${await apiToken(request, role)}` };
}

test.describe('SWG RBAC — negative', () => {
  // GET /actions/acceptance-queue — ciso, siro, admin only.
  test('acceptance queue is blocked for non-adopters', async ({ request }) => {
    for (const role of ['secretary', 'analyst', 'business', 'iam', 'consultant']) {
      const res = await request.get('/api/v1/actions/acceptance-queue', { headers: await auth(request, role) });
      expect(res.status(), `${role} → acceptance-queue`).toBe(403);
    }
    for (const role of ['ciso', 'siro', 'admin']) {
      const res = await request.get('/api/v1/actions/acceptance-queue', { headers: await auth(request, role) });
      expect(res.ok(), `${role} → acceptance-queue`).toBeTruthy();
    }
  });

  // Meeting close / issue-minutes / agenda-generate — meeting_secretary only.
  test('meeting write actions are blocked for non-secretaries', async ({ request }) => {
    for (const role of ['ciso', 'siro', 'analyst', 'admin']) {
      const headers = await auth(request, role);
      const close = await request.post(`/api/v1/meetings/${MEETINGS.open}/close`, { headers, data: {} });
      expect(close.status(), `${role} → close`).toBe(403);

      const issue = await request.post(`/api/v1/meetings/${MEETINGS.closedUnissued}/issue-minutes`, { headers, data: {} });
      expect(issue.status(), `${role} → issue-minutes`).toBe(403);

      const gen = await request.post(`/api/v1/meetings/${MEETINGS.open}/agenda/generate`, { headers, data: {} });
      expect(gen.status(), `${role} → agenda/generate`).toBe(403);
    }
  });

  // POST /governance/risks/:id/validate — ciso only (validate_risk is CISO-gated
  // at the DB level too; the secretary kiosk only records decision text).
  test('only the CISO can validate a risk', async ({ request }) => {
    for (const role of ['secretary', 'siro', 'analyst', 'admin', 'iam', 'business']) {
      const res = await request.post(`/api/v1/governance/risks/${RISKS.pending}/validate`,
        { headers: await auth(request, role), data: {} });
      expect(res.status(), `${role} → validate`).toBe(403);
    }
  });
});
