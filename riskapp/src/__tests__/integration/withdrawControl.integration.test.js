'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Withdrawing a control from use (v131): one act, a required reason, a preview.
//
// The preview runs the real withdrawal and rolls it back, so the test that
// matters is that it says exactly what the act then does — and that the rollback
// leaves nothing behind.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const HR      = '44444444-0000-0000-0000-000000000002';
const AD      = '44444444-0000-0000-0000-000000000001';
const THREAT  = '33333333-0000-0000-0000-000000000001';
const RISK    = '66666666-0000-0000-0000-000000000003';   // HR System × that threat
const CISO    = '11111111-0000-0000-0000-000000000002';

const as = (role) => (r) => r.set('Authorization', `Bearer ${tokenFor(role)}`);
const ciso = as('ciso');

const riskProbability = async () => (await query(
  `SELECT probability_c || '/' || probability_i || '/' || probability_a AS p FROM risks WHERE id = $1`,
  [RISK])).rows[0].p;

let ctl, actionId, itemId;

beforeEach(async () => {
  const c = await query(
    `INSERT INTO controls (title, control_type, created_by, delivery)
     VALUES ('WITHDRAW hardware checks', 'preventive', $1, 'system') RETURNING id`, [CISO]);
  ctl = c.rows[0].id;
  await query(`INSERT INTO soa_entries (control_id, applicable, justification) VALUES ($1, TRUE, 'We check')`, [ctl]);
  await query(`INSERT INTO control_threats (control_id, threat_id, created_by) VALUES ($1, $2, $3)`, [ctl, THREAT, CISO]);
  for (const sys of [HR, AD]) {
    await query(`INSERT INTO system_controls (system_id, control_id, status, created_by)
                 VALUES ($1, $2, 'operational', $3)`, [sys, ctl, CISO]);
  }
  // A judged residual: this is what actually holds the risk down, and what
  // outlives the link if nobody clears it.
  await query(`INSERT INTO risk_control_probability (risk_id, control_id, probability_c, probability_i, probability_a, set_by)
               VALUES ($1, $2, 1, 1, 1, $3)`, [RISK, ctl, CISO]);
  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type, primary_owner_user_id, status)
     VALUES ('risk', 'risk_treatment', 'WITHDRAW action', 't', 'mitigate', $1, 'in_progress') RETURNING id`, [CISO]);
  actionId = a.rows[0].id;
  await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1, $2)`, [actionId, RISK]);
  const it = await query(
    `INSERT INTO security_action_items (action_id, system_id, element_type, control_id, change_kind, owner_user_id, status)
     VALUES ($1, $2, 'control', $3, 'control_improve', $4, 'pending') RETURNING id`, [actionId, HR, ctl, CISO]);
  itemId = it.rows[0].id;
});

