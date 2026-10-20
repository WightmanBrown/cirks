'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Shared harness for DB-backed integration tests. Requires the real app and the
// real pool (env is already pointed at riskapp_test by _env.js). Tokens are signed
// with the real seed user UUIDs so dept-scoped lookups resolve correctly.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../app');
const { pool, query } = require('../../db/pool');

const app = createApp();

// Fixed identifiers from the deterministic seed (riskapp/test/e2e/db/seed.sql),
// mirrored from riskapp-frontend/e2e/support/constants.js. Keep in sync.
const USERS = {
  admin:      { id: '11111111-0000-0000-0000-000000000001', role: 'admin' },
  ciso:       { id: '11111111-0000-0000-0000-000000000002', role: 'ciso' },
  analyst:    { id: '11111111-0000-0000-0000-000000000003', role: 'risk_analyst' },
  iam:        { id: '11111111-0000-0000-0000-000000000004', role: 'information_asset_manager' },
  owner:      { id: '11111111-0000-0000-0000-000000000005', role: 'information_asset_owner' },
  consultant: { id: '11111111-0000-0000-0000-000000000006', role: 'security_consultant' },
  siro:       { id: '11111111-0000-0000-0000-000000000007', role: 'siro' },
  secretary:  { id: '11111111-0000-0000-0000-000000000008', role: 'meeting_secretary' },
  soc:        { id: '11111111-0000-0000-0000-000000000009', role: 'soc_analyst' },
};

const IT_DEPT = '22222222-0000-0000-0000-000000000001';

function tokenFor(key) {
  const u = USERS[key];
  if (!u) throw new Error(`Unknown seed user key: ${key}`);
  return jwt.sign(
    { sub: u.id, email: `${key}@org.local`, role: u.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

// Convenience: an authenticated supertest agent bound to a seed role.
function as(key, method, path) {
  return request(app)[method](path).set('Authorization', `Bearer ${tokenFor(key)}`);
}

const { withActor } = require('../../db/pool');

module.exports = { app, pool, query, withActor, request, USERS, IT_DEPT, tokenFor, as };
