'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The Statement of Applicability is recorded ONCE, against the control (v122).
//
// Until v122 each standard carried its own full copy of the SoA and nothing kept
// the copies in step: on a copy of real data the NIST view said 0 controls
// implemented while "All controls" said 48, for the same 106 controls. These tests
// pin the contract that replaced it: a standard's view is DERIVED from the one
// record, so an edit made in one place is what every view shows, and a requirement
// records nothing for itself but an exclusion.
//
// Fixture (test/e2e/db/seed.sql): ISO requirement REF.1 maps fully to the control
// "MFA Enforcement", whose SoA entry is applicable + implemented. CIS 7.3 maps to
// "Patch Management", which has no SoA entry at all (undecided).

const { app, request, tokenFor, query } = require('./helpers');

const MFA   = '55555555-0000-0000-0000-000000000001';
const REF_1 = '5c000000-0000-0000-0000-000000000001';
const CIS_73 = '5c000000-0000-0000-0000-000000000002';

const auth = () => `Bearer ${tokenFor('ciso')}`;
const get   = (path)       => request(app).get(path).set('Authorization', auth());
const patch = (path, body) => request(app).patch(path).set('Authorization', auth()).send(body);

const rowsOf = (body) => (body.groups || []).flatMap(g => g.controls);
const find   = (body, id) => rowsOf(body).find(r => r.control_id === id);

describe('a standard is a lens on the one record', () => {
  it('derives an ISO requirement from the control mapped to it', async () => {
    const res = await get('/api/v1/soa?framework=iso27001');
    expect(res.status).toBe(200);
    expect(find(res.body, REF_1)).toMatchObject({
      requirement_state: 'covered', applicable: true, implementation_status: 'implemented',
    });
  });

  it('a control nobody has decided on leaves its requirement a gap, not excluded', async () => {
    const res = await get('/api/v1/soa?framework=cis_v8');
    expect(find(res.body, CIS_73).requirement_state).toBe('gap');
  });

  it('an edit to the control is what the standard view shows — there is no second copy', async () => {
    try {
      expect((await patch(`/api/v1/soa/${MFA}`, { implementation_status: 'partial' })).status).toBe(200);
      const res = await get('/api/v1/soa?framework=iso27001');
      expect(find(res.body, REF_1)).toMatchObject({ requirement_state: 'covered', implementation_status: 'partial' });

      // Excluding the control, with a reason, excludes the requirement it alone meets.
      await patch(`/api/v1/soa/${MFA}`, { applicable: false, justification: 'No privileged accounts' });
      const after = await get('/api/v1/soa?framework=iso27001');
      expect(find(after.body, REF_1)).toMatchObject({
        requirement_state: 'excluded', justification: 'No privileged accounts',
      });
    } finally {
      await patch(`/api/v1/soa/${MFA}`, { applicable: true, implementation_status: 'implemented', justification: '' });
    }
  });

  it('a requirement refuses the fields it derives', async () => {
    const res = await patch(`/api/v1/soa/${REF_1}`, { applicable: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/derived from the control objectives mapped to it/);
  });

  it('the old per-standard table is gone', async () => {
    const { rows } = await query(`SELECT to_regclass('standard_soa_entries') AS t`);
    expect(rows[0].t).toBeNull();
  });
});

describe('a requirement records one thing: its exclusion', () => {
  afterEach(async () => {
    await query(`DELETE FROM standard_requirement_exclusions WHERE standard_control_id = $1`, [REF_1]);
  });

  it('excludes with a reason, wins over the applicable control, and is audited', async () => {
    const res = await patch(`/api/v1/soa/${REF_1}`, { excluded: true, justification: 'Out of certification scope' });
    expect(res.status).toBe(200);

    const view = await get('/api/v1/soa?framework=iso27001');
    expect(find(view.body, REF_1)).toMatchObject({
      requirement_state: 'excluded', exclusion: 'explicit', justification: 'Out of certification scope',
    });
    // The control itself is untouched: it may serve another standard.
    const all = await get('/api/v1/soa');
    expect(find(all.body, MFA).applicable).toBe(true);

    const { rows } = await query(
      `SELECT action, new_value FROM audit_log
        WHERE entity_type = 'standard_requirement_exclusion' AND entity_id = $1
        ORDER BY created_at DESC LIMIT 1`, [REF_1]);
    expect(rows[0]).toMatchObject({ action: 'create', new_value: 'Out of certification scope' });
  });

  it('refuses an exclusion without a reason — the database agrees', async () => {
    expect((await patch(`/api/v1/soa/${REF_1}`, { excluded: true, justification: '' })).status).toBe(400);
    await expect(query(
      `INSERT INTO standard_requirement_exclusions (standard_control_id, justification) VALUES ($1, '   ')`, [REF_1],
    )).rejects.toThrow(/chk_requirement_exclusion_reason/);
  });

  it('withdrawing an exclusion puts the derived state back', async () => {
    await patch(`/api/v1/soa/${REF_1}`, { excluded: true, justification: 'temporary' });
    expect((await patch(`/api/v1/soa/${REF_1}`, { excluded: false })).status).toBe(200);
    const view = await get('/api/v1/soa?framework=iso27001');
    expect(find(view.body, REF_1).requirement_state).toBe('covered');
  });
});

describe('standards come from the registry, not a list in the code', () => {
  let stdId;
  let reqId;

  beforeAll(async () => {
    const s = await query(
      `INSERT INTO standards (code, name, is_enabled, sort_index) VALUES ('int_test_std', 'Integration Test Standard', TRUE, 95)
       RETURNING id`);
    stdId = s.rows[0].id;
    const r = await query(
      `INSERT INTO standard_controls (standard_id, ref_code, title, grouping, sort_index)
       VALUES ($1, '9.1', 'Something unmapped', 'Invented section', '009.001.000') RETURNING id`, [stdId]);
    reqId = r.rows[0].id;
    await query(`INSERT INTO control_mappings (control_id, standard_control_id, coverage) VALUES ($1, $2, 'partial')`, [MFA, reqId]);
  });

  afterAll(async () => {
    await query(`DELETE FROM standards WHERE id = $1`, [stdId]);
  });

  it('a standard loaded after the code was written has an SoA view of its own', async () => {
    const res = await get('/api/v1/soa?framework=int_test_std');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ framework: 'int_test_std', framework_label: 'Integration Test Standard' });
    expect(res.body.groups.map(g => g.label)).toEqual(['Invented section']);
    expect(find(res.body, reqId).requirement_state).toBe('partial');
  });

  it('the overlap shows on the control in the record', async () => {
    const all = await get('/api/v1/soa');
    expect(find(all.body, MFA).standard_refs.map(r => r.code)).toEqual(expect.arrayContaining(['iso27001', 'int_test_std']));
  });

  it('the control library filters on it', async () => {
    const res = await get('/api/v1/controls?framework=int_test_std');
    expect(res.status).toBe(200);
    expect(res.body.controls.map(c => c.id)).toEqual([MFA]);
  });

  it('the standards list counts it as applicable, derived, and returns numbers', async () => {
    const res = await get('/api/v1/standards');
    const std = res.body.standards.find(s => s.code === 'int_test_std');
    expect(std).toMatchObject({ reference_count: 1, mapped_count: 1, applicable_count: 1 });
  });
});

