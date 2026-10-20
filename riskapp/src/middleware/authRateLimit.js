'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Brute-force throttle for the credential endpoints (login / refresh).
// Hardening backlog H-03. Per-IP fixed window; tune via env:
//   AUTH_RATE_LIMIT_MAX      max attempts per window (default 20)
//   AUTH_RATE_LIMIT_WINDOW_MIN  window length in minutes (default 15)
// Disabled under NODE_ENV=test so the test suites aren't throttled.

const { rateLimit } = require('express-rate-limit');

const windowMin = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MIN || '15', 10);
const max       = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10);

const authRateLimit = rateLimit({
  windowMs: windowMin * 60 * 1000,
  max,
  standardHeaders: true,   // RateLimit-* headers
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many attempts. Please wait and try again.' },
});

module.exports = authRateLimit;
