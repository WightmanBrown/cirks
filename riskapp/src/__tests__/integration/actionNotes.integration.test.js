'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The append-only note stream (0116). Progress used to be a single overwritten
// column with no author and no time; notes now accumulate, carry their author,
// and can be filed against one remediation item so the SWG can ask about the
// work on a particular control rather than the container.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const THREAT  = '33333333-0000-0000-0000-000000000001';
const CONTROL = '55555555-0000-0000-0000-000000000001';

let systemId, riskId, actionId, itemId, otherActionId, otherItemId;

const post = (id, body, who = 'ciso') => request(app)
  .patch(`/api/v1/actions/${id}/progress`)
  .set('Authorization', `Bearer ${tokenFor(who)}`).send(body);

const detail = (id = actionId, who = 'ciso') => request(app)
  .get(`/api/v1/actions/${id}`).set('Authorization', `Bearer ${tokenFor(who)}`);

async function makeAction(title) {
  const a = await query(
    `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type,
                                   primary_owner_user_id, status, accepted_at, accepted_by)
     VALUES ('risk', 'risk_treatment', $1, 'notes', 'mitigate', $2, 'in_progress', now(), $3) RETURNING id`,
    [title, USERS.owner.id, USERS.ciso.id]);
  await query(`INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1,$2)`,
    [a.rows[0].id, riskId]);
  const it = await query(
    `INSERT INTO security_action_items
       (action_id, system_id, element_type, control_id, change_kind, owner_user_id,
        target_p_c, target_p_i, target_p_a, status)
     VALUES ($1, $2, 'control', $3, $4, $5, 2, 2, 2, 'pending') RETURNING id`,
    [a.rows[0].id, systemId, CONTROL, 'control_add', USERS.owner.id]);
  return [a.rows[0].id, it.rows[0].id];
}

beforeAll(async () => {
  const s = await query(
    `INSERT INTO systems (name, department_id, owner_user_id, impact_c, impact_i, impact_a)
     VALUES ('NOTES system', $1, $2, 3, 3, 3) RETURNING id`, [IT_DEPT, USERS.owner.id]);
  systemId = s.rows[0].id;
  const r = await query(
    `INSERT INTO risks (system_id, threat_id, probability_c, probability_i, probability_a,
                        risk_score, rationale, validation_status)
     VALUES ($1,$2,4,4,4,1,'NOTES risk','validated') RETURNING id`, [systemId, THREAT]);
  riskId = r.rows[0].id;
  [actionId, itemId]           = await makeAction('NOTES action');
  [otherActionId, otherItemId] = await makeAction('NOTES other action');
});

afterAll(async () => {
  for (const a of [actionId, otherActionId]) {
    await query(`DELETE FROM security_action_notes WHERE action_id = $1`, [a]);
    await query(`DELETE FROM security_action_items WHERE action_id = $1`, [a]);
    await query(`DELETE FROM security_action_risks WHERE action_id = $1`, [a]);
    await query(`DELETE FROM security_actions WHERE id = $1`, [a]);
  }
  await query(`DELETE FROM risks WHERE id = $1`, [riskId]);
  await query(`DELETE FROM system_controls WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM system_components WHERE system_id = $1`, [systemId]);
  await query(`DELETE FROM systems WHERE id = $1`, [systemId]);
});

// The whole point: a second note must not erase the first.
test('notes ACCUMULATE rather than overwriting', async () => {
  expect((await post(actionId, { progress_notes: 'Vendor engaged.' })).status).toBe(200);
  expect((await post(actionId, { progress_notes: 'Change window booked.' })).status).toBe(200);

  const body = (await detail()).body;
  expect(body.notes.map(n => n.note)).toEqual(['Vendor engaged.', 'Change window booked.']);
  // Oldest first — a narrative is read forwards.
  expect(new Date(body.notes[0].created_at) <= new Date(body.notes[1].created_at)).toBe(true);
  // Compatibility: the old single field still returns the LATEST note.
  expect(body.progress_notes).toBe('Change window booked.');
});

test('each note records its author and their role', async () => {
  const { author } = (await detail()).body.notes[0];
  expect(author).toMatchObject({ user_id: USERS.ciso.id, role: 'ciso' });
});

test('a note can be filed against one item, and reaches that item only', async () => {
  expect((await post(actionId, { progress_notes: 'Agent deployed to 3 of 8 hosts.', item_id: itemId }))
    .status).toBe(200);

  const body = (await detail()).body;
  const item = body.items.find(i => i.id === itemId);
  expect(item.notes.map(n => n.note)).toEqual(['Agent deployed to 3 of 8 hosts.']);
  // The action-level stream excludes item notes, so nothing is reported twice.
  expect(body.notes.map(n => n.note)).not.toContain('Agent deployed to 3 of 8 hosts.');
});

test('an item belonging to a DIFFERENT action is refused with 400, not 500', async () => {
  const res = await post(actionId, { progress_notes: 'misfiled', item_id: otherItemId });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/does not belong/i);
});

test('a blank note is refused', async () => {
  for (const progress_notes of ['', '   ', undefined]) {
    expect((await post(actionId, { progress_notes })).status).toBe(400);
  }
});

// Append-only is enforced by the DATABASE, not merely by the absence of an
// endpoint — the guarantee has to survive direct SQL.
test('a recorded note cannot be edited, even by direct SQL', async () => {
  await expect(
    query(`UPDATE security_action_notes SET note = 'rewritten' WHERE action_id = $1`, [actionId])
  ).rejects.toThrow(/append-only/i);
});

test('a user who is neither owner nor privileged is refused', async () => {
  expect((await post(actionId, { progress_notes: 'nope' }, 'iam')).status).toBe(403);
});
