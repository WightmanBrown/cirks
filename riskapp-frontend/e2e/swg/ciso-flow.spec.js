// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { test, expect } from '../support/fixtures.js';
import { loginAs, apiToken } from '../support/auth.js';
import { ACTIONS, RISKS, MEETINGS } from '../support/constants.js';

// CISO-side SWG responsibilities: ACCEPT a proposed action (freezing its items
// and snapshotting the risk baseline), read a meeting pack, and validate a
// pending risk (CISO-only). There is no verification queue since v97 — an action
// finishes when its last remediation item completes, on the risk.
test.describe('SWG flow — CISO', () => {
  test('accepts a proposed action from the acceptance queue', async ({ page, request }) => {
    await loginAs(page, 'ciso');
    await page.goto('/acceptance-queue');

    const row = page.getByText('Roll out MFA to HR system');
    await expect(row).toBeVisible();

    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await page.getByRole('button', { name: /Confirm acceptance/ }).click();

    // Accepted actions leave the proposed queue.
    await expect(page.getByText('Roll out MFA to HR system')).toBeHidden({ timeout: 10000 });

    // Backend: the action is planned, and the risk baseline was snapshotted.
    const headers = { Authorization: `Bearer ${await apiToken(request, 'ciso')}` };
    const res = await request.get(`/api/v1/risks/${RISKS.validatedB}/actions`, { headers });
    const actions = await res.json();
    const action = actions.find(a => a.id === ACTIONS.proposed);
    expect(action.status).toBe('planned');
    expect(action.accepted_at).toBeTruthy();
    expect(action.baseline).not.toBeNull();
  });

  test('sees open remediation items on the roll-up page', async ({ page }) => {
    await loginAs(page, 'ciso');
    await page.goto('/remediation');
    await expect(page.getByRole('heading', { name: /Remediation roll-up/i })).toBeVisible();
  });

  test('can read the meeting pack for the open meeting', async ({ page }) => {
    await loginAs(page, 'ciso');
    await page.goto(`/meetings/${MEETINGS.open}`);
    // Pack/agenda content for the open meeting is visible to the CISO.
    await expect(page.getByText(/Validate:|Accept:|Adopt:|Progress:|Agenda|Pack/i).first()).toBeVisible({ timeout: 10000 });
  });

  // Regression: the pack query joined threats/systems off risk_exceptions
  // directly (re.threat_id), which doesn't exist — it must hop through risks.
  // Assert the exception agenda item resolves its threat/system names.
  test('pack resolves risk-exception threat + system (join regression)', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request, 'ciso')}` };
    const res = await request.get(`/api/v1/meetings/${MEETINGS.open}/pack`, { headers });
    expect(res.ok(), `pack → ${res.status()}`).toBeTruthy();
    const pack = await res.json();
    const all = [...(pack.your_prep ?? []), ...(pack.read_in_advance ?? []), ...(pack.full_agenda ?? [])];
    const exceptionItem = all.find(i => i.entity_type === 'risk_exception');
    expect(exceptionItem, 'exception item present in pack').toBeTruthy();
    expect(exceptionItem.exception_data?.threat_name).toBe('Phishing Attack');
    expect(exceptionItem.exception_data?.system_name).toBe('HR System');
  });

  test('validates a pending risk (CISO-only)', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request, 'ciso')}` };
    const res = await request.post(`/api/v1/governance/risks/${RISKS.pending}/validate`,
      { headers, data: { action: 'validate' } });
    expect(res.ok(), `validate → ${res.status()}`).toBeTruthy();

    const check = await request.get(`/api/v1/risks/${RISKS.pending}`, { headers });
    const risk = await check.json();
    expect(risk.validation_status).toBe('validated');
  });
});
