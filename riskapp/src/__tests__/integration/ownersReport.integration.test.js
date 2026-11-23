'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Who owns what — the CISO's C4 (docs/reporting-ciso.md). Pinned here: the
// reports.read audience; a risk's owner is its department's IAO, so every
// active risk is counted once per owner and never invented; the gaps find a
// department whose risks fall to the SIRO, a record with no owner or manager,
// and a record still named to someone whose account is inactive.

const { app, request, tokenFor, query, USERS } = require('./helpers');

const auth = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });
const owners = (role) => request(app).get('/api/v1/reports/owners').set(auth(role));
const gapOf = (r, key) => r.gaps.find((g) => g.key === key);

const DEPT = '22222222-0000-0000-0000-0000000000c4';
const USER = '11111111-0000-0000-0000-0000000000c4';
const SYSTEM = '33333333-0000-0000-0000-0000000000c4';
const SERVICE = '44444444-0000-0000-0000-0000000000c4';

afterAll(async () => {
  await query('DELETE FROM business_services WHERE id = $1', [SERVICE]);
  await query('DELETE FROM systems WHERE id = $1', [SYSTEM]);
  await query('DELETE FROM departments WHERE id = $1', [DEPT]);
  await query('DELETE FROM users WHERE id = $1', [USER]);
});

test('admin, the CISO, the SIRO and risk analysts read it; an IAO and an IAM cannot', async () => {
  for (const role of ['admin', 'ciso', 'siro', 'analyst']) expect((await owners(role)).status).toBe(200);
  for (const role of ['owner', 'iam']) expect((await owners(role)).status).toBe(403);
});

test('each active risk is owned by its department’s risk owner, and counted once for each', async () => {
  const { body: r } = await owners('ciso');
  const { rows } = await query(`
    SELECT u, COUNT(*)::int AS n
      FROM risks rk JOIN systems s ON s.id = rk.system_id
      JOIN v_department_risk_owner o ON o.department_id = s.department_id, unnest(o.owner_user_ids) AS u
     WHERE rk.is_active GROUP BY u`);
  for (const { u, n } of rows) {
    const p = r.people.find((x) => x.id === u);
    expect(p.accountable.risks_count).toBe(n);
    expect(p.accountable.risks.length).toBeLessThanOrEqual(n);
    for (const x of p.accountable.risks) expect(x.score >= r.thresholds.action || x.past_review).toBe(true);
  }
  for (const g of r.gaps) expect(g.rows.length).toBeLessThanOrEqual(g.count);
});

test('the gaps: risks falling to the SIRO, no owner or manager, and someone who has left', async () => {
  await query(`INSERT INTO users (id, email, full_name, password_hash, role, is_active)
               VALUES ($1, 'c4.leaver@test.local', 'Lee Ver', 'x', 'information_asset_manager', FALSE)`, [USER]);
  await query(`INSERT INTO departments (id, name) VALUES ($1, 'C4 department with no IAO')`, [DEPT]);
  await query(`INSERT INTO systems (id, name, department_id, managed_by_user_id) VALUES ($1, 'C4 leaver system', $2, $3)`, [SYSTEM, DEPT, USER]);
  await query(`INSERT INTO business_services (id, name, department_id, owner_department_id) VALUES ($1, 'C4 service', $2, $2)`, [SERVICE, DEPT]);

  const { body: r } = await owners('ciso');
  expect(gapOf(r, 'siro_fallback').rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ department_id: DEPT, services: 1 })]));
  expect(r.departments.find((d) => d.id === DEPT)).toMatchObject({ is_siro_fallback: true, systems: 1 });
  // The SIRO owns the department's service, as they own its risks.
  const siro = r.people.find((p) => p.id === USERS.siro.id);
  expect(siro.accountable.services.map((s) => s.id)).toContain(SERVICE);

  const missing = gapOf(r, 'no_owner');
  expect(missing.rows.find((x) => x.id === SYSTEM)).toMatchObject({ kind: 'system', missing: ['owner'] });
  expect(missing.rows.find((x) => x.id === SERVICE)).toMatchObject({ kind: 'service', missing: ['manager'] });

  expect(gapOf(r, 'inactive').rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'system', id: SYSTEM, as: 'manager', person_name: 'Lee Ver' })]));
  const leaver = r.people.find((p) => p.id === USER);
  expect(leaver).toMatchObject({ is_active: false });
  expect(leaver.manages.systems.map((s) => s.id)).toEqual([SYSTEM]);
});
