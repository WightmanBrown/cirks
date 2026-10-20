'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// POST /soa/decisions — deciding several objectives at once (2026-09-22).
//
// The SoA register is read-only except for this: first-time triage over a whole
// library (106 NIST objectives) cannot mean opening 106 pages. Deciding is ALL it
// does; the rules pinned here are the ones that protect people's words.

const { app, request, tokenFor, query } = require('./helpers');

const as = (role) => `Bearer ${tokenFor(role)}`;
const decide = (body, role = 'ciso') =>
  request(app).post('/api/v1/soa/decisions').set('Authorization', as(role)).send(body);

const ids = [];
beforeAll(async () => {
  for (const t of ['BULK a', 'BULK b', 'BULK c']) {
    const r = await query(`INSERT INTO controls (title, control_type) VALUES ($1, 'preventive') RETURNING id`, [t]);
    ids.push(r.rows[0].id);
  }
  // b already carries a justification someone wrote.
  await query(`INSERT INTO soa_entries (control_id, applicable, justification) VALUES ($1, TRUE, 'Written by hand')`, [ids[1]]);
});
afterAll(async () => { await query(`DELETE FROM controls WHERE id = ANY($1::uuid[])`, [ids]); });

const entry = async (id) => (await query(`SELECT * FROM soa_entries WHERE control_id = $1`, [id])).rows[0];

describe('bulk decision', () => {
  it('adopts several at once; a shared reason fills only the empty ones', async () => {
    const res = await decide({ control_ids: ids, applicable: true, justification: 'Baseline policy', drivers: ['business'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ decided: 3, justification_kept: 1 });
    expect((await entry(ids[0])).justification).toBe('Baseline policy');
    expect((await entry(ids[1])).justification).toBe('Written by hand');
    expect((await entry(ids[2])).applicable).toBe(true);
    expect(res.body.statuses[ids[0]]).toBe('not_assessed');
  });

  it('adds drivers rather than replacing them', async () => {
    await decide({ control_ids: [ids[0]], applicable: true, drivers: ['legal'] });
    expect((await entry(ids[0])).drivers.sort()).toEqual(['business', 'legal']);
  });

  it('marking not applicable needs a reason', async () => {
    const res = await decide({ control_ids: [ids[2]], applicable: false, justification: '  ' });
    expect(res.status).toBe(400);
    expect((await entry(ids[2])).applicable).toBe(true);
  });

  it('is all or nothing: one unknown id changes nothing', async () => {
    const res = await decide({ control_ids: [ids[2], '00000000-0000-0000-0000-00000000dead'], applicable: false, justification: 'x' });
    expect(res.status).toBe(404);
    expect((await entry(ids[2])).applicable).toBe(true);
  });

  // v131 changed the shape: the objective's own change is recorded by the
  // trigger, with its old and new values, and the batch keeps ONE row for the
  // thing the trigger cannot know — that these were decided together.
  it('audits each objective, attributed, and records that they were decided together', async () => {
    await decide({ control_ids: [ids[2]], applicable: false, justification: 'Out of scope' });
    const { rows } = await query(
      `SELECT user_id, user_name, changes, human_narrative FROM audit_log
        WHERE entity_type = 'soa_entry' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids[2]]);
    expect(rows[0].user_id).not.toBeNull();
    expect(rows[0].user_name).not.toBe('unattributed');
    expect(rows[0].human_narrative).toMatch(/marked not applicable|it does not apply/);
    // The bulk reason fills only objectives with none, so justification may or
    // may not be among the changed fields; applicable always is.
    expect(rows[0].changes.applicable).toEqual({ from: 'true', to: 'false' });

    const batch = await query(
      `SELECT human_narrative, changes FROM audit_log
        WHERE entity_type = 'soa_entry' AND entity_id IS NULL AND field_name = 'bulk'
        ORDER BY created_at DESC LIMIT 1`);
    expect(batch.rows[0].human_narrative).toMatch(/not applicable — Out of scope/);
    expect(batch.rows[0].changes.control_ids).toEqual([ids[2]]);
  });

  it('needs controls.write', async () => {
    const res = await decide({ control_ids: [ids[0]], applicable: true }, 'owner');
    expect(res.status).toBe(403);
  });

  it('refuses malformed input', async () => {
    expect((await decide({ control_ids: [], applicable: true })).status).toBe(400);
    expect((await decide({ control_ids: ['nope'], applicable: true })).status).toBe(400);
    expect((await decide({ control_ids: [ids[0]], applicable: 'yes' })).status).toBe(400);
  });
});
