'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Machine authentication via the `X-API-Key` header (SOC enrichment — Stage 3).
//
// On success populates req.user with the SAME shape the JWT path (authenticate.js)
// produces, so the can() resolver and requireCapability run unchanged. The key's
// role (default soc_analyst) drives authorization. Adds req.user.isMachine + the
// key id for the request log / audit. On failure → 401, never 403.

const { findLiveByKey, touchLastUsed } = require('../auth/apiKeys');

async function apiKeyAuth(req, res, next) {
  const presented = req.headers['x-api-key'];
  if (!presented) {
    return res.status(401).json({ error: 'Missing X-API-Key header.' });
  }
  try {
    const key = await findLiveByKey(presented);
    if (!key) {
      return res.status(401).json({ error: 'Invalid, revoked, or expired API key.' });
    }
    touchLastUsed(key.id); // fire-and-forget; does not block the response
    req.user = {
      id:       key.id,
      email:    `apikey:${key.label}`,
      role:     key.role,
      isMachine: true,
      apiKeyId: key.id,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = apiKeyAuth;
