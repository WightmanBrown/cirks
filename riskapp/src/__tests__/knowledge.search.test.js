'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Mocked-pool unit tests for the universal knowledge search resolver
// (routes/knowledge/enrichmentController.searchAll, exercised via the `search`
// handler). These assert the *scoping contract*: which entity queries are issued
// for a given role (capability gating) and whether each carries the department
// wall (dept-scoped role + isolation on). The real SQL is covered by the
// integration suite; here we only inspect the strings/params handed to the pool.

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
const { search } = require('../routes/knowledge/enrichmentController');

// Invoke the handler and resolve once res.json / next has fired.
async function run(user, q = 'ad') {
  let body;
  let statusCode = 200;
  const res = {
    json: (b) => { body = b; },
    status: (c) => { statusCode = c; return res; },
  };
  const next = jest.fn();
  await search({ query: { q }, user }, res, next);
  return { body, statusCode, next };
}

// All SQL strings handed to the pool this run.
const sqls = () => mockQuery.mock.calls.map((c) => c[0]);
const sqlMatching = (re) => sqls().filter((s) => re.test(s));

// Identify a query by the entity it PRODUCES, not by the tables it mentions.
// Matching /FROM risks/ was ambiguous the moment the systems block gained a
// "worst active risk" subquery — a block's entity_type literal is the only
// thing unique to it.
const ENTITY_MARK = {
  business_services:  /'service' AS entity_type/,
  information_assets: /'asset' AS entity_type/,
  systems:            /'system' AS entity_type/,
  control_components: /cc\.component_type AS entity_type/,
  risks:              /'risk' AS entity_type/,
  security_actions:   /'action' AS entity_type/,
  threats:            /'threat' AS entity_type/,
  controls:           /'control' AS entity_type/,
};
const blocksFor = (table) => sqlMatching(ENTITY_MARK[table]);

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  // sensible defaults; each test overrides what it needs
  can.mockReturnValue({ allowed: true, scope: 'all_depts' });
  isDeptScoped.mockReturnValue(false);
  isDepartmentIsolationEnabled.mockReturnValue(false);
  getUserDepartment.mockResolvedValue('DEPT-1');
});

describe('knowledge search — capability gating', () => {
  test('a global role with all caps queries all eight entities, unscoped', async () => {
    await run({ role: 'ciso', id: 'u-ciso' });

    expect(mockQuery).toHaveBeenCalledTimes(8);
    expect(blocksFor('business_services')).toHaveLength(1);
    expect(blocksFor('information_assets')).toHaveLength(1);
    expect(blocksFor('systems')).toHaveLength(1);
    expect(blocksFor('control_components')).toHaveLength(1);
    expect(blocksFor('risks')).toHaveLength(1);
    expect(blocksFor('security_actions')).toHaveLength(1);
    expect(blocksFor('threats')).toHaveLength(1);
    expect(blocksFor('controls')).toHaveLength(1);
    // no department wall when not dept-scoped
    expect(sqlMatching(/department_id = \$2/)).toHaveLength(0);
    // every query parameterised with just the search term
    mockQuery.mock.calls.forEach((c) => expect(c[1]).toEqual(['%ad%']));
  });

  test('an entity is omitted when the caller lacks its read capability', async () => {
    can.mockImplementation((role, cap) => ({
      allowed: !['risks.read', 'actions.read'].includes(cap),
      scope: 'all_depts',
    }));

    await run({ role: 'consultant', id: 'u-con' });

    expect(blocksFor('risks')).toHaveLength(0);
    expect(blocksFor('security_actions')).toHaveLength(0);
    // org-wide catalogues + architecture still present
    expect(blocksFor('threats')).toHaveLength(1);
    expect(blocksFor('controls')).toHaveLength(1);
    expect(blocksFor('systems')).toHaveLength(1);
  });

  test('a knowledge.query-only role (no entity caps) queries nothing and returns total 0', async () => {
    can.mockImplementation((role, cap) => ({ allowed: cap === 'knowledge.query', scope: 'all_depts' }));

    const { body } = await run({ role: 'soc_analyst', id: 'u-soc' });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(body.total).toBe(0);
    expect(body.risks).toEqual([]);
    expect(body.services).toEqual([]);
  });
});

describe('knowledge search — department scoping', () => {
  test('a dept-scoped role with isolation on walls dept-bearing entities only', async () => {
    isDeptScoped.mockReturnValue(true);
    isDepartmentIsolationEnabled.mockReturnValue(true);
    getUserDepartment.mockResolvedValue('DEPT-IT');

    await run({ role: 'information_asset_manager', id: 'u-iam' });

    const get = (re) => sqlMatching(re)[0] || '';
    // dept-bearing: services / assets / systems / risks carry the wall + dept param
    expect(blocksFor('risks')[0]).toMatch(/sys\.department_id = \$2 OR sys\.is_shared = TRUE/);
    expect(blocksFor('business_services')[0]).toMatch(/bs\.department_id = \$2/);
    expect(blocksFor('information_assets')[0]).toMatch(/ia\.department_id = \$2/);
    expect(blocksFor('systems')[0]).toMatch(/s\.department_id = \$2/); // systems entity query
    // actions wall via EXISTS over the linked risk's system
    expect(blocksFor('security_actions')[0]).toMatch(/EXISTS[\s\S]*s2\.department_id = \$2/);
    // org-wide catalogues are NOT walled
    expect(blocksFor('threats')[0]).not.toMatch(/department_id = \$2/);
    expect(blocksFor('controls')[0]).not.toMatch(/department_id = \$2/);
    // dept param threaded through
    const riskCall = mockQuery.mock.calls.find((c) => /FROM risks/.test(c[0]));
    expect(riskCall[1]).toEqual(['%ad%', 'DEPT-IT']);
    const threatCall = mockQuery.mock.calls.find((c) => /FROM threats/.test(c[0]));
    expect(threatCall[1]).toEqual(['%ad%']);
  });

  test('a dept-scoped role with no department sees only org-wide catalogues', async () => {
    isDeptScoped.mockReturnValue(true);
    isDepartmentIsolationEnabled.mockReturnValue(true);
    getUserDepartment.mockResolvedValue(null);

    await run({ role: 'information_asset_owner', id: 'u-iao' });

    expect(blocksFor('risks')).toHaveLength(0);
    expect(blocksFor('business_services')).toHaveLength(0);
    expect(blocksFor('systems')).toHaveLength(0);
    // catalogues remain
    expect(blocksFor('threats')).toHaveLength(1);
    expect(blocksFor('controls')).toHaveLength(1);
  });
});

describe('knowledge search — input validation', () => {
  test('a missing query is a 400 and runs no SQL', async () => {
    const { statusCode } = await run({ role: 'ciso', id: 'u-ciso' }, '   ');
    expect(statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
