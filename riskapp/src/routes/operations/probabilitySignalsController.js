'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

/**
 * GET /api/v1/operations/probability-signals
 *
 * Returns all open probability signals from v_risk_probability_signals_open.
 * Read-only — no state machine transitions, no audit_log writes.
 *
 * Response:
 *   200 { count: number, signals: array }
 *   500 on unexpected error
 */
async function getProbabilitySignals(req, res, next) {
  try {
    const result = await query(
      `SELECT *
         FROM v_risk_probability_signals_open
        ORDER BY signal_created_at DESC`,
      []
    );

    res.json({
      count:   result.rows.length,
      signals: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProbabilitySignals };
