'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A duplicate risk is a redirection, not a failure.
//
// `POST /risks` 409s when a risk already exists for the (system, threat) pair —
// correct, but it used to say so without saying WHICH risk, which is a dead end:
// the analyst is told the work is already done somewhere they cannot see, and
// the only move left is to go back and change something. That recovery is how,
// while the creation wizard still surveyed controls, an analyst's corrections
// ended up on a system they then abandoned (2026-09-18).

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT = '33333333-0000-0000-0000-000000000001';
let systemId, firstRiskId;

const post = (body) => request(app)
  .post('/api/v1/risks')
  .set('Authorization', `Bearer ${tokenFor('analyst')}`)
  .send({ threat_id: THREAT, probability_c: 3, probability_i: 3, probability_a: 3, ...body });

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id, owner_user_id, impact_c, impact_i, impact_a)
     VALUES ('DUPLICATE system', $1, $2, 3, 3, 3) RETURNING id`, [IT_DEPT, USERS.owner.id]);
  systemId = s.rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM risks WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM system_threats WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
});

const gap = (riskId) => request(app)
  .get(`/api/v1/risks/gap?system_id=${systemId}&threat_id=${THREAT}`
       + (riskId ? `&risk_id=${riskId}` : ''))
  .set('Authorization', `Bearer ${tokenFor('analyst')}`);

describe('POST /risks on a pair that already has one', () => {
  it('creates the first one', async () => {
    const res = await post({ system_id: systemId, rationale: 'The first risk for this pair.' });
    expect(res.status).toBe(201);
    firstRiskId = res.body.id;
    expect(firstRiskId).toBeTruthy();
  });

  it('refuses the second and names the risk standing in the way', async () => {
    const res = await post({ system_id: systemId, rationale: 'A second attempt at the same pair.' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
    // The part that turns a dead end into a destination.
    expect(res.body.existing_risk_id).toBe(firstRiskId);
  });

  it('still refuses, and still points somewhere, once the pair is retired and re-raised', async () => {
    await query(`UPDATE risks SET is_active = FALSE WHERE id = $1`, [firstRiskId]);
    const again = await post({ system_id: systemId, rationale: 'Raised again after retirement.' });
    expect(again.status).toBe(201);           // the partial unique index only binds active rows

    const dup = await post({ system_id: systemId, rationale: 'And once more.' });
    expect(dup.status).toBe(409);
    // It names the LIVE one, not the retired row — that is the risk to open.
    expect(dup.body.existing_risk_id).toBe(again.body.id);
  });
});

// Catching it at Register is too late: the analyst has written a rationale by
// then, and the only move a 409 leaves is to go back and change something. The
// wizard asks the moment a system and threat are both chosen, riding on the gap
// fetch it already makes.
describe('GET /risks/gap answers "is this pair already assessed?"', () => {
  it('is null while the pair is free', async () => {
    const fresh = await query(
      `INSERT INTO systems (name, department_id, owner_user_id, impact_c, impact_i, impact_a)
       VALUES ('UNASSESSED system', $1, $2, 2, 2, 2) RETURNING id`, [IT_DEPT, USERS.owner.id]);
    const res = await request(app)
      .get(`/api/v1/risks/gap?system_id=${fresh.rows[0].id}&threat_id=${THREAT}`)
      .set('Authorization', `Bearer ${tokenFor('analyst')}`);
    expect(res.status).toBe(200);
    expect(res.body.existing_risk_id).toBeNull();
    await query(`DELETE FROM systems WHERE id = $1`, [fresh.rows[0].id]);
  });

  it('names the live risk once the pair is assessed', async () => {
    const res = await gap();
    expect(res.status).toBe(200);
    expect(res.body.existing_risk_id).toBeTruthy();
  });

  // The coverage panel asks this same endpoint about the risk it is displaying.
  // Reporting that risk to itself would tell the analyst their own risk is a
  // duplicate of itself.
  it('does not report the risk that is doing the asking', async () => {
    const { rows } = await query(
      `SELECT id FROM risks WHERE system_id = $1 AND is_active = TRUE LIMIT 1`, [systemId]);
    const res = await gap(rows[0].id);
    expect(res.body.existing_risk_id).toBeNull();
  });
});
