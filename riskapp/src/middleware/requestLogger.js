'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { pool } = require('../db/pool');

/**
 * requestLogger — Express middleware.
 *
 * Writes one row to api_request_log per request.  The INSERT is fire-and-forget:
 * a failure never affects the response.  Skips health-check paths to avoid noise.
 *
 * Placed after authenticate() so req.user is available, but it does not
 * require authentication — anonymous requests are also logged (user_id NULL).
 *
 * This satisfies layer 2 of the three-layer audit strategy (briefing §13):
 *   Layer 1 — application audit_log (governance mutations)
 *   Layer 2 — API request log (caller, token, endpoint, timestamp)  ← this
 *   Layer 3 — pgaudit DDL/DML (deferred)
 */
function requestLogger(req, res, next) {
  const startedAt = Date.now();

  // Record after the response is finished so we can capture status code.
  res.on('finish', () => {
    // Skip noisy internal paths.
    if (req.path === '/health' || req.path === '/favicon.ico') return;

    const duration = Date.now() - startedAt;

    const values = [
      req.user?.id   || null,
      req.user?.role || null,
      req.method,
      req.originalUrl,
      res.statusCode,
      duration,
      req.ip || null,
      req.headers['user-agent'] || null,
    ];

    pool.query(
      `INSERT INTO api_request_log
         (user_id, role, method, endpoint, status_code, duration_ms, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      values
    ).catch((err) => {
      // Log to console only — never surface to the client.
      console.error('[requestLogger] Failed to write log row:', err.message);
    });
  });

  next();
}

module.exports = requestLogger;
