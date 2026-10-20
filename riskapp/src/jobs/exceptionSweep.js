'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../db/pool');

// Idempotent sweep: move active exceptions past their review date into 'expired'
// (+ stamp escalated_at + audit-log), via the v75 stored function. Returns the
// count expired this pass. Safe to call repeatedly — see expire_overdue_exceptions().
async function runExceptionSweep() {
  const { rows } = await query('SELECT expire_overdue_exceptions() AS count');
  return rows[0]?.count ?? 0;
}

// Fire-and-forget wrapper for the startup / interval callers: never throws, logs
// only when it actually expired something (or on error).
async function safeExceptionSweep(label = 'sweep') {
  try {
    const n = await runExceptionSweep();
    if (n > 0) console.info(`[exceptions:${label}] expired ${n} overdue exception(s).`);
    return n;
  } catch (err) {
    console.warn(`[exceptions:${label}] failed:`, err.message);
    return 0;
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Start a daily background sweep. Returns the timer so callers can clear it in tests.
function startExceptionSweepTimer(intervalMs = ONE_DAY_MS) {
  const timer = setInterval(() => safeExceptionSweep('daily'), intervalMs);
  if (typeof timer.unref === 'function') timer.unref(); // don't keep the process alive
  return timer;
}

module.exports = { runExceptionSweep, safeExceptionSweep, startExceptionSweepTimer };
