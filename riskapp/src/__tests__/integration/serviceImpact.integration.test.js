'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Validates the v104 model: a business service is composed of SYSTEMS, and its
// C/I/A is derived as the MAX over the assets ITS OWN DEPARTMENT holds in those
// systems — never the systems' own whole-system impact.
//
// The distinction is the entire point of the change, so the central test here
// puts two departments' assets in one system and proves the service sees only
// its own. Under the naive rule (MAX over systems.impact_*) both services would
// read the same and the roll-up would tell leadership nothing.
//
// Replaces the v61 tests, which pinned the service ↔ information-asset link that
// v104 removed. See docs/business-service-model.md.

const { query, as, USERS, IT_DEPT } = require('./helpers');

const made = { services: [], assets: [], systems: [] };
let otherDept;

// The fixture ships a single department, and the central claim of v104 is about
// TWO departments sharing one system — so this suite creates its own second
// department rather than weakening the test to fit the fixture.
beforeAll(async () => {
  const { rows } = await query(
    `INSERT INTO departments (name) VALUES ('ITG v104 Other Dept') RETURNING id`);
  otherDept = rows[0].id;
});

afterAll(async () => {
  for (const id of made.services) await query('DELETE FROM business_services WHERE id = $1', [id]);
  for (const id of made.systems)  await query('DELETE FROM systems WHERE id = $1', [id]);
  for (const id of made.assets)   await query('DELETE FROM information_assets WHERE id = $1', [id]);
  if (otherDept) await query('DELETE FROM departments WHERE id = $1', [otherDept]);
});

async function mkService(name, dept = IT_DEPT) {
  const { rows } = await query(
    `INSERT INTO business_services (name, department_id) VALUES ($1, $2) RETURNING id`, [name, dept]);
  made.services.push(rows[0].id); return rows[0].id;
}
async function mkSystem(name, dept = IT_DEPT) {
  const { rows } = await query(
    `INSERT INTO systems (name, department_id, is_active) VALUES ($1, $2, TRUE) RETURNING id`, [name, dept]);
  made.systems.push(rows[0].id); return rows[0].id;
}
async function mkAsset(name, dept, c, i, a) {
  const { rows } = await query(
    `INSERT INTO information_assets (name, department_id, confidentiality, integrity, availability, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`, [name, dept, c, i, a]);
  made.assets.push(rows[0].id); return rows[0].id;
}
const cia = async (id) => (await query(
  'SELECT confidentiality c, integrity i, availability a FROM business_services WHERE id = $1', [id])).rows[0];

test('a service with no systems has no derived impact — distinct from an impact of zero', async () => {
  const svc = await mkService('ITG v104 Empty');
  expect(await cia(svc)).toEqual({ c: null, i: null, a: null });
});

test('linking a system derives the service CIA from the department\'s assets in it', async () => {
  const svc = await mkService('ITG v104 Basic');
  const sys = await mkSystem('ITG v104 System');
  const ast = await mkAsset('ITG v104 Asset', IT_DEPT, 3, 4, 2);
  await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sys, ast]);

  await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1,$2)', [svc, sys]);
  expect(await cia(svc)).toEqual({ c: 3, i: 4, a: 2 });
});

test('THE test: two departments in one system see different impact', async () => {
  // One shared system holding a low-stakes asset for IT and a critical one for
  // another department. Under MAX-over-systems both services would read 5/5/5.
  const sys = await mkSystem('ITG v104 Shared System');
  const mine   = await mkAsset('ITG v104 Mine',   IT_DEPT,   2, 2, 2);
  const theirs = await mkAsset('ITG v104 Theirs', otherDept, 5, 5, 5);
  await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2),($1,$3)', [sys, mine, theirs]);

  const svcMine   = await mkService('ITG v104 Mine Svc',   IT_DEPT);
  const svcTheirs = await mkService('ITG v104 Theirs Svc', otherDept);
  await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1,$3),($2,$3)',
              [svcMine, svcTheirs, sys]);

  expect(await cia(svcMine)).toEqual({ c: 2, i: 2, a: 2 });
  expect(await cia(svcTheirs)).toEqual({ c: 5, i: 5, a: 5 });
});

