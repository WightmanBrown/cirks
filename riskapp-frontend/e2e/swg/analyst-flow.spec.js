// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test, expect } from '../support/fixtures.js';
import { loginAs, apiToken } from '../support/auth.js';
import { RISKS, USERS } from '../support/constants.js';

// The risk analyst feeds the SWG: they read meetings and BUILD actions from a
// risk's coverage gap, which then surface to the acceptors (CISO/SIRO) in the
// acceptance queue. The analyst themselves cannot reach that queue (covered in
// rbac-negative). Free-form authoring was retired in v97 — an action can only be
// assembled from the gap, so actions and the gap can never disagree.
test.describe('SWG flow — risk analyst', () => {
  test('can read the meetings list', async ({ page }) => {
    await loginAs(page, 'analyst');
    await page.goto('/meetings');
    await expect(page.getByText(/SWG Meeting|Meetings/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('builds an action from the gap that surfaces in the acceptance queue', async ({ request }) => {
    const analystHeaders = { Authorization: `Bearer ${await apiToken(request, 'analyst')}` };

    // The gap for validated risk B: threat-linked controls not operational on the
    // HR system. The seed deploys no controls, so every linked control is a gap.
    const cand = await request.get(`/api/v1/risks/${RISKS.validatedB}/action-items/candidates`,
      { headers: analystHeaders });
    expect(cand.ok(), `candidates → ${cand.status()}`).toBeTruthy();
    const { controls } = await cand.json();
    expect(controls.length, 'the seeded threat has control_threats links').toBeGreaterThan(0);

    const pick = controls.find(c => !c.already_in_open_action) ?? controls[0];
    const create = await request.post(`/api/v1/risks/${RISKS.validatedB}/actions/from-gap`, {
      headers: analystHeaders,
      data: {
        title: 'Analyst-built: close the AD control gap',
        items: [{
          element_type: 'control',
          control_id: pick.control_id,
          system_id: pick.system_id,
          target_p_c: 2, target_p_i: 2, target_p_a: 2,
        }],
      },
    });
    expect(create.ok(), `from-gap → ${create.status()}`).toBeTruthy();
    expect((await create.json()).item_count).toBe(1);

    // It surfaces to the acceptors: the CISO sees it, with its item summary.
    const cisoHeaders = { Authorization: `Bearer ${await apiToken(request, 'ciso')}` };
    const queue = await request.get('/api/v1/actions/acceptance-queue', { headers: cisoHeaders });
    expect(queue.ok()).toBeTruthy();
    const body = await queue.json();
    const mine = body.actions.find(a => a.action_title === 'Analyst-built: close the AD control gap');
    expect(mine, 'the new action is in the acceptance queue').toBeTruthy();
    expect(Number(mine.item_count)).toBe(1);
  });

  test('the retired free-form propose endpoint is gone', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request, 'analyst')}` };
    const res = await request.post(`/api/v1/risks/${RISKS.validatedB}/actions`, {
      headers, data: { title: 'x', description: 'y', treatment_type: 'mitigate', owner_id: USERS.business.id },
    });
    expect(res.status(), 'POST /risks/:id/actions was retired in v97').toBe(404);
  });
});
