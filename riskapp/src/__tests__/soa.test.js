'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Mocked unit tests for the Statement of Applicability route (Sprint 1).
// DB pool is mocked — these exercise route/controller logic only: capability
// gating, input validation, and the GET shape. Real data shape is covered by the
// runtime verification, not here.

const request = require('supertest');
const { makeToken } = require('./setup');

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  // withActor runs its callback against the same mocked query (a transaction in
  // the real pool; here the calls are simply recorded in order).
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery,
           withActor: (userId, fn) => fn({ query: mockQuery }) };
});
const { query: mockQuery } = require('../db/pool');

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

const createApp = require('../app');
const app = createApp();

const ciso = () => `Bearer ${makeToken({ role: 'ciso' })}`;          // holds controls.read + controls.write
// meeting_secretary holds no controls.* caps (IAO/IAM gained controls.read in v84).
const noRead = () => `Bearer ${makeToken({ role: 'meeting_secretary' })}`;

beforeEach(() => {
  jest.clearAllMocks();
  // mockReset, not clearAllMocks alone: `mockResolvedValueOnce` values that a
  // test queued and did not consume otherwise survive into the NEXT test and
  // answer its first query. That is how a controller change here surfaced as
  // five unrelated failures (2026-09-25).
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/v1/soa', () => {
  it('401 unauthenticated', async () => {
    const res = await request(app).get('/api/v1/soa');
    expect(res.status).toBe(401);
  });

  it('403 for a role without controls.read', async () => {
    const res = await request(app).get('/api/v1/soa').set('Authorization', noRead());
    expect(res.status).toBe(403);
  });

  it('a standard view derives each requirement from its mapped controls, grouped by Annex A theme', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'iso27001', name: 'ISO/IEC 27001' }], rowCount: 1 })   // resolveView
      .mockResolvedValueOnce({ rows: [
        { control_id: 's1', ref: 'A.5.1', title: 'Policies', description: 'd', grouping: null, exclusion_justification: null,
          mapped_controls: [{ control_id: 'c1', coverage: 'full', decided: true, applicable: true, implementation_status: 'implemented', justification: 'Board-approved', drivers: ['business'] }] },
        { control_id: 's2', ref: 'A.8.5', title: 'Auth', description: 'd', grouping: null, exclusion_justification: 'No privileged access exists',
          mapped_controls: [{ control_id: 'c2', coverage: 'full', decided: true, applicable: true, implementation_status: 'implemented', justification: null, drivers: [] }] },
        { control_id: 's3', ref: 'A.8.9', title: 'Config', description: 'd', grouping: null, exclusion_justification: null, mapped_controls: [] },
      ], rowCount: 3 });
    const res = await request(app).get('/api/v1/soa?framework=iso27001').set('Authorization', ciso());
    expect(res.status).toBe(200);
    expect(res.body.framework).toBe('iso27001');
    expect(res.body.framework_label).toBe('ISO/IEC 27001');
    expect(res.body.summary).toMatchObject({ total: 3, applicable: 1, covered: 1, excluded: 1, gap: 1, implemented: 1 });
    const org  = res.body.groups.find(g => g.label === 'Organizational');
    const tech = res.body.groups.find(g => g.label === 'Technological');
    expect(org.controls[0]).toMatchObject({ ref: 'A.5.1', requirement_state: 'covered', justification: 'Board-approved', drivers: ['business'] });
    // An explicit exclusion wins even though its control is applicable elsewhere.
    expect(tech.controls.map(c => [c.ref, c.requirement_state])).toEqual([['A.8.5', 'excluded'], ['A.8.9', 'gap']]);
  });

  it('a standard loaded after the code was written has a view of its own', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'tpss_test', name: 'Test Payment Security Standard' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [
        { control_id: 's1', ref: '2.3', title: 'Retention', description: 'd', grouping: 'Protecting stored payment data', exclusion_justification: null, mapped_controls: [] },
      ], rowCount: 1 });
    const res = await request(app).get('/api/v1/soa?framework=tpss_test').set('Authorization', ciso());
    expect(res.status).toBe(200);
    expect(res.body.framework).toBe('tpss_test');
    expect(res.body.groups.map(g => g.label)).toEqual(['Protecting stored payment data']);
  });

  it('keeps each section of a lettered standard together (NIST refs like GV.OC-01)', async () => {
    const r = (id, ref, grouping) => ({ control_id: id, ref, title: ref, description: 'd', grouping, exclusion_justification: null, mapped_controls: [] });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'nist_csf', name: 'NIST CSF' }], rowCount: 1 })
      // The database hands these back interleaved: every "-01" shares sort_index 000.001.000.
      .mockResolvedValueOnce({ rows: [r('1', 'DE.CM-01', 'Continuous Monitoring'), r('2', 'GV.OC-01', 'Organizational Context'),
                                      r('3', 'DE.CM-02', 'Continuous Monitoring'), r('4', 'GV.OC-02', 'Organizational Context')], rowCount: 4 });
    const res = await request(app).get('/api/v1/soa?framework=nist_csf').set('Authorization', ciso());
    expect(res.body.groups.map(g => [g.label, g.controls.map(c => c.ref)])).toEqual([
      ['Continuous Monitoring', ['DE.CM-01', 'DE.CM-02']],
      ['Organizational Context', ['GV.OC-01', 'GV.OC-02']],
    ]);
  });

  it('404 for a standard that is not in the registry, rather than silently showing another view', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/v1/soa?framework=nope').set('Authorization', ciso());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/unknown standard/i);
  });

  it('framework=all (default) groups controls by first mapped standard and lists every mapping', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [
        { control_id: '1', title: 'Policies',  description: 'd', status: 'active',       applicable: true,  drivers: [], justification: null, implementation_status: 'implemented',     owner_user_id: null, owner_name: null,
          standard_refs: [{ code: 'iso27001', name: 'ISO/IEC 27001', ref: 'A.5.1' }, { code: 'tpss_test', name: 'Test Payment Security Standard', ref: '1.1' }] },
        { control_id: '2', title: 'Inventory', description: 'd', status: 'under_review', applicable: true,  drivers: [], justification: null, implementation_status: 'not_implemented', owner_user_id: null, owner_name: null,
          standard_refs: [{ code: 'cis_v8', name: 'CIS Critical Security Controls', ref: '1.1' }] },
        { control_id: '3', title: 'Bespoke',   description: 'd', status: 'under_review', applicable: false, drivers: [], justification: null, implementation_status: 'not_implemented', owner_user_id: null, owner_name: null,
          reference_code: 'ORG-01', standard_refs: [] },
      ], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [{ name: 'ISO/IEC 27001' }, { name: 'CIS Critical Security Controls' }, { name: 'Test Payment Security Standard' }], rowCount: 3 });
    const res = await request(app).get('/api/v1/soa').set('Authorization', ciso());
    expect(res.status).toBe(200);
    expect(res.body.framework).toBe('all');
    expect(res.body.groups.map(g => g.label)).toEqual(['ISO/IEC 27001', 'CIS Critical Security Controls', 'Custom control objectives']);
    // A custom objective carries its own reference.
    expect(res.body.groups[2].controls[0].ref).toBe('ORG-01');
    // The overlap is carried on the row, not lost to the grouping.
    expect(res.body.groups[0].controls[0].standard_refs.map(r => r.code)).toEqual(['iso27001', 'tpss_test']);
  });
});

