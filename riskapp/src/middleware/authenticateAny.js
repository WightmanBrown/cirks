'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Accept EITHER a machine API key (X-API-Key header) OR a human JWT (Authorization:
// Bearer). Used only on routes a machine consumer may reach (the knowledge
// enrichment endpoints); the rest of the app keeps plain `authenticate`.
//
// Precedence: if X-API-Key is present, the request is a machine call — route it to
// apiKeyAuth (don't also accept a JWT, to keep one identity per request). Otherwise
// fall through to the JWT path.

const authenticate = require('./authenticate');
const apiKeyAuth   = require('./apiKeyAuth');

function authenticateAny(req, res, next) {
  if (req.headers['x-api-key']) {
    return apiKeyAuth(req, res, next);
  }
  return authenticate(req, res, next);
}

module.exports = authenticateAny;
