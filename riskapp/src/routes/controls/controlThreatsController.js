'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

async function linkControlThreat(req, res, next) {
  const { id: controlId } = req.params;
  const { threat_id, notes } = req.body;

  if (!threat_id) return res.status(400).json({ error: 'threat_id is required.' });

  try {
    await query(
      `INSERT INTO control_threats (control_id, threat_id, notes, created_by)
       VALUES ($1, $2, $3, $4)`,
      [controlId, threat_id, notes || null, req.user.id]
    );

    const { rows } = await query(
      `SELECT
         ct.id,
         ct.notes,
         t.id           AS threat_id,
         t.name         AS threat_name,
         t.threat_category,
         t.source       AS threat_source
       FROM control_threats ct
       JOIN threats t ON t.id = ct.threat_id
       WHERE ct.control_id = $1 AND ct.threat_id = $2`,
      [controlId, threat_id]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This threat is already linked to the control.' });
    next(err);
  }
}

async function unlinkControlThreat(req, res, next) {
  const { id: controlId, threatLinkId } = req.params;

  try {
    const { rowCount } = await query(
      `DELETE FROM control_threats WHERE id = $1 AND control_id = $2`,
      [threatLinkId, controlId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Threat linkage not found.' });
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

module.exports = { linkControlThreat, unlinkControlThreat };
