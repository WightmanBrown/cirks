'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * Tests — GET /api/v1/admin/export/* (CSV/TSV data export)
 *
 * Proves:
 *   1. 401 when unauthenticated.
 *   2. 403 for a non-admin role (capability gate: admin.manage).
 *   3. users → 200, text/csv, attachment disposition, correct header row,
 *      business keys only (no UUID column).
 *   4. ?format=tsv switches to tab separation + .tsv filename.
 *   5. role-permissions → correct header row.
 *   6. access-settings → derives the department_isolation row.
 */

const request = require('supertest');
const { makeToken } = require('./setup');

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery };
});
const { query: mockQuery } = require('../db/pool');

jest.mock('../middleware/requestLogger', () => {
  return (req, res, next) => { res.on('finish', () => {}); next(); };
});

const createApp = require('../app');
let app;
beforeAll(() => { app = createApp(); });

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

const ADMIN_TOKEN = makeToken({ role: 'admin', sub: 'admin-uuid' });
const CISO_TOKEN  = makeToken({ role: 'ciso',  sub: 'ciso-uuid'  });

describe('GET /api/v1/admin/export', () => {
  test('1 — 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/admin/export/users');
    expect(res.status).toBe(401);
  });

  test('2 — 403 for non-admin role', async () => {
    const res = await request(app)
      .get('/api/v1/admin/export/users')
      .set('Authorization', `Bearer ${CISO_TOKEN}`);
    expect(res.status).toBe(403);
  });

  test('3 — users exports CSV with header row and business keys (no UUID)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { email: 'a@org.local', full_name: 'A One', primary_role: 'ciso',
        department_name: 'IT', is_active: true, totp_enabled: false, last_login_at: null },
    ] });

    const res = await request(app)
      .get('/api/v1/admin/export/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="users\.csv"/);
    const [header, row] = res.text.trim().split('\r\n');
    expect(header).toBe('email,full_name,primary_role,department_name,is_active,totp_enabled,last_login_at');
    expect(row).toBe('a@org.local,A One,ciso,IT,true,false,');
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no UUID leaked
  });

  test('4 — ?format=tsv switches separator + filename', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { email: 'a@org.local', full_name: 'A One', primary_role: 'ciso',
        department_name: 'IT', is_active: true, totp_enabled: false, last_login_at: null },
    ] });

    const res = await request(app)
      .get('/api/v1/admin/export/users?format=tsv')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/tab-separated-values/);
    expect(res.headers['content-disposition']).toMatch(/filename="users\.tsv"/);
    expect(res.text.split('\r\n')[0]).toBe('email\tfull_name\tprimary_role\tdepartment_name\tis_active\ttotp_enabled\tlast_login_at');
  });

  test('5 — role-permissions header row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { role: 'admin', capability_key: 'admin.manage', scope: 'all_depts' },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/role-permissions')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('role,capability_key,scope');
  });

  test('6 — access-settings derives department_isolation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ department_isolation: true }] });
    const res = await request(app)
      .get('/api/v1/admin/export/access-settings')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.trim()).toBe('setting,value\r\ndepartment_isolation,true');
  });

  test('7 — GET /all returns a zip attachment', async () => {
    // All 21 dataset queries return empty rows — we only check the envelope.
    mockQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/v1/admin/export/all')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/zip/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="riskapp-export-.*\.zip"/);
  });

  test('8 — threats header row and business keys', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { name: 'Phishing', description: null, threat_category: 'social_engineering',
        source: 'external', probability_c: 3, probability_i: 2, probability_a: 1,
        probability_notes: null, default_baseline_probability: null,
        reference_code: null, is_active: true },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/threats')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe(
      'name,description,threat_category,source,probability_c,probability_i,probability_a,probability_notes,default_baseline_probability,reference_code,is_active'
    );
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('8 — controls header row and business keys', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { framework: 'iso27001', framework_ref: 'A.8.5', title: 'MFA',
        description: null, control_type: 'preventive', status: 'active',
        is_baseline: true, framework_function: null,
        effectiveness: null, effectiveness_notes: null },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/controls')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    // status is derived (v124) and not exported; delivery and reference travel.
    expect(res.text.split('\r\n')[0]).toBe(
      'title,description,control_type,reference_code,delivery,is_baseline,effectiveness,effectiveness_notes,owner_email'
    );
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('9 — information-assets header row and business keys', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { name: 'HR records', description: null, department_name: 'HR',
        owner_email: 'o@org.local', managed_by_email: 'm@org.local',
        is_shared: false, is_active: true },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/information-assets')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('name,description,department_name,owner_email,managed_by_email,is_shared,is_active');
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('8 — asset-impact-ratings header row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { asset_name: 'HR records', impact_table_name: 'Reputational',
        rated_level: 3, c_level: null, i_level: 4, a_level: null },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/asset-impact-ratings')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('asset_name,impact_table_name,rated_level,c_level,i_level,a_level');
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('9 — systems header row and business keys', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { name: 'CRM', description: null, department_name: 'Finance',
        owner_email: 'a@org.local', manager_email: null, is_active: true },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/systems')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('name,description,department_name,owner_email,manager_email,is_shared,is_active');
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('8 — system-components header row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { system_name: 'CRM', component_name: 'IAM team', component_type: 'people', role: null, status: 'operational' },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/system-components')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('system_name,component_name,component_type,role,status');
  });

  test('8b — system-threats header row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { system_name: 'CRM', threat_name: 'Ransomware' },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/system-threats')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('system_name,threat_name');
  });

  test('8c — system-controls header row carries the per-system status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { system_name: 'CRM', control_title: 'Backups', status: 'degraded', provenance: 'recorded', notes: null },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/system-controls')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('system_name,control_title,status,provenance,notes,exclusion_reason');
    expect(res.text.split('\r\n')[1]).toBe('CRM,Backups,degraded,recorded,,');
  });

  test('9 — business-services header row and business keys', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { name: 'HR Portal', description: null, department_name: 'HR',
        owner_department_name: 'IT', manager_email: null, is_shared: false, is_active: true },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/business-services')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('name,description,department_name,owner_department_name,manager_email,is_shared,is_active');
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('8 — business-service-systems header row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { service_name: 'HR Portal', system_name: 'HR System' },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/business-service-systems')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('service_name,system_name');
  });

  test('9 — impact-tables header row and business keys', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { name: 'Reputational', description: null, scope: 'organisation',
        department_name: null, mandatory: true, published: true },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/impact-tables')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('name,description,scope,department_name,mandatory,published');
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('10 — impact-table-bil-levels header row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { table_name: 'Reputational', level: 1, statement: 'Negligible' },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/impact-table-bil-levels')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('table_name,level,statement');
  });

  test('11 — impact-table-cia-levels header row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { table_name: 'Reputational', level: 1, dimension: 'c', statement: null },
    ] });
    const res = await request(app)
      .get('/api/v1/admin/export/impact-table-cia-levels')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('table_name,level,dimension,statement');
  });

  // The round trip (export → import into an empty database) must carry what later
  // migrations added: scope and documents (v137/v139), the SoA and scopes
  // (v122/v126), suppliers and evidence (v142–v144), host IP addresses.
  test.each([
    ['components', 'name,component_type,status,description,notes,created_by_email,instantiation,is_host,hostname,document_kind,document_version,document_owner_email,document_approved_by_email,document_approved_on,document_next_review,document_url'],
    ['component-ip-addresses', 'component_name,component_type,ip_address,label'],
    ['delivery-patterns', 'name,kind,notes'],
    ['delivery-pattern-objectives', 'pattern_name,control_title'],
    ['delivery-pattern-parts', 'pattern_name,component_name,component_type,location,service_system_name'],
    ['architecture-rules', 'pattern_name,standard_name,notes,trigger_component_name,trigger_component_type'],
    ['membership-groups', 'group_name,standard_name,notes,sort_index,role,component_name,component_type'],
    ['system-builds', 'build_name,notes,component_name,component_type'],
    ['solution-choices', 'system_name,control_title,pattern_name,notes,chosen_by_email,source'],
    ['soa-entries', 'control_title,applicable,drivers,justification,implementation_status,implementation_description,owner_email'],
    ['scopes', 'name,description'],
    ['scope-systems', 'scope_name,system_name'],
    ['soa-entry-scopes', 'control_title,scope_name'],
    ['suppliers', 'name,notes'],
    ['supplier-relationships', 'supplier_name,relationship_type,department_name,system_name,component_name,component_type,description,contract_ref,contract_url,contract_start,contract_end,status'],
    ['supplier-type-objectives', 'applies_to,control_title'],
    ['supplier-evidence', 'supplier_name,relationship_type,system_name,component_name,component_type,kind,title,reference,url,issued_on,expires_on,control_titles'],
  ])('round-trip dataset %s has its header', async (slug, header) => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`/api/v1/admin/export/${slug}`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe(header);
  });
});
