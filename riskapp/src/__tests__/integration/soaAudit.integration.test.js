'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// An SoA decision records what changed, from what, to what (v131).
//
// The case that produced this: two objectives were excluded on 2026-07-29 and
// `audit_log` held "SoA (operational) updated" — no field, no old value, no new
// value — so nobody could say what had been decided. It is a TRIGGER, so the
// test that matters is the one that bypasses the API entirely.

const { app, request, tokenFor, query } = require('./helpers');

const CISO = '11111111-0000-0000-0000-000000000002';
const ciso = (r) => r.set('Authorization', `Bearer ${tokenFor('ciso')}`);

const trail = async () => (await query(
  `SELECT action::text, field_name, old_value, new_value, changes, user_name, human_narrative
     FROM audit_log WHERE entity_type = 'soa_entry' AND entity_id = $1 ORDER BY created_at`, [ctl])).rows;

let ctl, scope;

beforeEach(async () => {
  const c = await query(
    `INSERT INTO controls (title, control_type, created_by) VALUES ('AUDIT supplier assurance', 'preventive', $1) RETURNING id`,
    [CISO]);
  ctl = c.rows[0].id;
});

afterEach(async () => {
  await query(`DELETE FROM audit_log WHERE entity_id = $1`, [ctl]);
  await query(`DELETE FROM soa_entry_scopes WHERE control_id = $1`, [ctl]);
  if (scope) { await query(`DELETE FROM scopes WHERE id = $1`, [scope]); scope = null; }
  await query(`DELETE FROM controls WHERE id = $1`, [ctl]);
});

describe('through the API', () => {
  it('records the decision, its reason, and who made it', async () => {
    const res = await ciso(request(app).patch(`/api/v1/soa/${ctl}`))
      .send({ applicable: true, justification: 'Contractual obligation for suppliers', drivers: ['contractual'] });
    expect(res.status).toBe(200);

    const rows = await trail();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_name).not.toBe('unattributed');
    expect(rows[0].human_narrative).toMatch(/decided: it applies|adopted — it applies/);
  });

  it('a later change says what it changed, from what, to what', async () => {
    await ciso(request(app).patch(`/api/v1/soa/${ctl}`)).send({ applicable: true, justification: 'First reason' });
    await ciso(request(app).patch(`/api/v1/soa/${ctl}`)).send({ applicable: false, justification: 'It does not apply after all' });

    const rows = await trail();
    const last = rows[rows.length - 1];
    expect(last.changes.applicable).toEqual({ from: 'true', to: 'false' });
    expect(last.changes.justification).toEqual({ from: 'First reason', to: 'It does not apply after all' });
    expect(last.human_narrative).toMatch(/marked not applicable/);
  });

  it('a single-field change names that field, with both values', async () => {
    await ciso(request(app).patch(`/api/v1/soa/${ctl}`)).send({ applicable: true, justification: 'First reason' });
    await ciso(request(app).patch(`/api/v1/soa/${ctl}`)).send({ implementation_description: 'Provided by the platform' });

    const last = (await trail()).pop();
    expect(last).toMatchObject({
      field_name: 'implementation_description', old_value: null, new_value: 'Provided by the platform' });
  });

  it('records where it applies, because that decides which systems it is measured against', async () => {
    const s = await query(`INSERT INTO scopes (name) VALUES ('AUDIT cardholder environment') RETURNING id`);
    scope = s.rows[0].id;
    await ciso(request(app).patch(`/api/v1/soa/${ctl}`)).send({ applicable: true, justification: 'x' });
    await ciso(request(app).patch(`/api/v1/soa/${ctl}`)).send({ scope_ids: [scope] });

    const scoped = (await trail()).filter(r => r.field_name === 'scope');
    expect(scoped).toHaveLength(1);
    expect(scoped[0]).toMatchObject({ action: 'create', new_value: 'AUDIT cardholder environment' });
    expect(scoped[0].human_narrative).toMatch(/narrowed to scope/);
  });

  it('a save that decides nothing records nothing', async () => {
    await ciso(request(app).patch(`/api/v1/soa/${ctl}`)).send({ applicable: true, justification: 'Same words' });
    const after = (await trail()).length;
    await ciso(request(app).patch(`/api/v1/soa/${ctl}`)).send({ applicable: true, justification: 'Same words' });
    expect((await trail()).length).toBe(after);
  });
});

// The whole reason it is a trigger. A controller-level fix cannot see this.
describe('bypassing the API', () => {
  it('a hand-run UPDATE is recorded too, and says nobody was acting', async () => {
    await query(`INSERT INTO soa_entries (control_id, applicable, justification) VALUES ($1, TRUE, 'Adopted')`, [ctl]);
    await query(`UPDATE soa_entries SET applicable = FALSE, justification = 'Excluded by a script' WHERE control_id = $1`, [ctl]);

    const last = (await trail()).pop();
    expect(last.user_name).toBe('unattributed');
    expect(last.human_narrative).toMatch(/changed outside the application/);
    expect(last.changes.justification).toEqual({ from: 'Adopted', to: 'Excluded by a script' });
  });

  it('and so is a decision deleted outright', async () => {
    await query(`INSERT INTO soa_entries (control_id, applicable) VALUES ($1, TRUE)`, [ctl]);
    await query(`DELETE FROM soa_entries WHERE control_id = $1`, [ctl]);
    const last = (await trail()).pop();
    expect(last.action).toBe('delete');
    expect(last.human_narrative).toMatch(/removed entirely/);
  });
});

describe('a bulk decision', () => {
  it('records each objective AND that they were decided together', async () => {
    const res = await ciso(request(app).post('/api/v1/soa/decisions'))
      .send({ control_ids: [ctl], applicable: false, justification: 'Out of scope for us' });
    expect(res.status).toBe(200);

    const own = await trail();
    expect(own.some(r => /decided: it does not apply|marked not applicable/.test(r.human_narrative))).toBe(true);

    const batch = await query(
      `SELECT human_narrative, changes FROM audit_log
        WHERE entity_type = 'soa_entry' AND entity_id IS NULL AND field_name = 'bulk'
        ORDER BY created_at DESC LIMIT 1`);
    expect(batch.rows[0].human_narrative).toMatch(/taken for 1 objectives together/);
    expect(batch.rows[0].changes.control_ids).toEqual([ctl]);
  });
});