describe('an approved version is a snapshot of the record', () => {
  afterAll(async () => {
    await query(`DELETE FROM soa_versions`);
  });

  it('snapshots every control, not a standard with nothing loaded', async () => {
    const { rows } = await query(`SELECT count(*)::int AS n FROM controls`);
    const res = await request(app).post('/api/v1/soa/versions').set('Authorization', auth()).send({ note: 'int' });
    expect(res.status).toBe(201);
    expect(res.body.version.control_count).toBe(rows[0].n);
  });

  // The approval flow had never been exercised on real data (0 versions on
  // CIRKS-test). Walk it end to end: approve, list, read back, export the frozen
  // CSV, and refuse an identical re-approval.
  it('approves, lists, reads back and exports a frozen version', async () => {
    const list = await get('/api/v1/soa/versions');
    expect(list.status).toBe(200);
    const v = list.body.versions[0];
    expect(v).toMatchObject({ note: 'int' });

    const one = await get(`/api/v1/soa/versions/${v.id}`);
    expect(one.status).toBe(200);
    expect(one.body.version.snapshot.length).toBe(v.control_count);
    expect(one.body.version.snapshot[0]).toHaveProperty('standard_refs');

    const csv = await get(`/api/v1/soa/versions/${v.id}/export`);
    expect(csv.status).toBe(200);
    const [header, ...lines] = csv.text.trim().split('\n');
    expect(header).toBe('Reference,Standards,Control,Description,Applicable,Drivers,Justification,Implementation status,Implementation description,Owner');
    expect(lines.length).toBeGreaterThanOrEqual(v.control_count);

    const again = await request(app).post('/api/v1/soa/versions').set('Authorization', auth()).send({});
    expect(again.status).toBe(409);
  });
});