test('a depended-on system where the department holds nothing adds no impact', async () => {
  // The dependency still exists and still contributes probability (service
  // exposure, computed on read) — it simply does not inflate the stake.
  const svc = await mkService('ITG v104 Depends');
  const sys = await mkSystem('ITG v104 Infra');
  const ast = await mkAsset('ITG v104 NotMine', otherDept, 5, 5, 5);
  await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sys, ast]);

  await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1,$2)', [svc, sys]);
  expect(await cia(svc)).toEqual({ c: null, i: null, a: null });
});

test('a shared asset counts for every service regardless of department', async () => {
  const svc = await mkService('ITG v104 SharedAsset Svc');
  const sys = await mkSystem('ITG v104 SharedAsset System');
  const { rows } = await query(
    `INSERT INTO information_assets (name, department_id, confidentiality, integrity, availability, is_active, is_shared)
     VALUES ('ITG v104 Shared Asset', $1, 4, 1, 1, TRUE, TRUE) RETURNING id`, [otherDept]);
  made.assets.push(rows[0].id);
  await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sys, rows[0].id]);
  await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1,$2)', [svc, sys]);

  expect((await cia(svc)).c).toBe(4);
});

test('moving an asset into a linked system re-derives the service', async () => {
  // New in v104: nothing propagated this before, because services linked assets
  // directly rather than through systems.
  const svc = await mkService('ITG v104 Propagate Svc');
  const sys = await mkSystem('ITG v104 Propagate System');
  await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1,$2)', [svc, sys]);
  expect(await cia(svc)).toEqual({ c: null, i: null, a: null });

  const ast = await mkAsset('ITG v104 Late Asset', IT_DEPT, 1, 5, 1);
  await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sys, ast]);
  expect((await cia(svc)).i).toBe(5);

  await query('DELETE FROM system_assets WHERE system_id = $1 AND asset_id = $2', [sys, ast]);
  expect(await cia(svc)).toEqual({ c: null, i: null, a: null });
});

test('changing an asset rating re-derives the services reached through its systems', async () => {
  const svc = await mkService('ITG v104 Rerate Svc');
  const sys = await mkSystem('ITG v104 Rerate System');
  const ast = await mkAsset('ITG v104 Rerate Asset', IT_DEPT, 1, 1, 1);
  await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sys, ast]);
  await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1,$2)', [svc, sys]);
  expect((await cia(svc)).a).toBe(1);

  await query('UPDATE information_assets SET availability = 5 WHERE id = $1', [ast]);
  expect((await cia(svc)).a).toBe(5);
});

test('unlinking the system clears the derived impact', async () => {
  const svc = await mkService('ITG v104 Unlink Svc');
  const sys = await mkSystem('ITG v104 Unlink System');
  const ast = await mkAsset('ITG v104 Unlink Asset', IT_DEPT, 3, 3, 3);
  await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sys, ast]);
  await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1,$2)', [svc, sys]);
  expect((await cia(svc)).c).toBe(3);

  await query('DELETE FROM business_service_systems WHERE service_id = $1 AND system_id = $2', [svc, sys]);
  expect(await cia(svc)).toEqual({ c: null, i: null, a: null });
});

// ── The service detail contract ────────────────────────────────────────────
//
// GET /services/:id is what the detail page renders, and the Systems tab reads
// `linked_systems` off it. That field was missing from the first cut of v104:
// the endpoint parsed, every suite stayed green, and the tab would simply have
// shown nothing. Nothing exercised the endpoint, so nothing could have caught
// it. These tests pin the shape the frontend actually consumes.