afterEach(async () => {
  await query(`DELETE FROM security_action_notes WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_action_items WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [actionId]);
  await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  await query(`DELETE FROM audit_log WHERE entity_id = $1 OR changes->>'control_id' = $1::text`, [ctl]);
  await query(`DELETE FROM controls WHERE id = $1`, [ctl]);
});

describe('the preview', () => {
  it('reports what would go, and which risks would rise', async () => {
    const before = await riskProbability();
    expect(before).toBe('1/1/1');                       // the judged residual is holding it there

    const res = await ciso(request(app).get(`/api/v1/controls/${ctl}/withdrawal`));
    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.removed.systems.map(s => s.name).sort()).toEqual(['Active Directory', 'HR System']);
    expect(res.body.removed.threats).toHaveLength(1);
    expect(res.body.removed.judged_residuals).toBe(1);
    expect(res.body.removed.open_items).toBe(1);
    const moved = res.body.risks_moved.find(r => r.risk_id === RISK);
    expect(moved).toMatchObject({ before: '1/1/1', system: 'HR System' });
    expect(moved.after_score).toBeGreaterThan(moved.before_score);
  });

  it('changes nothing — it is rolled back', async () => {
    // Counted BEFORE: the v131 trigger records the SoA decision this fixture
    // makes, so "no audit rows at all" would be the wrong question.
    const auditedBefore = (await query(
      `SELECT count(*)::int AS n FROM audit_log WHERE entity_id = $1`, [ctl])).rows[0].n;
    await ciso(request(app).get(`/api/v1/controls/${ctl}/withdrawal`));
    expect(await riskProbability()).toBe('1/1/1');
    const rows = await query(`SELECT
        (SELECT count(*) FROM system_controls WHERE control_id = $1) AS systems,
        (SELECT count(*) FROM control_threats WHERE control_id = $1) AS threats,
        (SELECT count(*) FROM risk_control_probability WHERE control_id = $1) AS residuals,
        (SELECT count(*) FROM audit_log WHERE entity_id = $1) AS audited,
        (SELECT status FROM security_action_items WHERE id = $2) AS item_status`, [ctl, itemId]);
    expect(rows.rows[0]).toMatchObject({
      systems: '2', threats: '1', residuals: '1', audited: String(auditedBefore), item_status: 'pending' });
  });
});

describe('the act', () => {
  it('does exactly what the preview said', async () => {
    const preview = (await ciso(request(app).get(`/api/v1/controls/${ctl}/withdrawal`))).body;
    const done = (await ciso(request(app).post(`/api/v1/controls/${ctl}/withdraw`))
      .send({ reason: 'Attached in error — it does not counter this threat.' })).body;

    expect(done.removed.systems.map(s => s.name).sort()).toEqual(preview.removed.systems.map(s => s.name).sort());
    expect(done.removed.judged_residuals).toBe(preview.removed.judged_residuals);
    expect(done.risks_moved.map(r => [r.risk_id, r.before, r.after]))
      .toEqual(preview.risks_moved.map(r => [r.risk_id, r.before, r.after]));
  });

  it('removes the deployments, the threat links and the judged residuals', async () => {
    await ciso(request(app).post(`/api/v1/controls/${ctl}/withdraw`)).send({ reason: 'Attached in error.' });
    const { rows } = await query(`SELECT
        (SELECT count(*)::int FROM system_controls WHERE control_id = $1) AS systems,
        (SELECT count(*)::int FROM control_threats WHERE control_id = $1) AS threats,
        (SELECT count(*)::int FROM risk_control_probability WHERE control_id = $1) AS residuals`, [ctl]);
    expect(rows[0]).toEqual({ systems: 0, threats: 0, residuals: 0 });
  });

  it('withdraws the work planned against it, with a note, and keeps the item', async () => {
    await ciso(request(app).post(`/api/v1/controls/${ctl}/withdraw`)).send({ reason: 'Attached in error.' });
    const { rows } = await query(`SELECT status FROM security_action_items WHERE id = $1`, [itemId]);
    expect(rows[0].status).toBe('withdrawn');
    const notes = await query(`SELECT note FROM security_action_notes WHERE item_id = $1`, [itemId]);
    expect(notes.rows.length).toBeGreaterThan(0);
  });

  it('records the reason, and each system it came off', async () => {
    await ciso(request(app).post(`/api/v1/controls/${ctl}/withdraw`))
      .send({ reason: 'Attached in error — it does not counter this threat.' });
    const { rows } = await query(
      `SELECT entity_type, human_narrative FROM audit_log
        WHERE entity_id = $1 OR changes->>'control_id' = $1::text ORDER BY entity_type`, [ctl]);
    expect(rows.some(r => r.entity_type === 'control_objective' && /withdrawn from use/.test(r.human_narrative))).toBe(true);
    // One row per system it came off, so a system's own history reads correctly
    // without unpacking the summary.
    const perSystem = rows.filter(r => r.entity_type === 'system_controls');
    expect(perSystem).toHaveLength(2);
    expect(perSystem.every(r => /Attached in error/.test(r.human_narrative))).toBe(true);
    // The v121 unlink trigger writes its own row about the threat link. It is
    // about the unlink, not this reason, and it stays that way.
    expect(rows.some(r => r.entity_type === 'control_threats')).toBe(true);
  });

  it('actually moves the risk it said it would', async () => {
    const preview = (await ciso(request(app).get(`/api/v1/controls/${ctl}/withdrawal`))).body;
    await ciso(request(app).post(`/api/v1/controls/${ctl}/withdraw`)).send({ reason: 'Attached in error.' });
    expect(await riskProbability()).toBe(preview.risks_moved.find(r => r.risk_id === RISK).after);
  });
});

describe('what it refuses', () => {
  it('refuses without a reason', async () => {
    const res = await ciso(request(app).post(`/api/v1/controls/${ctl}/withdraw`)).send({ reason: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason is required/);
    expect((await query(`SELECT count(*)::int AS n FROM system_controls WHERE control_id = $1`, [ctl])).rows[0].n).toBe(2);
  });

  it('refuses a control delivered organisation-wide — that is an SoA decision', async () => {
    await query(`UPDATE controls SET delivery = 'organisation' WHERE id = $1`, [ctl]);
    for (const res of [
      await ciso(request(app).get(`/api/v1/controls/${ctl}/withdrawal`)),
      await ciso(request(app).post(`/api/v1/controls/${ctl}/withdraw`)).send({ reason: 'x' }),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Statement of Applicability decision/);
    }
  });

  it('is not open to a role that cannot write controls', async () => {
    const res = await as('owner')(request(app).post(`/api/v1/controls/${ctl}/withdraw`)).send({ reason: 'x' });
    expect(res.status).toBe(403);
    expect(USERS.owner.role).toBe('information_asset_owner');
  });

  it('404s for a control that does not exist', async () => {
    expect((await ciso(request(app).get('/api/v1/controls/99999999-0000-0000-0000-000000000000/withdrawal'))).status)
      .toBe(404);
  });
});
