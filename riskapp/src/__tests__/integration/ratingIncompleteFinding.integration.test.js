'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The first finding carried end to end (v134, docs/assurance-findings.md):
// an asset not rated against every mandatory impact table.
//
//   derive  — GET /findings/rating-incomplete, closes itself when fixed
//   raise   — POST /findings/rating-incomplete/:assetId/actions (findings.act,
//             own department for IAM/IAO)
//   accept  — POST /actions/:id/accept (actions.adopt, as for a risk action)
//   finish  — POST /actions/:id/complete, REFUSED while the finding holds
//             (owner's ruling 2026-09-28: done means fixed), by trigger so a
//             hand-run UPDATE is refused too

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');
const { _setDepartmentIsolation } = require('../../auth/permissions');

let mandatoryId, otherDept, assetId, otherAssetId, actionId;
const MANDATORY = 'FINDING mandatory table';

const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const findings = async (role = 'ciso') => {
  const res = await request(app).get('/api/v1/findings/rating-incomplete').set(as(role));
  expect(res.status).toBe(200);
  return res.body.findings;
};
const raise = (role, id = assetId, body = {}) =>
  request(app).post(`/api/v1/findings/rating-incomplete/${id}/actions`).set(as(role)).send(body);
const accept = (role, id = actionId) => request(app).post(`/api/v1/actions/${id}/accept`).set(as(role));
const complete = (role, id = actionId) => request(app).post(`/api/v1/actions/${id}/complete`).set(as(role));

beforeAll(async () => {
  _setDepartmentIsolation(true);
  mandatoryId = (await query(
    `INSERT INTO impact_tables (name, scope, department_id, mandatory, published_at)
     VALUES ($1, 'organisation', $2, TRUE, now()) RETURNING id`, [MANDATORY, IT_DEPT])).rows[0].id;
  otherDept = (await query(`INSERT INTO departments (name) VALUES ('FINDING Other Dept') RETURNING id`)).rows[0].id;
  const mk = async (name, dept) => (await query(
    `INSERT INTO information_assets (name, department_id, owner_user_id, confidentiality, integrity, availability)
     VALUES ($1, $2, $3, 1, 1, 1) RETURNING id`, [name, dept, USERS.owner.id])).rows[0].id;
  assetId      = await mk('FINDING asset', IT_DEPT);
  otherAssetId = await mk('FINDING other asset', otherDept);
});

afterAll(async () => {
  await query(`DELETE FROM security_actions WHERE subject_id = ANY($1)`, [[assetId, otherAssetId]]);
  await query(`DELETE FROM asset_impact_ratings WHERE asset_id = ANY($1)`, [[assetId, otherAssetId]]);
  await query(`DELETE FROM impact_table_cia_levels WHERE impact_table_id = $1`, [mandatoryId]);
  await query(`DELETE FROM information_assets WHERE id = ANY($1)`, [[assetId, otherAssetId]]);
  await query(`DELETE FROM impact_tables WHERE id = $1`, [mandatoryId]);
  await query(`DELETE FROM departments WHERE id = $1`, [otherDept]);
  _setDepartmentIsolation(true);
});

describe('the finding is derived', () => {
  test('an unrated asset is a finding, naming the mandatory table it misses', async () => {
    const f = (await findings()).find(x => x.asset_id === assetId);
    expect(f).toMatchObject({ band: 'never_rated', action_id: null });
    expect(f.missing_table_names).toContain(MANDATORY);
  });

  test('an IAO sees their own department\'s findings and not another\'s', async () => {
    const ids = (await findings('owner')).map(x => x.asset_id);
    expect(ids).toContain(assetId);
    expect(ids).not.toContain(otherAssetId);
  });
});

