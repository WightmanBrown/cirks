'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

async function rateControl(req, res, next) {
  const { id }                        = req.params;
  const { effectiveness, effectiveness_notes } = req.body;
  const actorId = req.user.id;

  const score = parseInt(effectiveness, 10);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: 'effectiveness must be an integer 1–5.' });
  }
  if (!effectiveness_notes || effectiveness_notes.trim() === '') {
    return res.status(400).json({ error: 'effectiveness_notes is required.' });
  }

  try {
    // The objective's status is derived (v_control_status, v124): rating an adopted
    // objective moves it from not_assessed to adopted with no write of its own.
    const result = await query(
      `UPDATE controls c
          SET effectiveness       = $1,
              effectiveness_notes = $2,
              rated_by            = $3,
              rated_at            = now(),
              updated_at          = now()
        FROM (SELECT 1) AS one
        LEFT JOIN soa_entries se ON se.control_id = $4
        WHERE c.id = $4
        RETURNING
          c.id, c.effectiveness, c.effectiveness_notes, c.rated_at,
          -- RETURNING sees the row before this statement's own write is visible to
          -- a view, so derive the status inline from the values just set.
          CASE WHEN se.control_id IS NULL THEN 'not_decided'
               WHEN NOT se.applicable     THEN 'not_applicable'
               ELSE 'adopted' END AS status,
          (SELECT full_name FROM users WHERE id = $3) AS rated_by_name`,
      [score, effectiveness_notes.trim(), actorId, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: `Control ${id} not found.` });
    }

    res.json({ control: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { rateControl };
