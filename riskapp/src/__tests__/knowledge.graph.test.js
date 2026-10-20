'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Mocked-pool unit tests for the walkable-graph neighbour resolver
// (routes/knowledge/graphController.neighbors). These assert the access
// contract: type validation, the seed read-cap gate, per-neighbour capability
// gating, and the department wall on dept-bearing neighbour queries. Real SQL
// behaviour is covered by the integration suite.

jest.mock('../db/pool', () => {
  const mockQuery = jest.fn();
  return { pool: { query: mockQuery, on: jest.fn() }, query: mockQuery };
});
jest.mock('../auth/permissions', () => ({
  can: jest.fn(),
  isDepartmentIsolationEnabled: jest.fn(),
}));
jest.mock('../auth/scoping', () => ({
  isDeptScoped: jest.fn(),
  getUserDepartment: jest.fn(),
}));

const { query: mockQuery } = require('../db/pool');
const { can, isDepartmentIsolationEnabled } = require('../auth/permissions');
const { isDeptScoped, getUserDepartment } = require('../auth/scoping');
const { neighbors } = require('../routes/knowledge/graphController');

async function run(user, type, id = 'ID-1') {
  let body;
  let statusCode = 200;
  const res = {
    json: (b) => { body = b; },
    status: (c) => { statusCode = c; return res; },
  };
  const next = jest.fn();
  await neighbors({ params: { type, id }, user }, res, next);
  return { body, statusCode, next };
}

const sqls = () => mockQuery.mock.calls.map((c) => c[0]);
const sqlMatching = (re) => sqls().filter((s) => re.test(s));

beforeEach(() => {
  jest.clearAllMocks();
  // A generic row that satisfies seed fetches (department_id = 'DEPT') and rel maps.
  mockQuery.mockResolvedValue({ rows: [{
    id: 'ID-1', nid: 'N-1', name: 'thing', title: 'a control',
    department_id: 'DEPT', is_shared: false, total_count: 1,
    threat_name: 'Phishing', system_name: 'AD', risk_score: 9,
    maturity: 3, status: 'active', subtype: 'technology', role: 'operates', rtype: 'depends_on',
  }] });
  can.mockReturnValue({ allowed: true, scope: 'all_depts' });
  isDeptScoped.mockReturnValue(false);
  isDepartmentIsolationEnabled.mockReturnValue(false);
  getUserDepartment.mockResolvedValue('DEPT');
});

describe('graph neighbours — validation & seed gate', () => {
  test('an unknown type is a 400 and runs no SQL', async () => {
    const { statusCode } = await run({ role: 'ciso', id: 'u' }, 'bogus');
    expect(statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('lacking the seed type read cap is a 403 (no seed fetch)', async () => {
    can.mockImplementation((role, cap) => ({ allowed: cap !== 'systems.read', scope: 'all_depts' }));
    const { statusCode } = await run({ role: 'soc_analyst', id: 'u' }, 'system');
    expect(statusCode).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('graph neighbours — capability-gated expansion', () => {
  test('a system seed with all caps expands to every neighbour relationship', async () => {
    const { body } = await run({ role: 'ciso', id: 'u' }, 'system');
    expect(sqlMatching(/FROM systems WHERE id = \$1/)).toHaveLength(1); // seed
    expect(sqlMatching(/FROM system_assets/)).toHaveLength(1);
    expect(sqlMatching(/FROM system_components/)).toHaveLength(1);
    expect(sqlMatching(/FROM risks/)).toHaveLength(1);
    expect(sqlMatching(/FROM system_controls/)).toHaveLength(1);
    expect(sqlMatching(/FROM system_threats/)).toHaveLength(1);
    expect(body).toHaveProperty('root', { type: 'system', id: 'ID-1' });
    expect(body.nodes.length).toBeGreaterThan(1);
  });

  test('a neighbour relationship is skipped when its read cap is absent', async () => {
    can.mockImplementation((role, cap) => ({ allowed: cap !== 'risks.read', scope: 'all_depts' }));
    await run({ role: 'consultant', id: 'u' }, 'system');
    expect(sqlMatching(/FROM risks/)).toHaveLength(0);      // no risks.read → no risk hop
    expect(sqlMatching(/FROM system_threats/)).toHaveLength(1); // catalogue still expands
  });
});

describe('graph neighbours — department walls', () => {
  test('a dept-scoped seed applies the dept wall to dept-bearing neighbours', async () => {
    isDeptScoped.mockReturnValue(true);
    isDepartmentIsolationEnabled.mockReturnValue(true);
    getUserDepartment.mockResolvedValue('DEPT');

    await run({ role: 'information_asset_manager', id: 'u' }, 'asset');

    // asset → systems / services / risks carry the dept wall on the neighbour
    // Anchored on `JOIN systems s`: the bare `s\.department_id` also matches the
    // substring inside `bs.department_id`, which the asset→service hop now has.
    expect(sqlMatching(/FROM system_assets sa JOIN systems s[\s\S]*\(s\.department_id = \$2/)).toHaveLength(1);
    // v104: an asset now reaches services through the systems holding it, so
    // match the hop by its shape rather than merely mentioning business_services
    // — a service seed also expands to its systems and its derived assets.
    expect(sqlMatching(/SELECT bs\.id AS nid[\s\S]*business_service_systems[\s\S]*bs\.department_id = \$2/)).toHaveLength(1);
    const deptCall = mockQuery.mock.calls.find((c) => /department_id = \$2/.test(c[0]));
    expect(deptCall[1]).toEqual(['ID-1', 'DEPT']);
  });

  test('a dept-scoped seed outside the user dept is forbidden', async () => {
    isDeptScoped.mockReturnValue(true);
    isDepartmentIsolationEnabled.mockReturnValue(true);
    getUserDepartment.mockResolvedValue('OTHER');
    // seed row has department_id 'DEPT' (default mock) ≠ 'OTHER'
    const { statusCode } = await run({ role: 'information_asset_owner', id: 'u' }, 'asset');
    expect(statusCode).toBe(403);
  });
});
