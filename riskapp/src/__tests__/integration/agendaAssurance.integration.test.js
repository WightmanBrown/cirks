'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The SWG agenda's assurance section carries the findings CIRKS derives
// (docs/assurance-findings.md §7). It used to be one hardcoded line ending
// "…audit findings" with nothing behind it. Now each finding type gets one
// headline line with its count, pushed even when nothing is outstanding.
//
// This is also the first test that calls POST /meetings/:id/agenda/generate
// against a real database at all.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

let meetingId, mandatoryId, assetId, actionId;

const generate = () => request(app)
  .post(`/api/v1/meetings/${meetingId}/agenda/generate`)
  .set('Authorization', `Bearer ${tokenFor('secretary')}`);

const assuranceItems = async () => (await query(
  `SELECT title, entity_type, entity_id, notes FROM meeting_agenda_items
    WHERE meeting_id = $1 AND category = 'assurance' ORDER BY order_index`, [meetingId])).rows;

beforeAll(async () => {
  meetingId = (await query(
    `INSERT INTO working_group_meetings (meeting_date, chaired_by, secretary_user_id, planned_at, planned_by)
     VALUES (CURRENT_DATE + 30, $1, $2, now(), $2) RETURNING id`,
    [USERS.ciso.id, USERS.secretary.id])).rows[0].id;
  mandatoryId = (await query(
    `INSERT INTO impact_tables (name, scope, department_id, mandatory, published_at)
     VALUES ('AGENDA mandatory', 'organisation', $1, TRUE, now()) RETURNING id`, [IT_DEPT])).rows[0].id;
  assetId = (await query(
    `INSERT INTO information_assets (name, department_id, owner_user_id) VALUES ('AGENDA asset', $1, $2) RETURNING id`,
    [IT_DEPT, USERS.owner.id])).rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM meeting_agenda_items WHERE meeting_id = $1`, [meetingId]);
  await query(`DELETE FROM audit_log WHERE entity_id = $1`, [meetingId]);
  await query(`DELETE FROM working_group_meetings WHERE id = $1`, [meetingId]);
  if (actionId) await query(`DELETE FROM security_actions WHERE id = $1`, [actionId]);
  await query(`DELETE FROM information_assets WHERE id = $1`, [assetId]);
  await query(`DELETE FROM impact_tables WHERE id = $1`, [mandatoryId]);
});

test('the standing line no longer promises audit findings it does not carry', async () => {
  expect((await generate()).status).toBe(200);
  const items = await assuranceItems();
  expect(items[0].title).toBe('Assurance reports — HR training compliance, phishing sims, patching');
  expect(items.some(i => /audit findings/.test(i.title))).toBe(false);
});

test('the rating finding is one headline line whose count is the derived finding', async () => {
  const { rows: [f] } = await query(`
    SELECT COUNT(*)::int AS total,
           (SELECT COUNT(*) FROM information_assets WHERE is_active)::int AS assets
      FROM v_asset_rating_findings`);
  expect(f.total).toBeGreaterThanOrEqual(1);   // at least our asset

  const line = (await assuranceItems()).find(i => i.entity_type === 'finding:rating_incomplete');
  expect(line.title).toContain(`${f.total} of ${f.assets}`);
  expect(line.title).toContain('0 with an action raised, 0 accepted');
  expect(line.entity_id).toBeNull();           // a set, not a row
  expect(line.notes).toMatch(/understated/);
});

test('raising an action is reflected on regeneration', async () => {
  const res = await request(app).post(`/api/v1/findings/rating-incomplete/${assetId}/actions`)
    .set('Authorization', `Bearer ${tokenFor('ciso')}`).send({});
  expect(res.status).toBe(201);
  actionId = res.body.action_id;

  expect((await generate()).status).toBe(200);
  const line = (await assuranceItems()).find(i => i.entity_type === 'finding:rating_incomplete');
  expect(line.title).toContain('1 with an action raised, 0 accepted');
});

test('the SoA finding line is present, counted from the derived view', async () => {
  const { rows: [s] } = await query(`SELECT COUNT(*)::int AS total FROM v_soa_findings`);
  const line = (await assuranceItems()).find(i => i.entity_type === 'finding:soa');
  expect(line).toBeDefined();
  expect(line.title).toContain(s.total === 0 ? 'none outstanding' : `${s.total} across`);
});

test('a finding with nothing outstanding still gets a line — the minute is the evidence', async () => {
  // Clear this test's contribution; the seed may hold none of its own.
  await query(`UPDATE impact_tables SET mandatory = FALSE WHERE id = $1`, [mandatoryId]);
  const { rows: [f] } = await query(`SELECT COUNT(*)::int AS total FROM v_asset_rating_findings`);
  expect((await generate()).status).toBe(200);
  const line = (await assuranceItems()).find(i => i.entity_type === 'finding:rating_incomplete');
  expect(line).toBeDefined();
  if (f.total === 0) expect(line.title).toMatch(/none outstanding/);
});
