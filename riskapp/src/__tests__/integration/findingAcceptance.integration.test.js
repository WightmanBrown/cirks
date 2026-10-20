'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Accepting a finding (v136, docs/assurance-findings.md §6): the other answer to
// a finding, recorded in the generalised `exceptions` table with the risk
// exception's lifecycle, authority, SoD rule and expiry sweep.
//
// Act and accept are alternatives — a finding has one answer, or none.

const { app, request, tokenFor, query, pool, USERS, IT_DEPT } = require('./helpers');

let mandatoryId, assetId, actedAssetId, exceptionId, actionId;
const MANDATORY = 'ACCEPT mandatory table';
const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const accept = (role, id = assetId, body = {}) =>
  request(app).post(`/api/v1/findings/rating-incomplete/${id}/exceptions`).set(as(role))
    .send({ justification: 'Rated at the next asset review', expires_at: future(90),
            review_cadence: 'quarterly', ...body });
const revoke = (role, id = exceptionId) =>
  request(app).patch(`/api/v1/findings/exceptions/${id}/revoke`).set(as(role)).send({ notes: 'no longer' });
const finding = async (id = assetId) => {
  const res = await request(app).get('/api/v1/findings/rating-incomplete').set(as('ciso'));
  return res.body.findings.find(f => f.asset_id === id);
};