describe('GET /services/:id — the shape the detail page consumes', () => {
  let svc, ownSys, depSys;

  beforeAll(async () => {
    svc    = await mkService('ITG v104 Detail');
    ownSys = await mkSystem('ITG v104 Detail Own');
    depSys = await mkSystem('ITG v104 Detail Dependency', otherDept);

    // Our own information sits in ownSys; depSys carries only another
    // department's information, so it is a pure dependency.
    const mine   = await mkAsset('ITG v104 Detail Mine', IT_DEPT, 4, 2, 3);
    const theirs = await mkAsset('ITG v104 Detail Theirs', otherDept, 5, 5, 5);
    await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1, $2)', [ownSys, mine]);
    await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1, $2)', [depSys, theirs]);
    await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1, $2)', [svc, ownSys]);
    await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1, $2)', [svc, depSys]);
  });

  test('returns linked_systems carrying the stake each system represents', async () => {
    const res = await as('ciso', 'get', `/api/v1/services/${svc}`);
    expect(res.status).toBe(200);

    const linked = res.body.linked_systems;
    expect(Array.isArray(linked)).toBe(true);
    expect(linked).toHaveLength(2);

    // own_asset_count / own_max_bil are what the picker groups on, so they are
    // part of the contract, not incidental extras.
    const own = linked.find((s) => s.id === ownSys);
    expect(own).toMatchObject({ own_asset_count: 1, own_max_bil: 4 });

    // The dependency holds none of OUR information: it contributes probability,
    // not impact. Reporting the other department's 5 here would reintroduce the
    // whole-system flattening v104 exists to prevent.
    const dep = linked.find((s) => s.id === depSys);
    expect(dep).toMatchObject({ own_asset_count: 0, own_max_bil: null });
    expect(dep.department_name).toBe('ITG v104 Other Dept');
  });

  test('linked_information_assets is derived through the systems, not curated', async () => {
    const res = await as('ciso', 'get', `/api/v1/services/${svc}`);
    const names = res.body.linked_information_assets.map((a) => a.name);
    expect(names).toContain('ITG v104 Detail Mine');
    expect(names).not.toContain('ITG v104 Detail Theirs');
  });

  test('available-systems offers the unlinked ones, each carrying its stake', async () => {
    const res = await as('ciso', 'get', `/api/v1/services/${svc}/available-systems`);
    expect(res.status).toBe(200);

    // Already-linked systems must not reappear in the picker.
    const ids = res.body.map((s) => s.id);
    expect(ids).not.toContain(ownSys);
    expect(ids).not.toContain(depSys);

    // The grouping the picker renders is driven by own_asset_count, so every
    // candidate has to carry it — a missing field would silently collapse the
    // list into the "you hold nothing here" group.
    for (const s of res.body) expect(typeof s.own_asset_count).toBe('number');
  });

  test('a service with no systems returns an empty array, never null', async () => {
    const bare = await mkService('ITG v104 Detail Bare');
    const res = await as('ciso', 'get', `/api/v1/services/${bare}`);
    expect(res.status).toBe(200);
    expect(res.body.linked_systems).toEqual([]);
  });
});

// ── The six acceptance questions ───────────────────────────────────────────
//
// The model exists to answer six questions a service owner asks. Five are
// structural; the sixth ("are there risks with nothing planned?") is the one a
// register answers by omission, which is why it gets its own field rather than
// being left for the reader to infer from an empty actions list.
//
// See docs/business-service-model.md.