describe('who may raise an action', () => {
  test('a role without findings.act cannot (admin, secretary)', async () => {
    expect((await raise('admin')).status).toBe(403);
    expect((await raise('secretary')).status).toBe(403);
  });

  test('an IAO cannot raise one on another department\'s asset', async () => {
    expect((await raise('owner', otherAssetId)).status).toBe(403);
    expect((await raise('iam', otherAssetId)).status).toBe(403);
  });

  test('the asset\'s IAO raises a proposed action, owned by the asset owner by default', async () => {
    const res = await raise('owner');
    expect(res.status).toBe(201);
    actionId = res.body.action_id;
    const { rows } = await query(
      `SELECT subject_type, subject_id, origin, status, primary_owner_user_id, title, description
         FROM security_actions WHERE id = $1`, [actionId]);
    expect(rows[0]).toMatchObject({
      subject_type: 'asset', subject_id: assetId, origin: 'rating_incomplete',
      status: 'proposed', primary_owner_user_id: USERS.owner.id,
    });
    expect(rows[0].description).toContain(MANDATORY);
    const f = (await findings()).find(x => x.asset_id === assetId);
    expect(f.action_id).toBe(actionId);
  });

  test('a second action on the same finding is refused, pointing at the first', async () => {
    const res = await raise('ciso');
    expect(res.status).toBe(409);
    expect(res.body.action_id).toBe(actionId);
  });
});

describe('accepting and completing it', () => {
  test('it cannot be completed before it is accepted', async () => {
    expect((await complete('owner')).status).toBe(409);
  });

  test('acceptance is actions.adopt, as for a risk action', async () => {
    expect((await accept('analyst')).status).toBe(403);
    expect((await accept('ciso')).status).toBe(200);
    expect((await accept('ciso')).status).toBe(409); // no longer proposed
  });

  test('a risk action is not accepted or completed through the subject routes', async () => {
    const { rows } = await query(`SELECT id FROM security_actions WHERE subject_type = 'risk' LIMIT 1`);
    expect((await accept('ciso', rows[0].id)).status).toBe(409);
    expect((await complete('ciso', rows[0].id)).status).toBe(409);
  });

  test('only the owner, CISO, a risk analyst or an admin may complete it', async () => {
    expect((await complete('secretary')).status).toBe(403);
  });

  test('done means fixed: completion is refused while the table is still unrated', async () => {
    const res = await complete('owner');
    expect(res.status).toBe(409);
    expect(res.body.error).toContain(MANDATORY);
  });

  test('a hand-run UPDATE is refused too — the rule lives in the database', async () => {
    await expect(query(`UPDATE security_actions SET status = 'completed' WHERE id = $1`, [actionId]))
      .rejects.toThrow(/still not rated against/);
  });

  test('LINKING the table without rating it closes nothing', async () => {
    // POST /assets/:id/impact-tables writes a level-less row. It contributes
    // nothing to impact, so it must not count as rated — or linking alone
    // would close the action on an asset nobody rated.
    const linked = await request(app).post(`/api/v1/assets/${assetId}/impact-tables`).set(as('ciso'))
      .send({ table_ids: [mandatoryId] });
    expect(linked.status).toBeLessThan(300);
    const { rows } = await query(
      `SELECT rated_level FROM asset_impact_ratings WHERE asset_id = $1 AND impact_table_id = $2`,
      [assetId, mandatoryId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].rated_level).toBeNull();

    const f = (await findings()).find(x => x.asset_id === assetId);
    expect(f).toMatchObject({ band: 'never_rated' });
    expect((await complete('owner')).status).toBe(409);
  });

  test('once the asset is rated the finding closes itself and the action completes', async () => {
    const rated = await request(app).put(`/api/v1/assets/${assetId}/rate`).set(as('ciso'))
      .send({ ratings: [{ impact_table_id: mandatoryId, level: 2 }] });
    expect(rated.status).toBe(204);
    expect((await findings()).map(x => x.asset_id)).not.toContain(assetId);

    expect((await complete('owner')).status).toBe(200);
    const { rows } = await query(
      `SELECT status, completed_by FROM security_actions WHERE id = $1`, [actionId]);
    expect(rows[0]).toMatchObject({ status: 'completed', completed_by: USERS.owner.id });
  });

  test('with nothing missing there is nothing to raise an action against', async () => {
    const res = await raise('ciso');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/nothing to act on/);
  });
});
