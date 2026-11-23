'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Is the record current and trusted? — the CISO's C8 (docs/reporting-ciso.md).
// Pinned here: the reports.read audience; written-down counts add up for every
// kind and a record lacking a description is listed as lacking it; a change
// made through CIRKS beneath a record counts as a change to it; reads are
// counted by role, never sign-in or the public /meta.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const record = (role) => request(app).get('/api/v1/reports/record').set(auth(role));
const MARK = 'c8-record-current-test';

afterAll(async () => {
  await query(`DELETE FROM api_request_log WHERE user_agent = $1`, [MARK]);
});

test('admin, the CISO, the SIRO and risk analysts read it; an IAO and an IAM cannot', async () => {
  for (const role of ['admin', 'ciso', 'siro', 'analyst']) expect((await record(role)).status).toBe(200);
  for (const role of ['owner', 'iam']) expect((await record(role)).status).toBe(403);
});

test('written-down counts add up, and a missing description is named', async () => {
  const { body: r } = await record('ciso');
  expect(r.kinds.map((k) => k.kind)).toEqual(['system', 'service', 'asset', 'component']);
  for (const k of r.kinds) {
    expect(k.written.complete + k.written.partial + k.written.missing).toBe(k.total);
    expect(k.written.gaps_count).toBe(k.written.partial + k.written.missing);
    for (const c of k.written.checks) expect(c.have).toBeLessThanOrEqual(k.total);
    expect(k.current.changed).toBeLessThanOrEqual(k.total);
  }
  const { rows: [s] } = await query(`SELECT id, description FROM systems WHERE is_active ORDER BY name LIMIT 1`);
  await query(`UPDATE systems SET description = NULL WHERE id = $1`, [s.id]);
  try {
    const sys = (await record('ciso')).body.kinds.find((k) => k.kind === 'system');
    const gap = sys.written.gaps.find((x) => x.id === s.id);
    expect(gap.lacks).toContain('a description');
  } finally {
    await query(`UPDATE systems SET description = $2 WHERE id = $1`, [s.id, s.description]);
  }
});

test('a change made beneath a record counts as a change to it', async () => {
  const SYSTEM = '33333333-0000-0000-0000-0000000000c8';
  const untouched = async () => (await record('ciso')).body.kinds.find((k) => k.kind === 'system').current.untouched;
  await query(`INSERT INTO systems (id, name, department_id) VALUES ($1, 'C8 untouched system', '22222222-0000-0000-0000-000000000001')`, [SYSTEM]);
  try {
    const before = await untouched();
    await query(`INSERT INTO api_request_log (user_id, role, method, endpoint, status_code, user_agent, requested_at)
                 VALUES ($1, 'ciso', 'POST', $2, 201, $3, now() + interval '1 hour')`,
    [USERS.ciso.id, `/api/v1/systems/${SYSTEM}/components`, MARK]);
    expect(await untouched()).toBe(before - 1);
  } finally {
    await query(`DELETE FROM systems WHERE id = $1`, [SYSTEM]);
  }
});

test('reads are counted by role, never sign-in or the public /meta', async () => {
  const before = (await record('ciso')).body.used.readers;
  const siroReads = (rs) => rs.find((x) => x.role === 'siro')?.reads || 0;
  await query(`INSERT INTO api_request_log (user_id, role, method, endpoint, status_code, user_agent)
               VALUES ($1, 'siro', 'GET', '/api/v1/systems', 200, $2),
                      ($1, 'siro', 'GET', '/api/v1/auth/me', 200, $2),
                      (NULL, NULL, 'GET', '/api/v1/meta', 200, $2)`, [USERS.siro.id, MARK]);
  const after = (await record('ciso')).body.used.readers;
  expect(siroReads(after)).toBe(siroReads(before) + 1);
  expect(after.find((x) => x.role == null)).toBeUndefined();
});