describe('PATCH /api/v1/soa/:controlId', () => {
  it('403 for a role without controls.write', async () => {
    const res = await request(app).patch('/api/v1/soa/abc').set('Authorization', noRead()).send({ applicable: false });
    expect(res.status).toBe(403);
  });

  it('400 on invalid implementation_status', async () => {
    const res = await request(app).patch('/api/v1/soa/abc').set('Authorization', ciso()).send({ implementation_status: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('400 on an unknown driver', async () => {
    const res = await request(app).patch('/api/v1/soa/abc').set('Authorization', ciso()).send({ drivers: ['risk', 'nope'] });
    expect(res.status).toBe(400);
  });

  it('404 when neither a control nor a standard control exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // controls lookup → none
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // standard_controls lookup → none
    const res = await request(app).patch('/api/v1/soa/abc').set('Authorization', ciso()).send({ applicable: false });
    expect(res.status).toBe(404);
  });

  it('a requirement refuses the fields it derives, and says where to edit them', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                                         // not a native control
      .mockResolvedValueOnce({ rows: [{ id: 'sc1', ref_code: 'A.5.1', standard_name: 'ISO/IEC 27001' }], rowCount: 1 });
    const res = await request(app).patch('/api/v1/soa/sc1').set('Authorization', ciso())
      .send({ applicable: true, implementation_status: 'implemented' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/derived from the control objectives mapped to it/);
    expect(mockQuery.mock.calls.some(c => /INSERT|UPDATE/.test(c[0]))).toBe(false);
  });

  it('excluding a requirement needs a reason', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'sc1', ref_code: '2.3', standard_name: 'TPSS' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                                        // no exclusion yet
    const res = await request(app).patch('/api/v1/soa/sc1').set('Authorization', ciso()).send({ excluded: true, justification: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason is required/i);
  });

  it('excluding a requirement records the reason and audits it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'sc1', ref_code: '2.3', standard_name: 'TPSS' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                                         // no exclusion yet
      .mockResolvedValueOnce({ rows: [{ standard_control_id: 'sc1', justification: 'We hold no stored card data' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                                        // audit
    const res = await request(app).patch('/api/v1/soa/sc1').set('Authorization', ciso())
      .send({ excluded: true, justification: 'We hold no stored card data' });
    expect(res.status).toBe(200);
    expect(res.body.exclusion).toMatchObject({ justification: 'We hold no stored card data' });
    expect(mockQuery.mock.calls.some(c => /INSERT INTO standard_requirement_exclusions/.test(c[0]))).toBe(true);
    const audit = mockQuery.mock.calls.find(c => /INSERT INTO audit_log/.test(c[0]));
    expect(audit[1]).toContain('create');
    expect(mockQuery.mock.calls.some(c => /UPDATE controls SET status/.test(c[0]))).toBe(false);
  });

  it('withdrawing an exclusion deletes it and keeps the old reason in the audit trail', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'sc1', ref_code: '2.3', standard_name: 'TPSS' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ justification: 'old reason' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                                                         // DELETE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                                        // audit
    const res = await request(app).patch('/api/v1/soa/sc1').set('Authorization', ciso()).send({ excluded: false });
    expect(res.status).toBe(200);
    expect(res.body.exclusion).toBeNull();
    const audit = mockQuery.mock.calls.find(c => /INSERT INTO audit_log/.test(c[0]));
    expect(audit[1]).toContain('old reason');
  });

  it('a control accepts an implementation description', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c1', effectiveness: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ control_id: 'c1', implementation_description: 'ManageEngine 365' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app).patch('/api/v1/soa/c1').set('Authorization', ciso())
      .send({ implementation_description: 'ManageEngine 365' });
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][0]).toMatch(/implementation_description = \$1/);
    expect(mockQuery.mock.calls[1][1][0]).toBe('ManageEngine 365');
  });

  // The objective's status is DERIVED (v124). Changing applicability writes no
  // status; the response reports what the derivation now says, so the page can
  // relabel the row without a reload.
  it.each([
    [false, 'not_applicable'],
    [true,  'not_assessed'],
    [true,  'adopted'],
  ])('applicable=%s reports the derived status %s and writes none', async (applicable, derived) => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c1', effectiveness: null }], rowCount: 1 })   // control exists
      .mockResolvedValueOnce({ rows: [{ control_id: 'c1', applicable }], rowCount: 1 });   // UPDATE soa_entries
    // Not applicable clears the scopes it applied in (v126) — one DELETE.
    if (!applicable) mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // No controller audit row any more: the v131 trigger records the change
    // with its old and new values.
    mockQuery.mockResolvedValueOnce({ rows: [{ status: derived }], rowCount: 1 });          // v_control_status
    const res = await request(app).patch('/api/v1/soa/c1').set('Authorization', ciso()).send({ applicable });
    expect(res.status).toBe(200);
    expect(res.body.control_status).toBe(derived);
    expect(mockQuery.mock.calls.some(c => /DELETE FROM soa_entry_scopes/.test(c[0]))).toBe(!applicable);
    expect(mockQuery.mock.calls.some(c => /UPDATE controls/.test(c[0]))).toBe(false);
    expect(mockQuery.mock.calls.some(c => /v_control_status/.test(c[0]))).toBe(true);
  });

  it('editing only justification does not look up the status', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c1', framework_ref: 'A.5.1', effectiveness: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ control_id: 'c1', applicable: true }], rowCount: 1 });
    const res = await request(app).patch('/api/v1/soa/c1').set('Authorization', ciso()).send({ justification: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.control_status).toBeUndefined();
    expect(mockQuery.mock.calls.some(c => /v_control_status/.test(c[0]))).toBe(false);
  });
});

describe('SoA sealed versions', () => {
  it('POST /soa/versions 403 without controls.write', async () => {
    const res = await request(app).post('/api/v1/soa/versions').set('Authorization', noRead()).send({});
    expect(res.status).toBe(403);
  });

  it('POST /soa/versions snapshots the live SoA and audit-logs it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [ // the record (all controls)
        { control_id: 'c1', title: 'x', description: 'd', applicable: true,  drivers: [], justification: null, implementation_status: 'implemented', owner_name: null, standard_refs: [] },
        { control_id: 'c2', title: 'y', description: 'd', applicable: false, drivers: ['contractual'], justification: 'z', implementation_status: 'not_implemented', owner_name: null, standard_refs: [] },
      ], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                           // standards order
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                           // latest version → none yet
      .mockResolvedValueOnce({ rows: [{ id: 'v1', version_no: 1, control_count: 2, applicable_count: 1 }], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                          // audit
    const res = await request(app).post('/api/v1/soa/versions').set('Authorization', ciso()).send({ note: 'baseline' });
    expect(res.status).toBe(201);
    expect(res.body.version).toMatchObject({ version_no: 1, applicable_count: 1 });
    expect(mockQuery.mock.calls.some(c => /INSERT INTO audit_log/.test(c[0]))).toBe(true);
  });

  it('POST /soa/versions 409 when nothing changed since the last approved version', async () => {
    const live = [
      { control_id: 'c1', title: 'x', description: 'd', applicable: true,  drivers: [], justification: null, implementation_status: 'implemented', owner_name: null, standard_refs: [] },
      { control_id: 'c2', title: 'y', description: 'd', applicable: false, drivers: ['contractual'], justification: 'z', implementation_status: 'not_implemented', owner_name: null, standard_refs: [] },
    ];
    mockQuery
      .mockResolvedValueOnce({ rows: live.map(r => ({ ...r })), rowCount: 2 })                    // the record
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                           // standards order
      // latest version with an identical snapshot (drivers reordered to prove order-independence)
      .mockResolvedValueOnce({ rows: [{ version_no: 3, snapshot: live }], rowCount: 1 });
    const res = await request(app).post('/api/v1/soa/versions').set('Authorization', ciso()).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/nothing has changed since version 3/i);
    // Must NOT have inserted a new version row.
    expect(mockQuery.mock.calls.some(c => /INSERT INTO soa_versions/.test(c[0]))).toBe(false);
  });

  it('POST /soa/versions allows approval when an entry changed since the last version', async () => {
    const stored = [{ control_id: 'c1', title: 'x', description: 'd', applicable: true, drivers: [], justification: null, implementation_status: 'planned', owner_name: null }];
    const live   = [{ control_id: 'c1', title: 'x', description: 'd', applicable: true, drivers: [], justification: null, implementation_status: 'implemented', owner_name: null, standard_refs: [] }];
    mockQuery
      .mockResolvedValueOnce({ rows: live, rowCount: 1 })                                         // the record
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                           // standards order
      .mockResolvedValueOnce({ rows: [{ version_no: 2, snapshot: stored }], rowCount: 1 })        // latest (differs)
      .mockResolvedValueOnce({ rows: [{ id: 'v3', version_no: 3, control_count: 1, applicable_count: 1 }], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                          // audit
    const res = await request(app).post('/api/v1/soa/versions').set('Authorization', ciso()).send({});
    expect(res.status).toBe(201);
    expect(res.body.version).toMatchObject({ version_no: 3 });
  });

  it('GET /soa/versions lists history for a reader', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v1', version_no: 1, applicable_count: 92, control_count: 93 }], rowCount: 1 });
    const res = await request(app).get('/api/v1/soa/versions').set('Authorization', ciso());
    expect(res.status).toBe(200);
    expect(res.body.versions[0]).toMatchObject({ version_no: 1 });
  });

  it('GET /soa/versions/:id 404 when missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/v1/soa/versions/nope').set('Authorization', ciso());
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/soa/coverage (Sprint 2b risk traceability)', () => {
  it('403 for a role without controls.read', async () => {
    const res = await request(app).get('/api/v1/soa/coverage').set('Authorization', noRead());
    expect(res.status).toBe(403);
  });

  it('partitions applicable controls into treated/baseline/untraced + lists untreated risks', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ mandatory_action_score: 12 }], rowCount: 1 }) // org_config appetite
      .mockResolvedValueOnce({ rows: [ // per-control coverage
        { control_id: 'c1', ref: 'A.8.7', title: 'Malware', applicable: true,  implementation_status: 'implemented',     drivers: ['risk'],     risks_treated: 3, systems_count: 2, max_treated_score: 16, deployed: true,  any_verified: true  },
        { control_id: 'c2', ref: 'A.6.3', title: 'Training', applicable: true, implementation_status: 'implemented',     drivers: ['business'], risks_treated: 0, systems_count: 0, max_treated_score: null, deployed: true, any_verified: false },
        { control_id: 'c3', ref: 'A.5.7', title: 'Threat intel', applicable: true, implementation_status: 'not_implemented', drivers: [],       risks_treated: 0, systems_count: 0, max_treated_score: null, deployed: false, any_verified: false },
        { control_id: 'c4', ref: 'A.8.1', title: 'Endpoint', applicable: false, implementation_status: 'not_implemented', drivers: ['contractual'], risks_treated: 0, systems_count: 0, max_treated_score: null, deployed: false, any_verified: false },
      ], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [ // untreated risks above appetite
        { risk_id: 'r1', risk_score: 20, system_name: 'Payroll', threat_name: 'Ransomware' },
      ], rowCount: 1 });

    const res = await request(app).get('/api/v1/soa/coverage').set('Authorization', ciso());
    expect(res.status).toBe(200);
    expect(res.body.appetite_score).toBe(12);
    expect(res.body.summary).toMatchObject({ applicable: 3, treated: 1, baseline: 1, untraced: 1, untreated_risks: 1 });
    const byRef = Object.fromEntries(res.body.controls.map(c => [c.ref, c.band]));
    expect(byRef).toMatchObject({ 'A.8.7': 'treated', 'A.6.3': 'baseline', 'A.5.7': 'untraced', 'A.8.1': 'not_applicable' });
    expect(res.body.untreated_risks[0]).toMatchObject({ system_name: 'Payroll', threat_name: 'Ransomware', risk_score: 20 });
  });
});