beforeAll(async () => {
  mandatoryId = (await query(
    `INSERT INTO impact_tables (name, scope, department_id, mandatory, published_at)
     VALUES ($1, 'organisation', $2, TRUE, now()) RETURNING id`, [MANDATORY, IT_DEPT])).rows[0].id;
  const mk = async (name) => (await query(
    `INSERT INTO information_assets (name, department_id, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
    [name, IT_DEPT, USERS.owner.id])).rows[0].id;
  assetId      = await mk('ACCEPT asset');
  actedAssetId = await mk('ACCEPT acted asset');
});

afterAll(async () => {
  await query(`DELETE FROM audit_log WHERE entity_id IN (SELECT id FROM exceptions WHERE subject_id = ANY($1))`,
    [[assetId, actedAssetId]]);
  await query(`DELETE FROM exceptions WHERE subject_id = ANY($1)`, [[assetId, actedAssetId]]);
  await query(`DELETE FROM security_actions WHERE subject_id = ANY($1)`, [[assetId, actedAssetId]]);
  await query(`DELETE FROM information_assets WHERE id = ANY($1)`, [[assetId, actedAssetId]]);
  await query(`DELETE FROM impact_tables WHERE id = $1`, [mandatoryId]);
});

describe('the table is generalised, and a risk exception is unchanged', () => {
  test('existing risk exceptions read as risk treatment, with their risk', async () => {
    const { rows } = await query(
      `SELECT DISTINCT subject_type, origin, (risk_id IS NOT NULL) AS has_risk FROM exceptions`);
    expect(rows).toEqual([{ subject_type: 'risk', origin: 'risk_treatment', has_risk: true }]);
  });

  test('an acceptance about an asset cannot also carry a risk', async () => {
    const { rows: [r] } = await query(`SELECT id FROM risks LIMIT 1`);
    await expect(query(
      `INSERT INTO exceptions (subject_type, subject_id, origin, risk_id, justification, accepted_by,
                               accepted_role, expires_at, review_cadence)
       VALUES ('asset', $1, 'rating_incomplete', $2, 'x', $3, 'ciso', CURRENT_DATE + 30, 'quarterly')`,
      [assetId, r.id, USERS.ciso.id])).rejects.toThrow(/chk_exc_risk_id/);
  });
});

describe('accepting a finding', () => {
  test('is a governance act — an IAO or analyst cannot', async () => {
    expect((await accept('owner')).status).toBe(403);
    expect((await accept('analyst')).status).toBe(403);
  });

  test('a reason, a future date and a cadence are required', async () => {
    expect((await accept('ciso', assetId, { justification: ' ' })).status).toBe(400);
    expect((await accept('ciso', assetId, { expires_at: '2020-01-01' })).status).toBe(400);
    expect((await accept('ciso', assetId, { review_cadence: 'weekly' })).status).toBe(400);
  });

  test('the CISO accepts it until a date; it shows with the finding', async () => {
    const res = await accept('ciso');
    expect(res.status).toBe(201);
    exceptionId = res.body.id;
    const f = await finding();
    expect(f).toMatchObject({ exception_id: exceptionId, action_id: null });
    expect(f.exception_justification).toBe('Rated at the next asset review');
  });

  test('it is accepted once; and while accepted, no action can be raised', async () => {
    expect((await accept('siro')).status).toBe(409);
    const raised = await request(app).post(`/api/v1/findings/rating-incomplete/${assetId}/actions`)
      .set(as('ciso')).send({});
    expect(raised.status).toBe(409);
    expect(raised.body.error).toMatch(/accepted/);
  });

  test('a finding being acted on cannot also be accepted', async () => {
    const raised = await request(app).post(`/api/v1/findings/rating-incomplete/${actedAssetId}/actions`)
      .set(as('ciso')).send({});
    expect(raised.status).toBe(201);
    actionId = raised.body.action_id;
    const res = await accept('ciso', actedAssetId);
    expect(res.status).toBe(409);
    expect(res.body.action_id).toBe(actionId);
  });
});

describe('revoking it', () => {
  test('is exceptions.revoke — an analyst cannot', async () => {
    expect((await revoke('analyst')).status).toBe(403);
  });

  test('the SIRO revokes it, it is audited, and the finding is unanswered again', async () => {
    expect((await revoke('siro')).status).toBe(200);
    expect((await revoke('siro')).status).toBe(409);
    const { rows } = await query(
      `SELECT human_narrative FROM audit_log WHERE entity_type = 'exceptions' AND entity_id = $1`, [exceptionId]);
    expect(rows[0].human_narrative).toMatch(/revoked the acceptance/);
    expect((await finding()).exception_id).toBeNull();
  });

  test('a risk exception is not revoked through this route', async () => {
    const { rows: [e] } = await query(`SELECT id FROM exceptions WHERE subject_type = 'risk' LIMIT 1`);
    expect((await revoke('ciso', e.id)).status).toBe(409);
  });
});

describe('expiry and separation of duties are shared with risk exceptions', () => {
  test('the sweep expires an accepted finding, and it re-surfaces unanswered', async () => {
    const res = await accept('ciso');
    expect(res.status).toBe(201);
    // Backdate both ends so the CHECK (expires_at >= accepted_at) still holds.
    await query(`UPDATE exceptions SET accepted_at = now() - interval '10 days',
                                       expires_at = CURRENT_DATE - 1 WHERE id = $1`, [res.body.id]);
    await query(`SELECT expire_overdue_exceptions()`);
    const { rows: [e] } = await query(`SELECT status, escalated_at FROM exceptions WHERE id = $1`, [res.body.id]);
    expect(e.status).toBe('expired');
    expect(e.escalated_at).not.toBeNull();
    const { rows: audit } = await query(
      `SELECT human_narrative FROM audit_log WHERE entity_type = 'exceptions' AND entity_id = $1`, [res.body.id]);
    expect(audit[0].human_narrative).toMatch(/auto-expired.*open again/);
    expect((await finding()).exception_id).toBeNull();
  });

  test('when the SoD rule is on, the asset\'s own department owner cannot accept it', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`UPDATE sod_rules SET enabled = TRUE WHERE key = 'exception.accept'`);
      await expect(c.query(
        `INSERT INTO exceptions (subject_type, subject_id, origin, justification, accepted_by,
                                 accepted_role, expires_at, review_cadence)
         VALUES ('asset', $1, 'rating_incomplete', 'x', $2, 'ciso', CURRENT_DATE + 30, 'quarterly')`,
        [assetId, USERS.owner.id])).rejects.toThrow(/SoD\[exception\.accept\].*own asset/);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
