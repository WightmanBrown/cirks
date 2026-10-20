'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

/**
 * uuidParam(...names) — reject non-UUID route parameters with a 400.
 *
 * Returns an array of [name, handler] pairs to feed router.param(), so a router
 * can validate every id-shaped parameter in one line:
 *
 *   for (const [name, guard] of uuidParam('id', 'aid', 'iid')) router.param(name, guard);
 *
 * Express runs router.param() callbacks BEFORE any route-level middleware, which
 * is the property that matters here — it is what puts this guard in front of
 * multer's storage engine (hardening H-09). The attachment upload derived its
 * destination directory from req.params.id, and Express URL-decodes parameters,
 * so a `%2e%2e%2f` sequence escaped the uploads root before any handler had run.
 *
 * Second benefit: every one of these ids is a uuid column, so a malformed value
 * used to reach Postgres and come back as a 22P02 cast error — a 500 for what is
 * really a client mistake. These now answer 400.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function uuidParam(...names) {
  return names.map((name) => [
    name,
    function guard(req, res, next, value) {
      if (!isUuid(value)) {
        return res.status(400).json({ error: `Invalid ${name}: expected a UUID.` });
      }
      next();
    },
  ]);
}

module.exports = uuidParam;
module.exports.isUuid = isUuid;
module.exports.UUID_RE = UUID_RE;
