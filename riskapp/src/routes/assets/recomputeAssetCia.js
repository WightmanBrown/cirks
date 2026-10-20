'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Derive an information asset's C/I/A from its per-impact-table ratings.
//
// Extracted from routes/assets/index.js so routes/bil can call it too: editing
// an impact table's CIA level statements changes what its ratings MEAN, because
// the presence of a non-empty statement is what lets a dimension contribute at
// all (see the CASE below). Without a recompute, every asset rated against an
// edited table keeps a derived C/I/A the table no longer justifies. Both
// routers requiring this module rather than each other also keeps the import
// graph acyclic.

const { query } = require('../../db/pool');

async function recomputeAssetCia(assetId, userId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) AS rating_rows,
       MAX(CASE
         WHEN air.c_dropped THEN NULL
         WHEN air.c_level IS NOT NULL THEN air.c_level
         WHEN cl_c.statement IS NOT NULL AND cl_c.statement <> '' THEN air.rated_level
       END) AS c_max,
       MAX(CASE
         WHEN air.i_dropped THEN NULL
         WHEN air.i_level IS NOT NULL THEN air.i_level
         WHEN cl_i.statement IS NOT NULL AND cl_i.statement <> '' THEN air.rated_level
       END) AS i_max,
       MAX(CASE
         WHEN air.a_dropped THEN NULL
         WHEN air.a_level IS NOT NULL THEN air.a_level
         WHEN cl_a.statement IS NOT NULL AND cl_a.statement <> '' THEN air.rated_level
       END) AS a_max
     FROM asset_impact_ratings air
     LEFT JOIN impact_table_cia_levels cl_c
       ON cl_c.impact_table_id = air.impact_table_id
      AND cl_c.level = air.rated_level AND cl_c.dimension = 'c'
     LEFT JOIN impact_table_cia_levels cl_i
       ON cl_i.impact_table_id = air.impact_table_id
      AND cl_i.level = air.rated_level AND cl_i.dimension = 'i'
     LEFT JOIN impact_table_cia_levels cl_a
       ON cl_a.impact_table_id = air.impact_table_id
      AND cl_a.level = air.rated_level AND cl_a.dimension = 'a'
     WHERE air.asset_id = $1`,
    [assetId]
  );
  const { rating_rows, c_max, i_max, a_max } = rows[0];
  // Only (re)derive once the asset has been rated against at least one table.
  // An unrated asset keeps NULL CIA so "not yet assessed" stays distinguishable.
  // Each dimension floors to 1: a dimension no rated table assesses is treated
  // as minimal impact (1), never N/A and never a stale carried-over value.
  // NOTE: under org_config.impact_method 'max' (default) a floored 1 is harmless
  // (it can't dominate GREATEST); under 'average'/'weighted' it dilutes the
  // summary — see hardening backlog H-08.
  if (Number(rating_rows) > 0) {
    await query(
      `UPDATE information_assets
       SET confidentiality = COALESCE($1, 1),
           integrity       = COALESCE($2, 1),
           availability    = COALESCE($3, 1),
           rated_by        = $4,
           rated_at        = now(),
           updated_at      = now(),
           impact_changed_in_cycle = CASE
             WHEN confidentiality IS DISTINCT FROM COALESCE($1, 1)
               OR integrity       IS DISTINCT FROM COALESCE($2, 1)
               OR availability    IS DISTINCT FROM COALESCE($3, 1)
             THEN TRUE
             ELSE impact_changed_in_cycle
           END
       WHERE id = $5`,
      [c_max, i_max, a_max, userId, assetId]
    );
  }
}

module.exports = { recomputeAssetCia };
