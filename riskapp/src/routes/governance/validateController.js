'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

function mapDbError(err) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('not found'))             return { status: 404, error: 'Risk not found.' };
  if (msg.includes('already validated'))     return { status: 409, error: 'Risk has already been validated.' };
  if (msg.includes('validation_notes mandatory')) return { status: 400, error: 'Notes are required for this action.' };
  return null;
}

async function validateRisk(req, res, next) {
  try {
    const { id }            = req.params;
    const { action, notes } = req.body;
    const { id: userId }    = req.user;

    if (!action) {
      return res.status(400).json({ error: 'action is required.' });
    }

    if (!['validate', 'return'].includes(action)) {
      return res.status(400).json({ error: 'action is required and must be "validate" or "return".' });
    }

    const trimmedNotes = notes ? notes.trim() : null;

    if (action === 'return' && (!trimmedNotes || trimmedNotes.length < 10)) {
      return res.status(400).json({ error: 'notes are required when returning a risk (min 10 chars).' });
    }

    try {
      if (action === 'validate') {
        // validate_risk(risk_id, reviewer_id)
        await query(
          `SELECT validate_risk($1, $2)`,
          [id, userId]
        );
      } else {
        // return_risk(risk_id, notes, reviewer_id)
        await query(
          `SELECT return_risk($1, $2, $3)`,
          [id, trimmedNotes, userId]
        );
      }
    } catch (dbErr) {
      const mapped = mapDbError(dbErr);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error });
      throw dbErr;
    }

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { validateRisk };
