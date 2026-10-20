'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const jwt = require('jsonwebtoken');

/**
 * authenticate — Express middleware.
 *
 * Verifies the Bearer access token from the Authorization header.
 * On success, populates req.user = { id, email, role }.
 * On failure, returns 401 — never 403 (role enforcement is requireRole's job).
 */
function authenticate(req, res, next) {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  const token = header.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Attach the minimal identity object routes and middleware rely on.
    req.user = {
      id:   payload.sub,
      email: payload.email,
      role:  payload.role,
      // The refresh-token family this access token belongs to — i.e. WHICH
      // session (v105). switch-role needs it to record the elevation against
      // this session rather than the person, so signing in elsewhere does not
      // inherit it. Absent on tokens issued before v105; callers must cope.
      family: payload.fam || null,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired.' });
    }
    return res.status(401).json({ error: 'Invalid access token.' });
  }
}

module.exports = authenticate;