describe('deriveRequirement — a requirement read through the controls mapped to it', () => {
  const { deriveRequirement } = require('../routes/soa');
  const ctl = (o) => ({ decided: true, applicable: true, coverage: 'full', implementation_status: 'implemented', justification: null, drivers: [], ...o });

  it('covered by any applicable full mapping, at the best status among them', () => {
    const d = deriveRequirement([ctl({ implementation_status: 'planned' }), ctl({ implementation_status: 'partial' })]);
    expect(d).toMatchObject({ state: 'covered', applicable: true, implementation_status: 'partial' });
  });

  it('only partial mappings: partly covered, and never better than partial', () => {
    const d = deriveRequirement([ctl({ coverage: 'partial', implementation_status: 'implemented' })]);
    expect(d).toMatchObject({ state: 'partial', implementation_status: 'partial' });
  });

  it('a full mapping to a not-applicable control does not cover; an applicable partial one partly does', () => {
    const d = deriveRequirement([ctl({ applicable: false }), ctl({ coverage: 'partial' })]);
    expect(d.state).toBe('partial');
  });

  it('an explicit exclusion wins over an applicable control and carries its own reason', () => {
    const d = deriveRequirement([ctl({ justification: 'used elsewhere' })], 'No card data held');
    expect(d).toMatchObject({ state: 'excluded', exclusion: 'explicit', applicable: false, justification: 'No card data held' });
  });

  it('every mapped control DECIDED not applicable: excluded, with their reasons', () => {
    const d = deriveRequirement([ctl({ applicable: false, justification: 'Outsourced' }), ctl({ applicable: false, justification: 'Outsourced' })]);
    expect(d).toMatchObject({ state: 'excluded', exclusion: 'inherited', justification: 'Outsourced' });
  });

  it('a control nobody has decided on leaves a gap, not an exclusion', () => {
    expect(deriveRequirement([ctl({ decided: false, applicable: false })]).state).toBe('gap');
  });

  it('an unmapped requirement is a gap', () => {
    expect(deriveRequirement([]).state).toBe('gap');
  });

  it('drivers and justifications are the union of the controls that cover it', () => {
    const d = deriveRequirement([ctl({ drivers: ['legal'], justification: 'A' }), ctl({ drivers: ['business', 'legal'], justification: 'B' })]);
    expect(d.drivers).toEqual(['business', 'legal']);
    expect(d.justification).toBe('A; B');
  });
});
