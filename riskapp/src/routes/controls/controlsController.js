'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

// Controls are now CIRKS-native (no framework). The `framework` query param, when
// supplied, filters to controls MAPPED to that standard (via control_mappings).
// Any code in the `standards` registry is valid — a fixed list here rejected every
// standard loaded after it was written. An unknown code simply matches nothing.
const STANDARD_CODE    = /^[a-z0-9_]{1,64}$/;
const VALID_TYPES      = new Set(['preventive', 'detective', 'corrective', 'deterrent']);
// An objective's status is DERIVED (v_control_status, v124) from its SoA entry and
// its maturity rating; there is no stored column.
const VALID_STATUSES   = new Set(['not_decided', 'not_applicable', 'not_assessed', 'adopted']);

const EMPTY_SUMMARY = {
  total: 0, adopted: 0, not_assessed: 0, not_decided: 0, not_applicable: 0, needs_rating: 0,
};

// Each control's mapped standard references, e.g. [{standard:'iso27001', ref:'A.5.1'}].
const STANDARD_REFS_SUBQUERY = `
  COALESCE((
    SELECT json_agg(jsonb_build_object('standard', s.code, 'name', s.name, 'ref', sc.ref_code)
                    ORDER BY s.sort_index, sc.sort_index)
    FROM control_mappings cm
    JOIN standard_controls sc ON sc.id = cm.standard_control_id
    JOIN standards s          ON s.id  = sc.standard_id
    WHERE cm.control_id = c.id
  ), '[]'::json) AS standard_refs`;

async function getControls(req, res, next) {
  const { framework, type, status, needs_rating, q } = req.query;

  // 'custom' = objectives mapped to no standard: the organisation's own.
  if (framework && framework !== 'custom' && !STANDARD_CODE.test(framework)) {
    return res.status(400).json({ error: `Invalid standard: ${framework}` });
  }
  if (type && !VALID_TYPES.has(type)) {
    return res.status(400).json({ error: `Invalid type: ${type}` });
  }
  if (status && !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  try {
    const conditions = [];
    const params = [];

    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      conditions.push(`(c.title ILIKE $${params.length} OR c.reference_code ILIKE $${params.length} OR EXISTS (
        SELECT 1 FROM control_mappings cm JOIN standard_controls sc ON sc.id = cm.standard_control_id
        WHERE cm.control_id = c.id AND sc.ref_code ILIKE $${params.length}))`);
    }
    if (framework === 'custom') {
      conditions.push(`NOT EXISTS (SELECT 1 FROM control_mappings cm WHERE cm.control_id = c.id)`);
    } else if (framework) {
      params.push(framework);
      conditions.push(`EXISTS (
        SELECT 1 FROM control_mappings cm
        JOIN standard_controls sc ON sc.id = cm.standard_control_id
        JOIN standards s          ON s.id  = sc.standard_id
        WHERE cm.control_id = c.id AND s.code = $${params.length})`);
    }
    if (type) {
      params.push(type);
      conditions.push(`c.control_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`vcs.status = $${params.length}`);
    }
    if (needs_rating === 'true') {
      // Needs a maturity rating = adopted but not yet assessed.
      conditions.push(`vcs.status = 'not_assessed'`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [listResult, summaryResult] = await Promise.all([
      query(
        `SELECT
           c.id,
           c.title,
           c.description,
           c.control_type,
           c.effectiveness,
           c.effectiveness_notes,
           vcs.status,
           c.is_baseline,
           c.owner_user_id,
           c.reference_code,
           ow.full_name AS owner_name,
           u.full_name AS rated_by_name,
           c.rated_at,
           c.created_at,
           ${STANDARD_REFS_SUBQUERY}
         FROM controls c
         JOIN v_control_status vcs ON vcs.control_id = c.id
         LEFT JOIN users u  ON u.id  = c.rated_by
         LEFT JOIN users ow ON ow.id = c.owner_user_id
         ${whereClause}
         ORDER BY
           c.is_baseline DESC,
           c.title       ASC`,
        params
      ),
      query(
        `SELECT
           COUNT(*)::INT                                              AS total,
           COUNT(*) FILTER (WHERE status = 'adopted')::INT           AS adopted,
           COUNT(*) FILTER (WHERE status = 'not_assessed')::INT      AS not_assessed,
           COUNT(*) FILTER (WHERE status = 'not_decided')::INT       AS not_decided,
           COUNT(*) FILTER (WHERE status = 'not_applicable')::INT    AS not_applicable,
           COUNT(*) FILTER (WHERE status = 'not_assessed')::INT      AS needs_rating
         FROM v_control_status`
      ),
    ]);

    // Surface the primary mapped reference as framework/framework_ref so existing
    // list UIs keep working; standard_refs carries the full mapping set.
    const controls = listResult.rows.map(r => ({
      ...r,
      // An objective mapped to no standard is CUSTOM and shows its own reference.
      framework:       r.standard_refs?.[0]?.standard ?? 'custom',
      framework_label: r.standard_refs?.[0]?.name ?? 'Custom',
      framework_ref:   r.standard_refs?.[0]?.ref ?? r.reference_code ?? null,
    }));

    res.json({
      controls,
      summary: summaryResult.rows[0] ?? EMPTY_SUMMARY,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getControls };
