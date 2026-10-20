'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The finding of v153: a control objective no security solution delivers, and
// the Statement of Applicability has not ruled out. The owner's rule (2026-10-07)
// is that every objective has a solution or is not applicable; this names each
// one that has neither, once, instead of as a missing row on every system.

const { app, request, tokenFor, query } = require('./helpers');

const ids = {};
let actionId;
const as = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const api = (role, method, path) => request(app)[method](`/api/v1${path}`).set(as(role));
const findings = async () => (await api('ciso', 'get', '/findings/objective-solution')).body.findings;
const holds = async (key) => (await findings()).some((f) => f.control_id === ids[key]);

beforeAll(async () => {
  const ctl = async (key, delivery) => {
    ids[key] = (await query(
      `INSERT INTO controls (title, description, delivery, reference_code) VALUES ($1, 'fixture', $2, $1) RETURNING id`,
      [`OSF ${key}`, delivery])).rows[0].id;
  };
  await ctl('no solution', 'system');
  await ctl('organisation-wide', 'organisation');
  await ctl('has solution', 'system');
  await ctl('ruled out', 'system');
  ids.pattern = (await query(`INSERT INTO delivery_patterns (name, kind) VALUES ('OSF solution', 'parts') RETURNING id`)).rows[0].id;
  await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [ids.pattern, ids['has solution']]);
  await query(`INSERT INTO soa_entries (control_id, applicable, justification) VALUES ($1, false, 'fixture')`, [ids['ruled out']]);
});

afterAll(async () => {
  const controls = ['no solution', 'organisation-wide', 'has solution', 'ruled out'].map((k) => ids[k]);
  await query(`DELETE FROM exceptions WHERE subject_id = ANY($1)`, [controls]);
  await query(`DELETE FROM security_actions WHERE subject_id = ANY($1)`, [controls]);
  await query(`DELETE FROM audit_log WHERE entity_id = ANY($1)`, [controls]);
  await query(`DELETE FROM soa_entries WHERE control_id = ANY($1)`, [controls]);
  await query(`DELETE FROM delivery_patterns WHERE id = $1`, [ids.pattern]);
  await query(`DELETE FROM controls WHERE id = ANY($1)`, [controls]);
});

describe('what counts', () => {
  test('an objective with no solution, however it is delivered — not one with a solution, not one ruled not applicable', async () => {
    expect(await holds('no solution')).toBe(true);
    expect(await holds('organisation-wide')).toBe(true);
    expect(await holds('has solution')).toBe(false);
    expect(await holds('ruled out')).toBe(false);
    const f = (await findings()).find((x) => x.control_id === ids['no solution']);
    expect(f).toMatchObject({ objective_title: 'OSF no solution', delivery: 'system', systems_count: 0, listed_components: 0 });
  });

  test('every role that reads findings can see it', async () => {
    for (const role of ['ciso', 'analyst', 'siro', 'iam']) {
      expect((await api(role, 'get', '/findings/objective-solution')).status).toBe(200);
    }
  });
});

describe('the response', () => {
  test('an action can be raised from it, and cannot complete while the objective has no solution', async () => {
    const raised = await api('ciso', 'post', `/findings/objective-solution/${ids['no solution']}/actions`).send({});
    expect(raised.status).toBe(201);
    actionId = raised.body.action_id;
    const { rows } = await query(`SELECT subject_type, origin, title FROM security_actions WHERE id = $1`, [actionId]);
    expect(rows[0]).toMatchObject({ subject_type: 'control', origin: 'objective_solution' });
    expect(rows[0].title).toMatch(/Build a security solution for .*OSF no solution/);
    expect((await api('ciso', 'post', `/actions/${actionId}/accept`)).status).toBe(200);
    const res = await api('ciso', 'post', `/actions/${actionId}/complete`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/still has no security solution/);
  });

  test('a second action is refused while one is open', async () => {
    expect((await api('ciso', 'post', `/findings/objective-solution/${ids['no solution']}/actions`).send({})).status).toBe(409);
  });

  test('it closes itself when a solution delivers the objective, and the action can then complete', async () => {
    await query(`INSERT INTO delivery_pattern_objectives VALUES ($1, $2)`, [ids.pattern, ids['no solution']]);
    expect(await holds('no solution')).toBe(false);
    expect((await api('ciso', 'post', `/actions/${actionId}/complete`)).status).toBe(200);
  });

  test('ruling the objective not applicable closes it too', async () => {
    await query(`INSERT INTO soa_entries (control_id, applicable, justification) VALUES ($1, false, 'fixture')`, [ids['organisation-wide']]);
    expect(await holds('organisation-wide')).toBe(false);
  });
});
