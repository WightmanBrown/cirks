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
};
