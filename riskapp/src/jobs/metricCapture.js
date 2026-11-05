'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../db/pool');
const { computeBoard, headline, DEFINITION_VER } = require('../reports/board');
const { departmentHeadlines, DEFINITION_VER: DEPT_VER } = require('../reports/department');
const { systemHeadlines, DEFINITION_VER: SYSTEM_VER } = require('../reports/systems');

// The monthly capture (v168, docs/metrics-and-reporting.md §5): once a month the
// board summary's headline figures are kept in metric_snapshots, so the board
// can see a trend. Same shape as the exception sweep: at boot and then daily, it
// never throws, and it is idempotent by the UNIQUE (metric_key, period)
// constraint — a restart or a second container cannot capture a month twice.
// Capture-on-read is deliberately not done: nobody opens the page in August,
// and August would then be missing.

const METRIC_KEY = 'board.headline';
const period = (d = new Date()) => d.toISOString().slice(0, 7);   // YYYY-MM (UTC)

async function captureBoard(at = new Date()) {
  const summary = headline(await computeBoard());
  const { rowCount } = await query(
    `INSERT INTO metric_snapshots (metric_key, period, definition_ver, summary)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (metric_key, period) DO NOTHING`,
    [METRIC_KEY, period(at), DEFINITION_VER, summary]);
  // Each department's headline counts too, for the IAO's trend line (v172,
  // docs/reporting-iao.md decision 3). Same idempotence: one row per month.
  // And each system's, for the IAM's (docs/reporting-iam.md decision 4).
  const rows = [...(await departmentHeadlines()).map((d) => [d, DEPT_VER]),
                ...(await systemHeadlines()).map((d) => [d, SYSTEM_VER])];
  for (const [d, ver] of rows) {
    await query(
      `INSERT INTO metric_snapshots (metric_key, period, definition_ver, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (metric_key, period) DO NOTHING`,
      [d.metric_key, period(at), ver, d.summary]);
  }
  return rowCount;   // 1 = captured now, 0 = this month already held
}

async function safeCapture(label = 'capture') {
  try {
    const n = await captureBoard();
    if (n > 0) console.info(`[metrics:${label}] captured ${period()} for the board summary.`);
    return n;
  } catch (err) {
    console.warn(`[metrics:${label}] failed:`, err.message);
    return 0;
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function startMetricCaptureTimer(intervalMs = ONE_DAY_MS) {
  const timer = setInterval(() => safeCapture('daily'), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = { METRIC_KEY, period, captureBoard, safeCapture, startMetricCaptureTimer };
