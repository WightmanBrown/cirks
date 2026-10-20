'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// GET /soa/coverage — risk traceability (defect 1f).
//
// It used to hard-filter `standards.code = 'iso27001'` and returned ZERO rows on
// every real instance: ISO/IEC 27001 is registered with 0 controls and the 106
// loaded are NIST CSF. The bands, the untreated-risk queue and the auditor's
// question were all dead, and looked merely empty.
//
// No test caught it because the FIXTURE has an ISO control and production does
// not — so "coverage returns rows for ISO" passed while production returned
// nothing. These tests therefore assert the CONTRACT rather than a catalogue:
// coverage describes whatever `GET /soa` describes for the same ?framework=.

const { app, request, tokenFor, query, USERS, IT_DEPT } = require('./helpers');

const get = (path) => request(app).get(path)
  .set('Authorization', `Bearer ${tokenFor('ciso')}`);

const coverage = (fw) => get('/api/v1/soa/coverage' + (fw ? `?framework=${fw}` : ''));
const soa      = (fw) => get('/api/v1/soa' + (fw ? `?framework=${fw}` : ''));

const idsOfSoa = (body) => (body.groups || []).flatMap(g => g.controls.map(c => c.control_id)).sort();

describe('GET /soa/coverage follows the framework, not a hardcoded standard', () => {
  // The regression itself: a standard that is NOT iso27001 must come back
  // populated. Before the fix this was zero for every framework but ISO.
  it.each(['all', 'iso27001', 'cis_v8'])('returns rows for ?framework=%s', async (fw) => {
    const res = await coverage(fw);
    expect(res.status).toBe(200);
    expect(res.body.framework).toBe(fw);
    expect(res.body.controls.length).toBeGreaterThan(0);
  });

  it('defaults to the same view as the SoA page itself', async () => {
    const res = await coverage();
    expect(res.body.framework).toBe('all');
  });

  // The contract that cannot drift: the two halves of the page must describe the
  // same controls, or a band is attached to something the reader is not seeing.
  it.each(['all', 'iso27001', 'cis_v8'])('covers exactly the controls /soa lists (%s)', async (fw) => {
    const [cov, page] = await Promise.all([coverage(fw), soa(fw)]);
    expect(cov.body.controls.map(c => c.control_id).sort()).toEqual(idsOfSoa(page.body));
  });

  // It used to fall back to 'all' — and that silent fallback is what hid a newly
  // loaded standard: asking for it returned every control under the wrong name.
  // Views are now read from the standards registry; an unknown one is a 404.
  it('refuses a framework that is not in the standards registry', async () => {
    const res = await coverage('not_a_standard');
    expect(res.status).toBe(404);
  });
});

describe('the derived figures', () => {
  let orphanId;

  beforeAll(async () => {
    // A control on no system at all. `deployed` was `SELECT TRUE` beside an
    // aggregate with no GROUP BY, so the subquery returned a row regardless and
    // every control — including this one — reported deployed.
    const c = await query(
      `INSERT INTO controls (title, description, control_type, created_by)
       VALUES ('ORPHAN coverage control', 'On no system anywhere.', 'preventive', $1)
       RETURNING id`, [USERS.ciso.id]);
    orphanId = c.rows[0].id;
  });

  afterAll(async () => {
    await query(`DELETE FROM soa_entries WHERE control_id = $1`, [orphanId]);
    await query(`DELETE FROM controls WHERE id = $1`, [orphanId]);
  });

  it('does not call a control deployed when it is on no system', async () => {
    const res = await coverage('all');
    const row = res.body.controls.find(c => c.control_id === orphanId);
    expect(row).toBeDefined();
    expect(row.deployed).toBe(false);
    expect(row.risks_treated).toBe(0);          // a number, not pg's bigint-as-string
  });

  it('returns counts as numbers, not bigint-as-string', async () => {
    const { body } = await coverage('all');
    for (const c of body.controls) {
      expect(typeof c.risks_treated).toBe('number');
      expect(typeof c.systems_count).toBe('number');
    }
  });

  it('bands every control, and every band is one the UI knows', async () => {
    const res = await coverage('all');
    const known = ['treated', 'baseline', 'untraced', 'not_applicable'];
    expect(res.body.controls.every(c => known.includes(c.band))).toBe(true);
  });

  it('summary counts agree with the rows they summarise', async () => {
    const { body } = await coverage('all');
    const applicable = body.controls.filter(c => c.applicable);
    expect(body.summary.applicable).toBe(applicable.length);
    for (const band of ['treated', 'baseline', 'untraced']) {
      expect(body.summary[band]).toBe(applicable.filter(c => c.band === band).length);
    }
    expect(body.summary.applicable).toBe(
      body.summary.treated + body.summary.baseline + body.summary.untraced);
  });

  it('reports the appetite score the untreated-risk list was filtered on', async () => {
    const { body } = await coverage('all');
    expect(typeof body.appetite_score).toBe('number');
    expect(body.untreated_risks.every(r => r.risk_score >= body.appetite_score)).toBe(true);
  });
});
