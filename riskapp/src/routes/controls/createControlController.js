'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');
const { normaliseReference, referenceConflict } = require('./referenceCode');

const VALID_TYPES = new Set(['preventive', 'detective', 'corrective', 'deterrent']);

// Creates a CIRKS-native control. Standard mappings (ISO/CIS/NIST references) are
// attached separately via control_mappings — a native control belongs to no single
// framework.
async function createControl(req, res, next) {
  const {
    title,
    description,
    control_type,
    is_baseline = false,
  } = req.body;
  const ref = normaliseReference(req.body.reference_code);
  if (ref.error) return res.status(400).json({ error: ref.error });

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required.' });
  }
  if (!control_type || !VALID_TYPES.has(control_type)) {
    return res.status(400).json({
      error: `control_type must be one of: ${[...VALID_TYPES].join(', ')}.`,
    });
  }

  try {
    const result = await query(
      `INSERT INTO controls
         (title, description, control_type, is_baseline, created_by, reference_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, control_type, 'not_decided'::text AS status, is_baseline, reference_code, created_at`,
      [
        title.trim(),
        description?.trim() || null,
        control_type,
        Boolean(is_baseline),
        req.user.id,
        ref.value ?? null,
      ]
    );

    res.status(201).json({ control: result.rows[0] });
  } catch (err) {
    const conflict = referenceConflict(err, ref.value);
    if (conflict) return res.status(409).json({ error: conflict });
    next(err);
  }
}

module.exports = { createControl };