describe('the six questions a service owner asks', () => {
  let svc, sysA, sysB, riskTreated, riskBare, action;

  beforeAll(async () => {
    svc  = await mkService('ITG six');
    sysA = await mkSystem('ITG six A');
    sysB = await mkSystem('ITG six B');
    const asset = await mkAsset('ITG six asset', IT_DEPT, 4, 3, 2);
    await query('INSERT INTO system_assets (system_id, asset_id) VALUES ($1,$2)', [sysA, asset]);
    for (const s of [sysA, sysB]) {
      await query('INSERT INTO business_service_systems (service_id, system_id) VALUES ($1,$2)', [svc, s]);
    }

    const threats = (await query('SELECT id FROM threats ORDER BY name LIMIT 2')).rows;
    const mkRisk = async (sys, threat) => (await query(
      `INSERT INTO risks (system_id, threat_id, is_active, identified_by,
                          rationale, probability_c, probability_i, probability_a)
       VALUES ($1,$2,TRUE,$3,'six-question fixture',4,4,4) RETURNING id`,
      [sys, threat, USERS.ciso.id])).rows[0].id;

    riskTreated = await mkRisk(sysA, threats[0].id);
    riskBare    = await mkRisk(sysB, threats[1].id);

    action = (await query(
      `INSERT INTO security_actions (subject_type, origin, title, description, treatment_type, primary_owner_user_id,
                                     status, target_date, created_by)
       VALUES ('risk', 'risk_treatment', 'ITG six action','fixture','mitigate',$1,'in_progress', CURRENT_DATE - 1, $1)
       RETURNING id`, [USERS.ciso.id])).rows[0].id;
    await query('INSERT INTO security_action_risks (action_id, risk_id) VALUES ($1,$2)', [action, riskTreated]);

    // Two items, one done — the progress measure the page reports.
    // Two DIFFERENT controls — an action carries at most one item per control
    // per system (uq_sai_control).
    const ctls = (await query('SELECT id FROM controls ORDER BY id LIMIT 2')).rows;
    await query(
      `INSERT INTO security_action_items (action_id, system_id, element_type, control_id, change_kind, status)
       VALUES ($1,$2,'control',$3,'control_improve','completed'),
              ($1,$2,'control',$4,'control_add','pending')`,
      [action, sysA, ctls[0].id, ctls[1].id]);
  });

  afterAll(async () => {
    await query('DELETE FROM security_actions WHERE id = $1', [action]);
    for (const r of [riskTreated, riskBare]) await query('DELETE FROM risks WHERE id = $1', [r]);
  });

  const detail = async () => (await as('ciso', 'get', `/api/v1/services/${svc}`)).body;

  test('Q1 — the current level of risk to the service', async () => {
    const paths = (await detail()).risk_paths;
    expect(paths.length).toBeGreaterThan(0);
    expect(Math.max(...paths.map((p) => p.risk_score))).toBe(16);
  });

  test('Q2 — which of MY information assets support it, and their ratings', async () => {
    const assets = (await detail()).linked_information_assets;
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ name: 'ITG six asset', confidentiality: 4, integrity: 3, availability: 2 });
  });

  test('Q3 — which systems present the highest risk', async () => {
    const systems = (await detail()).linked_systems;
    // A (holds a BIL 4 asset) scores 4×4; B holds nothing, so its impact floors
    // to 1 and the same probability scores 4. That gap is the answer to "which
    // system presents the highest risk" — same threat, very different exposure.
    const byName = Object.fromEntries(systems.map((s) => [s.name, s.max_risk_score]));
    expect(byName['ITG six A']).toBe(16);
    expect(byName['ITG six B']).toBe(4);
  });

  test('Q4 — are there security actions planned', async () => {
    const actions = (await detail()).security_actions;
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ title: 'ITG six action', status: 'in_progress', owner_name: expect.any(String) });
  });

  test('Q5 — are there risks with NOTHING planned', async () => {
    const untreated = (await detail()).untreated_risks;
    const ids = untreated.map((u) => u.risk_id);
    expect(ids).toContain(riskBare);
    expect(ids).not.toContain(riskTreated);
  });

  test('Q6 — how are those actions progressing', async () => {
    const [a] = (await detail()).security_actions;
    expect(a).toMatchObject({ items_total: 2, items_completed: 1, overdue: true });
  });

  test('a completed action stops counting as treatment — the risk resurfaces', async () => {
    await query(`UPDATE security_actions SET status = 'completed' WHERE id = $1`, [action]);
    const ids = (await detail()).untreated_risks.map((u) => u.risk_id);
    expect(ids).toContain(riskTreated);
    await query(`UPDATE security_actions SET status = 'in_progress' WHERE id = $1`, [action]);
  });
});
