'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Integration tests run against the REAL riskapp_test database (no mocked pool),
// so they exercise actual SQL, stored functions, triggers, and RBAC end-to-end.
// The default `npm test` config ignores this directory; run these with
// `npm run test:integration` (or `:reset` to reseed first).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/integration/**/*.test.js'],
  setupFiles: ['<rootDir>/src/__tests__/integration/_env.js'],
  // CI runs on CIRKS-dev's own self-hosted ARM runner (2026-11-09), shared with
  // the dev servers. There a request now and then stalls past Jest's default 5 s
  // although every test takes well under 100 ms locally; on 10 Nov that failed a
  // different test on each run. 30 s keeps a stall from reading as a failure.
  testTimeout: 30000,
};
