'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// v_control_reference (v162): how an objective is labelled everywhere. A shipped
// CIRKS objective under its own reference, never as the first standard it maps
// to (the confusion CIRKS's own objectives remove); otherwise its first mapped
// standard, so an install whose library is NIST looks as it did; otherwise Custom.

const { app, request, tokenFor, query } = require('./helpers');

const ids = {};
let nistReq;

beforeAll(async () => {
  const nist = (await query(`SELECT id FROM standards WHERE code = 'nist_csf'`)).rows[0].id;
  nistReq = (await query(
    `INSERT INTO standard_controls (standard_id, ref_code, title) VALUES ($1, 'ZZ.VR-01', 'VR requirement') RETURNING id`,
    [nist])).rows[0].id;
  const ctl = async (key, ref, mapped) => {
    ids[key] = (await query(`INSERT INTO controls (title, description, reference_code) VALUES ($1, 'fixture', $2) RETURNING id`,
      [`VR ${key}`, ref])).rows[0].id;
    if (mapped) await query(`INSERT INTO control_mappings (control_id, standard_control_id) VALUES ($1, $2)`, [ids[key], nistReq]);
  };
  await ctl('cirks', 'CIRKS1.VR-01', true);      // a shipped objective that also maps to NIST
  await ctl('nist', null, true);                 // a NIST-library objective
  await ctl('own', 'CIRKS.OT.T-01', false);      // the organisation's own, a CIRKS-looking name
  await ctl('bare', null, false);
});

afterAll(async () => {
  await query(`DELETE FROM control_mappings WHERE standard_control_id = $1`, [nistReq]);
  await query(`DELETE FROM standard_controls WHERE id = $1`, [nistReq]);
  await query(`DELETE FROM controls WHERE title LIKE 'VR %'`);
});

const label = async (key) => (await query(
  `SELECT framework, framework_label, framework_ref FROM v_control_reference WHERE control_id = $1`, [ids[key]])).rows[0];

test('a shipped CIRKS objective is CIRKS, under its own reference, even when it maps to a standard', async () => {
  expect(await label('cirks')).toEqual({ framework: 'cirks', framework_label: 'CIRKS', framework_ref: 'CIRKS1.VR-01' });
});

test('an objective with no CIRKS reference keeps its first mapped standard (a NIST library is unchanged)', async () => {
  expect(await label('nist')).toMatchObject({ framework: 'nist_csf', framework_ref: 'ZZ.VR-01' });
});

test('an organisation\'s own objective is Custom, even with a CIRKS-looking reference', async () => {
  expect(await label('own')).toEqual({ framework: 'custom', framework_label: 'Custom', framework_ref: 'CIRKS.OT.T-01' });
  expect(await label('bare')).toMatchObject({ framework: 'custom', framework_ref: null });
});

test('the objective list labels and filters by the same rule', async () => {
  const get = (q) => request(app).get(`/api/v1/controls?${q}&limit=1000`).set('Authorization', `Bearer ${tokenFor('ciso')}`);
  const cirks = await get('framework=cirks');
  expect(cirks.status).toBe(200);
  expect(cirks.body.controls.filter((c) => c.title.startsWith('VR ')).map((c) => [c.title, c.framework, c.framework_ref]))
    .toEqual([['VR cirks', 'cirks', 'CIRKS1.VR-01']]);
  const custom = await get('framework=custom');
  expect(custom.body.controls.filter((c) => c.title.startsWith('VR ')).map((c) => c.title).sort()).toEqual(['VR bare', 'VR own']);
});
