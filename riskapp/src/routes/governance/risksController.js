'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

const VALID_STATUSES = new Set(['pending', 'returned']);

async function getPendingRisks(req, res, next) {
  try {
    const conditions = [];
    const params     = [];

    if (req.query.status) {
      if (!VALID_STATUSES.has(req.query.status)) {
        return res.status(400).json({ error: 'invalid status value.' });
      }
      params.push(req.query.status);
      conditions.push(`validation_status = $${params.length}`);
    }

    if (req.query.department_id) {
      params.push(req.query.department_id);
      conditions.push(`department_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT * FROM v_pending_risks ${where} ORDER BY identified_at DESC`,
      params
    );

    res.json({ count: result.rows.length, risks: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPendingRisks };