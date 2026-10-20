'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Rating completeness must be VISIBLE, since it is deliberately not enforced.
//
// A mandatory impact table applies to every information asset, with no
// exemptions (decision 2026-09-16, docs/reporting-requirements.md), and
// enforcement is soft: a partial save stays possible. That only works if the
// omission is surfaced — and it was not. `impact_tables.mandatory` was read in
// three places (blocking delete, blocking unpublish, display) and never where
// rating happens.
//
// It matters beyond tidiness: recomputeAssetCia takes MAX over whatever ratings
// exist, so a missing mandatory table can only UNDERSTATE the asset's CIA, which
// flows into systems.impact_* and every risk score on the system.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

let mandatoryId, optionalId, assetId;

const listRow = async (who = 'ciso') => {
  const res = await request(app).get('/api/v1/assets')
    .set('Authorization', `Bearer ${tokenFor(who)}`);
  expect(res.status).toBe(200);
  return res.body.find(a => a.id === assetId);
};

const rate = (tableId, level) => request(app).put(`/api/v1/assets/${assetId}/rate`)
  .set('Authorization', `Bearer ${tokenFor('ciso')}`)
  .send({ ratings: [{ impact_table_id: tableId, level }] });

beforeAll(async () => {
  const mk = async (name, mandatory) => (await query(
    `INSERT INTO impact_tables (name, scope, department_id, mandatory, published_at)
     VALUES ($1, 'organisation', $2, $3, now()) RETURNING id`,
    [name, IT_DEPT, mandatory])).rows[0].id;
  mandatoryId = await mk('COMPLETENESS mandatory', true);
  optionalId  = await mk('COMPLETENESS optional',  false);

  const a = await query(
    `INSERT INTO information_assets (name, department_id, confidentiality, integrity, availability)
     VALUES ('COMPLETENESS asset', $1, 1, 1, 1) RETURNING id`, [IT_DEPT]);
  assetId = a.rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM impact_table_cia_levels WHERE impact_table_id = ANY($1)`,
    [[mandatoryId, optionalId]]);
  await query(`DELETE FROM asset_impact_ratings WHERE asset_id = $1`, [assetId]);
  await query(`DELETE FROM information_assets WHERE id = $1`, [assetId]);
  await query(`DELETE FROM impact_tables WHERE id = ANY($1)`, [[mandatoryId, optionalId]]);
});

test('an unrated asset reports no mandatory coverage', async () => {
  const row = await listRow();
  expect(row.mandatory_tables_total).toBeGreaterThanOrEqual(1);
  expect(row.mandatory_tables_rated).toBe(0);
  expect(row.rated_tables_total).toBe(0);
});

// The dangerous state, and the one the UI previously showed as simply "rated".
test('rating only a NON-mandatory table leaves the asset partially rated', async () => {
  expect((await rate(optionalId, 3)).status).toBe(204);
  const row = await listRow();
  expect(row.rated_tables_total).toBe(1);        // it has been rated…
  expect(row.mandatory_tables_rated).toBe(0);    // …but covers no mandatory table
});

test('the save is NOT blocked — enforcement is deliberately soft', async () => {
  // Re-asserting the above as an explicit contract: a partial rating must be
  // accepted, or an IAO cannot save progress mid-assessment.
  expect((await rate(optionalId, 4)).status).toBe(204);
});

test('LINKING the mandatory table without rating it does not count as coverage', async () => {
  // Linking writes a level-less row, which contributes nothing to impact (v134).
  const res = await request(app).post(`/api/v1/assets/${assetId}/impact-tables`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`).send({ table_ids: [mandatoryId] });
  expect(res.status).toBeLessThan(300);
  expect((await listRow()).mandatory_tables_rated).toBe(0);
});

test('rating the mandatory table completes the coverage', async () => {
  expect((await rate(mandatoryId, 2)).status).toBe(204);
  const row = await listRow();
  expect(row.mandatory_tables_rated).toBe(row.mandatory_tables_total);
});

// The detail payload drives the rating panel, which must mark required tables.
test('GET /assets/:id carries `mandatory` on each applied impact table', async () => {
  const res = await request(app).get(`/api/v1/assets/${assetId}`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`);
  expect(res.status).toBe(200);
  const applied = res.body.impact_ratings;
  expect(applied.find(t => t.id === mandatoryId).mandatory).toBe(true);
  expect(applied.find(t => t.id === optionalId).mandatory).toBe(false);
});

// The understatement this exists to expose, demonstrated rather than asserted
// from the schema: adding the missing mandatory table can only RAISE the CIA, so
// leaving it out can only lower it — and that lower number is what reaches
// systems.impact_* and every risk score on the system.
test('omitting a mandatory table UNDERSTATES the asset CIA', async () => {
  // The derivation reads a per-dimension level, or the rated level when the
  // table has a CIA statement at that level — so the fixture needs statements.
  for (const id of [mandatoryId, optionalId]) {
    for (const lvl of [1, 2, 3, 4, 5]) {
      for (const dim of ['c', 'i', 'a']) {
        await query(
          `INSERT INTO impact_table_cia_levels (impact_table_id, level, dimension, statement)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [id, lvl, dim, `level ${lvl} ${dim}`]);
      }
    }
  }

  const a = await query(
    `INSERT INTO information_assets (name, department_id, confidentiality, integrity, availability)
     VALUES ('COMPLETENESS understated', $1, 1, 1, 1) RETURNING id`, [IT_DEPT]);
  const id = a.rows[0].id;
  const cia = async () => (await query(
    `SELECT confidentiality FROM information_assets WHERE id = $1`, [id])).rows[0].confidentiality;

  const rateOn = (tableId, level) => request(app).put(`/api/v1/assets/${id}/rate`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`)
    .send({ ratings: [{ impact_table_id: tableId, level }] });

  // Rated against the optional table alone: the asset looks like a 2.
  expect((await rateOn(optionalId, 2)).status).toBe(204);
  expect(await cia()).toBe(2);

  // The mandatory table it skipped would have scored it 5.
  expect((await rateOn(mandatoryId, 5)).status).toBe(204);
  expect(await cia()).toBe(5);

  await query(`DELETE FROM asset_impact_ratings WHERE asset_id = $1`, [id]);
  await query(`DELETE FROM information_assets WHERE id = $1`, [id]);
});
