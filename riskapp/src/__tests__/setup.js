'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

process.env.NODE_ENV                 = 'test';
process.env.JWT_ACCESS_SECRET        = 'test-access-secret-minimum-32-chars-xxxxxxxxxxx';
process.env.JWT_REFRESH_SECRET       = 'test-refresh-secret-minimum-32-chars-xxxxxxxxxx';
process.env.JWT_ACCESS_EXPIRES_IN    = '15m';
process.env.JWT_REFRESH_EXPIRES_DAYS = '30';
process.env.PORT                     = '0';

const jwt = require('jsonwebtoken');

/**
 * Shared token factory for all test files.
 * Generates a signed JWT matching the shape the middleware expects.
 *
 * @param {object} overrides - payload fields to override
 * Usage:
 *   makeToken({ role: 'ciso' })
 *   makeToken({ role: 'ciso', sub: 'user-ciso-uuid' })
 *   makeToken({ role: 'ciso', expiresIn: -1 })  // expired token
 */
function makeToken(overrides = {}) {
  const { expiresIn = '15m', ...payload } = overrides;
  const defaults = {
    sub:   `user-${payload.role ?? 'ciso'}-uuid`,
    email: `${payload.role ?? 'ciso'}@example.com`,
    role:  'ciso',
  };
  return jwt.sign(
    { ...defaults, ...payload },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn }
  );
}

module.exports = { makeToken };