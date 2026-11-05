'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The organisation's risk appetite (v171): the action threshold and the two
// acceptance limits, set by the SIRO or admin with a reason. Pinned here: the
// three stay in order, a change that would catch a risk marked "no action
// required" is refused naming it, every change is audited, and the threshold
// set here is the one the reports and the database rule use.

const { app, request, tokenFor, query } = require('./helpers');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const put = (role, body) => request(app).put('/api/v1/org/risk-appetite').set(auth(role)).send(body);
const SHIPPED = { action_threshold: 12, analyst_max: 11, owner_max: 19 };

let original;
beforeAll(async () => {
  ({ rows: [original] } = await query(
    `SELECT mandatory_action_score, exception_accept_analyst_max, exception_accept_owner_max FROM org_config`));
});
afterAll(async () => {
  await query(
    `UPDATE org_config SET mandatory_action_score = $1, exception_accept_analyst_max = $2, exception_accept_owner_max = $3,
            risk_appetite_reason = NULL, risk_appetite_set_by = NULL, risk_appetite_set_at = NULL`,
    [original.mandatory_action_score, original.exception_accept_analyst_max, original.exception_accept_owner_max]);
});

test('the SIRO and admin can read and set it; the CISO cannot', async () => {
  const { body } = await request(app).get('/api/v1/org/risk-appetite').set(auth('siro'));
  expect(body.appetite).toMatchObject({ action_threshold: expect.any(Number), analyst_max: expect.any(Number) });
  expect(Array.isArray(body.by_score)).toBe(true);
  expect((await put('ciso', { ...SHIPPED, reason: 'x' })).status).toBe(403);
  expect((await put('admin', { ...SHIPPED, reason: 'Shipped values' })).status).toBe(200);
});

test('the numbers must be whole scores, in order, with a reason', async () => {
  expect((await put('siro', { ...SHIPPED, action_threshold: 0, reason: 'x' })).status).toBe(400);
  expect((await put('siro', { ...SHIPPED, action_threshold: 12.5, reason: 'x' })).status).toBe(400);
  expect((await put('siro', { ...SHIPPED, analyst_max: 12, reason: 'x' })).status).toBe(400);
  expect((await put('siro', { ...SHIPPED, owner_max: 11, reason: 'x' })).status).toBe(400);
  expect((await put('siro', { ...SHIPPED, reason: '  ' })).status).toBe(400);
});

test('a change is saved with who and why, audited, and read by the reports', async () => {
  const res = await put('siro', { action_threshold: 15, analyst_max: 10, owner_max: 20, reason: 'Board appetite review' });
  expect(res.status).toBe(200);
  expect(res.body.appetite).toMatchObject({ action_threshold: 15, analyst_max: 10, owner_max: 20, reason: 'Board appetite review' });
  expect(res.body.appetite.set_by_name).toBeTruthy();
  const { rows: [a] } = await query(
    `SELECT human_narrative FROM audit_log WHERE entity_type = 'org_config' ORDER BY created_at DESC LIMIT 1`);
  expect(a.human_narrative).toMatch(/action threshold 12.*→ action threshold 15.*Board appetite review/);
  const ciso = await request(app).get('/api/v1/reports/ciso').set(auth('ciso'));
  expect(ciso.body.thresholds.action).toBe(15);
  await put('siro', { ...SHIPPED, reason: 'Back to the shipped values' });
});

describe('a risk marked "no action required"', () => {
  // The seed's risks all score 12 or more: raise the threshold above one of
  // them, mark it "no action required", then try to bring the threshold back.
  let riskId;
  beforeAll(async () => {
    expect((await put('siro', { action_threshold: 16, analyst_max: 15, owner_max: 19, reason: 'Test' })).status).toBe(200);
    ({ rows: [{ id: riskId }] } = await query(
      `SELECT id FROM risks WHERE is_active AND risk_score < 16 ORDER BY risk_score DESC LIMIT 1`));
    await query('UPDATE risks SET no_action_required = TRUE WHERE id = $1', [riskId]);
  });
  afterAll(async () => {
    await query('UPDATE risks SET no_action_required = FALSE WHERE id = $1', [riskId]);
    await put('siro', { ...SHIPPED, reason: 'Back to the shipped values' });
  });

  test('blocks a threshold that would catch it, and the refusal names it', async () => {
    const res = await put('siro', { ...SHIPPED, reason: 'Lower it' });
    expect(res.status).toBe(409);
    expect(res.body.conflicts.map((c) => c.risk_id)).toContain(riskId);
    const { rows: [o] } = await query('SELECT mandatory_action_score FROM org_config');
    expect(o.mandatory_action_score).toBe(16);
  });
});

test('the database refuses numbers out of order even without the app', async () => {
  await expect(query('UPDATE org_config SET exception_accept_analyst_max = 12')).rejects.toThrow(/risk_appetite_order/);
});
