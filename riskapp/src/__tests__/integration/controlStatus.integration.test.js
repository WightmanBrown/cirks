'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// A control objective's status is DERIVED (v124) from its SoA entry and its
// maturity rating — never stored. Four states, named for what they mean:
//   not_decided · not_applicable · not_assessed · adopted
// These tests walk one objective through all four using only the ordinary acts
// (decide in the SoA, rate maturity) and check every place that reports it agrees.

const { app, request, tokenFor, query } = require('./helpers');

const auth  = () => `Bearer ${tokenFor('ciso')}`;
const get   = (path)       => request(app).get(path).set('Authorization', auth());
const patch = (path, body) => request(app).patch(path).set('Authorization', auth()).send(body);

let id;
beforeAll(async () => {
  const c = await query(`INSERT INTO controls (title, control_type) VALUES ('STATUS walk objective', 'preventive') RETURNING id`);
  id = c.rows[0].id;
});
afterAll(async () => { await query(`DELETE FROM controls WHERE id = $1`, [id]); });

const statusEverywhere = async () => {
  const [detail, list, soa] = await Promise.all([
    get(`/api/v1/controls/${id}`), get('/api/v1/controls'), get('/api/v1/soa'),
  ]);
  return {
    detail: detail.body.control.status,
    list:   list.body.controls.find(c => c.id === id).status,
    soa:    soa.body.groups.flatMap(g => g.controls).find(c => c.control_id === id).status,
  };
};

describe('the status follows the facts, and every view agrees', () => {
  it('a new objective is not decided', async () => {
    expect(await statusEverywhere()).toEqual({ detail: 'not_decided', list: 'not_decided', soa: 'not_decided' });
  });

  it('judged not applicable in the SoA', async () => {
    const res = await patch(`/api/v1/soa/${id}`, { applicable: false, justification: 'Out of scope' });
    expect(res.body.control_status).toBe('not_applicable');
    expect(await statusEverywhere()).toEqual({ detail: 'not_applicable', list: 'not_applicable', soa: 'not_applicable' });
  });

  it('adopted, maturity not yet rated', async () => {
    const res = await patch(`/api/v1/soa/${id}`, { applicable: true });
    expect(res.body.control_status).toBe('not_assessed');
    expect(await statusEverywhere()).toEqual({ detail: 'not_assessed', list: 'not_assessed', soa: 'not_assessed' });
  });

  it('adopted and rated', async () => {
    const res = await patch(`/api/v1/controls/${id}/rate`, { effectiveness: 3, effectiveness_notes: 'Evidence' });
    expect(res.status).toBe(200);
    expect(res.body.control.status).toBe('adopted');
    expect(await statusEverywhere()).toEqual({ detail: 'adopted', list: 'adopted', soa: 'adopted' });
  });

  it('the library filters and counts by the derived status', async () => {
    const res = await get('/api/v1/controls?status=adopted');
    expect(res.body.controls.map(c => c.id)).toContain(id);
    const { rows } = await query(`SELECT count(*)::int AS n FROM v_control_status WHERE status = 'adopted'`);
    expect(res.body.summary.adopted).toBe(rows[0].n);
  });

  it('cannot be set directly', async () => {
    const res = await patch(`/api/v1/controls/${id}`, { status: 'adopted' });
    expect(res.status).toBe(400);
  });

  it('the stored column is gone', async () => {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'controls' AND column_name = 'status'`);
    expect(rows[0].n).toBe(0);
  });
});
