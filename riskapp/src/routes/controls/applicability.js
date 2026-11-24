// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
'use strict';

// Where a control objective applies, from the Statement of Applicability (v185,
// owner 2026-11-23): the one rule, derived on read. It replaced the typed
// controls.is_baseline flag ("Baseline" / "Specific").
//
//   applicability  organisation | scopes | not_applicable | not_decided
//   applies_in     the scopes' names, when it applies only in named scopes
//
// For a query whose objective is aliased `c`.

// The SoA's answer, as `organisation`/`scopes`/... or, for sorting, as a rank
// (what applies everywhere first, then in scopes, not decided, ruled out).
const answer = (organisation, scopes, notDecided, notApplicable) => `
  (SELECT CASE
            WHEN se.control_id IS NULL THEN ${notDecided}
            WHEN NOT se.applicable THEN ${notApplicable}
            WHEN EXISTS (SELECT 1 FROM soa_entry_scopes x WHERE x.control_id = c.id) THEN ${scopes}
            ELSE ${organisation}
          END
     FROM (SELECT 1) one LEFT JOIN soa_entries se ON se.control_id = c.id)`;

const APPLICABILITY_COLUMNS = `
  ${answer("'organisation'", "'scopes'", "'not_decided'", "'not_applicable'")} AS applicability,
  ARRAY(SELECT sc.name FROM soa_entry_scopes x JOIN scopes sc ON sc.id = x.scope_id
         WHERE x.control_id = c.id ORDER BY lower(sc.name)) AS applies_in`;

const APPLICABILITY_RANK = answer(0, 1, 2, 3);

module.exports = { APPLICABILITY_COLUMNS, APPLICABILITY_RANK };
