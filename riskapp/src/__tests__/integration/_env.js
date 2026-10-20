'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Loaded by jest.integration.config.js BEFORE any app/pool module is required,
// so db/pool.js picks up the test database connection at module-load time.
//
// We deliberately point the pool at riskapp_test (never riskapp_dev) and hard-fail
// if anything else slips through — integration tests mutate data, and must never
// touch the dev database.

const fs = require('fs');
const path = require('path');

process.env.NODE_ENV                 = 'test';
process.env.JWT_ACCESS_SECRET        = process.env.JWT_ACCESS_SECRET  || 'test-access-secret-minimum-32-chars-xxxxxxxxxxx';
process.env.JWT_REFRESH_SECRET       = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-minimum-32-chars-xxxxxxxxxx';
process.env.JWT_ACCESS_EXPIRES_IN    = '15m';
process.env.JWT_REFRESH_EXPIRES_DAYS = '30';
// Each test file gets its own pg Pool; close idle clients quickly so finished
// files do not hold connections while later ones run (see src/db/pool.js).
process.env.PG_IDLE_TIMEOUT_MS       = process.env.PG_IDLE_TIMEOUT_MS || '200';
process.env.PORT                     = '0';

// Derive the test connection from riskapp/.env (swap the db name to riskapp_test),
// mirroring test/e2e/db/reset.mjs. TEST_DATABASE_URL overrides if set.
if (!process.env.DATABASE_URL || !/\/riskapp_test(\?|$)/.test(process.env.DATABASE_URL)) {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else {
    const envPath = path.join(__dirname, '..', '..', '..', '.env');
    const line = fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='));
    if (!line) throw new Error('DATABASE_URL not found in riskapp/.env');
    const devUrl = line.slice('DATABASE_URL='.length).trim();
    process.env.DATABASE_URL = devUrl.replace(/\/[^/]+$/, '/riskapp_test');
  }
}

// Safety latch: refuse to run unless we are pointed at the test database.
if (!/\/riskapp_test(\?|$)/.test(process.env.DATABASE_URL)) {
  throw new Error(
    `Integration tests must target riskapp_test, got: ${process.env.DATABASE_URL}`
  );
}
