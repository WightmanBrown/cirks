'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// The components a control objective needs on one system, as
// `(control_id, component_id)` — ONE rule, read by the risk page (coverage and
// Build-from-gap candidates), the system page and applying a build, so they
// cannot disagree with each other or with the component-record finding.
//
// An objective WITHOUT security solutions keeps its library list. One WITH them
// needs only the on-system parts of the solution in use there
// (v_system_solutions_in_use, v148): the solution the system WANTS — chosen for
// the objective, else required by the architecture — and, where it wants none,
// the solution in play (v145/v147). The rest of the library list is alternatives,
// not gaps. `sysParam` is the SQL placeholder for the system.
const neededComponentsSql = (sysParam) => `(
    SELECT ccl.control_id, ccl.component_id
      FROM control_component_links ccl
     WHERE NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = ccl.control_id)
    UNION
    SELECT u.control_id, pp.component_id
      FROM v_system_solutions_in_use u
      JOIN delivery_pattern_parts pp ON pp.pattern_id = u.pattern_id AND pp.location = 'on_system'
     WHERE u.system_id = ${sysParam}
  )`;

module.exports = { neededComponentsSql };
