'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * requireRole(...roles) — Express middleware factory.
 *
 * Must be used after authenticate(). Rejects with 403 if req.user.role
 * is not in the allowed set.
 *
 * Usage:
 *   router.get('/risks/pending', authenticate, requireRole('ciso'), handler);
 *   router.get('/signals',       authenticate, requireRole('ciso', 'risk_analyst'), handler);
 */
function requireRole(...roles) {
  if (roles.length === 0) {
    throw new Error('requireRole: at least one role must be specified.');
  }

  return function roleGuard(req, res, next) {
    if (!req.user) {
      // authenticate() should always run first; this is a programming error.
      return res.status(500).json({ error: 'Authentication middleware not applied.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
}

module.exports = requireRole;
