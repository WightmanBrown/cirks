'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// After a write that can change what a security solution delivers — a
// component's state, a solution's parts, a rule, a choice, a threat identified —
// bring every system's security record up to date before the response goes out
// (v152): implied objectives recorded, complete solutions counted as chosen,
// each objective's status set from its solution. settle_system_security() audits
// each change with its reason.
//
// It runs for the whole register, not one system: a part on a security system or
// an organisation-wide component changes every system that relies on it. Before
// the response ends, so the page's own re-read sees the settled state.
//
// SETTLE_AFTER_WRITE=off skips it — for bulk loads that drive the API thousands
// of times and settle once at the end.

const { query } = require('../db/pool');

module.exports = function settleAfterWrite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
      || process.env.SETTLE_AFTER_WRITE === 'off') return next();
  const end = res.end;
  res.end = function settleThenEnd(...args) {
    res.end = end;
    if (res.statusCode >= 400) return end.apply(res, args);
    query('SELECT settle_system_security()')
      .catch((err) => console.error('[settle]', err.message))
      .finally(() => end.apply(res, args));
    return res;
  };
  return next();
};
