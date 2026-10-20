'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

const { query } = require('../../db/pool');

// When a control is attached to a system, provision its catalogue components
// (control_component_links) onto the system as system_components rows, so the
// per-system coverage gap is explicit (you can see, and later mark, which of the
// control's delivering parts are actually present + healthy here).
//
// Per-system status is seeded from the catalogue control_components.status:
// operational/degraded carry through; anything else (decommissioned/planned/
// unknown) → 'missing' (expected-but-not-confirmed on this system). ON CONFLICT
// DO NOTHING keeps ONE instance per system — a component already present (a system
// constituent, or serving another control) retains its existing per-system status;
// it is never duplicated and never downgraded by a later attach. Detach never
// removes components (see the DELETE handlers) — a component may still be a
// constituent or serve another attached control.
//
// NOT for an objective that has security solutions (v145/v147): its library list
// is a menu of ALTERNATIVES, not a checklist, so copying it onto the system
// recorded every alternative as present — DE.CM-09 on an Azure server gained the
// Falcon, OSSEC and Wazuh agents, "operational", and put solutions in play that
// are not there. Its needed parts come from the solution in use instead
// (v_system_solutions_in_use), and the component-record finding asks for them.
async function provisionControlComponents(systemId, controlId, userId) {
  await query(
    `INSERT INTO system_components (system_id, component_id, status, added_by)
     SELECT $1, ccl.component_id,
            CASE cc.status
              WHEN 'operational' THEN 'operational'::system_element_status
              WHEN 'degraded'    THEN 'degraded'::system_element_status
              ELSE 'missing'::system_element_status
            END,
            $3
       FROM control_component_links ccl
       JOIN control_components cc ON cc.id = ccl.component_id
      WHERE ccl.control_id = $2
        AND NOT EXISTS (SELECT 1 FROM delivery_pattern_objectives o WHERE o.control_id = $2)
     ON CONFLICT (system_id, component_id) DO NOTHING`,
    [systemId, controlId, userId]
  );
}

module.exports = { provisionControlComponents };
