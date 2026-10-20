'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Baseline capability grants per role — the shipped default that reproduces the
// historical route-guard contract. GENERATED from the v63 seed
// (schema/v63_rbac_capabilities.sql); the resolver in permissions.js reads this
// in-memory map. The DB table role_permissions is the admin-editable OVERRIDE
// layer (wired in Phase 7); an integration test asserts this map and the DB seed
// stay in sync. Regenerate with:
//   psql -tAc "SELECT json_object_agg(role, caps ORDER BY role) FROM (SELECT role,
//     json_agg(json_build_object('key',capability_key,'scope',scope) ORDER BY
//     capability_key) AS caps FROM role_permissions GROUP BY role) t;"
//
// Shape: { <role>: [ { key, scope }, ... ] }

module.exports = {
  "admin": [
    {
      "key": "findings.read",
      "scope": "all_depts"
    },
    {
      "key": "scopes.manage",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.enrich",
      "scope": "all_depts"
    },
    {
      "key": "actions.adopt",
      "scope": "all_depts"
    },
    {
      "key": "actions.adopt_queue",
      "scope": "all_depts"
    },
    {
      "key": "actions.complete",
      "scope": "all_depts"
    },
    {
      "key": "actions.org_view",
      "scope": "all_depts"
    },
    {
      "key": "actions.progress",
      "scope": "all_depts"
    },
    {
      "key": "actions.read",
      "scope": "all_depts"
    },
    {
      "key": "actions.write",
      "scope": "all_depts"
    },
    {
      "key": "admin.manage",
      "scope": "all_depts"
    },
    {
      "key": "assets.delete",
      "scope": "all_depts"
    },
    {
      "key": "assets.read",
      "scope": "all_depts"
    },
    {
      "key": "assets.write",
      "scope": "all_depts"
    },
    {
      "key": "bil.mandatory",
      "scope": "all_depts"
    },
    {
      "key": "bil.publish",
      "scope": "all_depts"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "bil.write",
      "scope": "all_depts"
    },
    {
      "key": "components.read",
      "scope": "all_depts"
    },
    {
      "key": "components.write",
      "scope": "all_depts"
    },
    {
      "key": "controls.import",
      "scope": "all_depts"
    },
    {
      "key": "controls.read",
      "scope": "all_depts"
    },
    {
      "key": "controls.write",
      "scope": "all_depts"
    },
    {
      "key": "architecture.write",
      "scope": "all_depts"
    },
    {
      "key": "departments.write",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.accept",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.revoke",
      "scope": "all_depts"
    },
    {
      "key": "graph.read",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.query",
      "scope": "all_depts"
    },
    {
      "key": "meetings.attendees",
      "scope": "all_depts"
    },
    {
      "key": "meetings.decide",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read_pack",
      "scope": "all_depts"
    },
    {
      "key": "risk_heatmap.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.delete",
      "scope": "all_depts"
    },
    {
      "key": "risks.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.write",
      "scope": "all_depts"
    },
    {
      "key": "services.adopt",
      "scope": "all_depts"
    },
    {
      "key": "services.delete",
      "scope": "all_depts"
    },
    {
      "key": "services.read",
      "scope": "all_depts"
    },
    {
      "key": "services.transfer",
      "scope": "all_depts"
    },
    {
      "key": "services.write",
      "scope": "all_depts"
    },
    {
      "key": "systems.delete",
      "scope": "all_depts"
    },
    {
      "key": "systems.read",
      "scope": "all_depts"
    },
    {
      "key": "systems.write",
      "scope": "all_depts"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "threats.write",
      "scope": "all_depts"
    },
    {
      "key": "users.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.write",
      "scope": "all_depts"
    }
  ],
  "ciso": [
    {
      "key": "findings.read",
      "scope": "all_depts"
    },
    {
      "key": "findings.act",
      "scope": "all_depts"
    },
    {
      "key": "scopes.manage",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.enrich",
      "scope": "all_depts"
    },
    {
      "key": "actions.adopt",
      "scope": "all_depts"
    },
    {
      "key": "actions.adopt_queue",
      "scope": "all_depts"
    },
    {
      "key": "actions.complete",
      "scope": "all_depts"
    },
    {
      "key": "actions.org_view",
      "scope": "all_depts"
    },
    {
      "key": "actions.progress",
      "scope": "all_depts"
    },
    {
      "key": "actions.read",
      "scope": "all_depts"
    },
    {
      "key": "actions.write",
      "scope": "all_depts"
    },
    {
      "key": "assets.delete",
      "scope": "all_depts"
    },
    {
      "key": "assets.read",
      "scope": "all_depts"
    },
    {
      "key": "assets.write",
      "scope": "all_depts"
    },
    {
      "key": "bil.mandatory",
      "scope": "all_depts"
    },
    {
      "key": "bil.publish",
      "scope": "all_depts"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "bil.write",
      "scope": "all_depts"
    },
    {
      "key": "components.read",
      "scope": "all_depts"
    },
    {
      "key": "components.write",
      "scope": "all_depts"
    },
    {
      "key": "controls.read",
      "scope": "all_depts"
    },
    {
      "key": "controls.write",
      "scope": "all_depts"
    },
    {
      "key": "architecture.write",
      "scope": "all_depts"
    },
    {
      "key": "departments.write",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.accept",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.revoke",
      "scope": "all_depts"
    },
    {
      "key": "governance.review",
      "scope": "all_depts"
    },
    {
      "key": "graph.read",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.query",
      "scope": "all_depts"
    },
    {
      "key": "meetings.decide",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read_pack",
      "scope": "all_depts"
    },
    {
      "key": "risk_heatmap.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.delete",
      "scope": "all_depts"
    },
    {
      "key": "risks.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.validate",
      "scope": "all_depts"
    },
    {
      "key": "risks.write",
      "scope": "all_depts"
    },
    {
      "key": "services.adopt",
      "scope": "all_depts"
    },
    {
      "key": "services.delete",
      "scope": "all_depts"
    },
    {
      "key": "services.read",
      "scope": "all_depts"
    },
    {
      "key": "services.transfer",
      "scope": "all_depts"
    },
    {
      "key": "services.write",
      "scope": "all_depts"
    },
    {
      "key": "systems.delete",
      "scope": "all_depts"
    },
    {
      "key": "systems.read",
      "scope": "all_depts"
    },
    {
      "key": "systems.write",
      "scope": "all_depts"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "threats.write",
      "scope": "all_depts"
    },
    {
      "key": "users.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.write",
      "scope": "all_depts"
    }
  ],
  "information_asset_manager": [
    {
      "key": "findings.read",
      "scope": "own_dept"
    },
    {
      "key": "findings.act",
      "scope": "own_dept"
    },
    {
      "key": "knowledge.enrich",
      "scope": "all_depts"
    },
    {
      "key": "actions.complete",
      "scope": "own_dept"
    },
    {
      "key": "actions.progress",
      "scope": "all_depts"
    },
    {
      "key": "actions.read",
      "scope": "own_dept"
    },
    {
      "key": "assets.read",
      "scope": "own_dept"
    },
    {
      "key": "assets.write",
      "scope": "own_dept"
    },
    {
      "key": "bil.publish",
      "scope": "own_dept"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "bil.write",
      "scope": "own_dept"
    },
    {
      "key": "components.read",
      "scope": "all_depts"
    },
    {
      "key": "components.write",
      "scope": "all_depts"
    },
    {
      "key": "controls.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "own_dept"
    },
    {
      "key": "knowledge.query",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read_pack",
      "scope": "all_depts"
    },
    {
      "key": "risk_heatmap.read",
      "scope": "own_dept"
    },
    {
      "key": "risks.read",
      "scope": "own_dept"
    },
    {
      "key": "risk_trends.read",
      "scope": "own_dept"
    },
    {
      "key": "services.adopt",
      "scope": "own_dept"
    },
    {
      "key": "services.read",
      "scope": "own_dept"
    },
    {
      "key": "services.write",
      "scope": "own_dept"
    },
    {
      "key": "systems.read",
      "scope": "own_dept"
    },
    {
      "key": "systems.write",
      "scope": "own_dept"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "users.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "own_dept"
    },
    {
      "key": "suppliers.write",
      "scope": "own_dept"
    }
  ],
  "information_asset_owner": [
    {
      "key": "findings.read",
      "scope": "own_dept"
    },
    {
      "key": "findings.act",
      "scope": "own_dept"
    },
    {
      "key": "knowledge.enrich",
      "scope": "all_depts"
    },
    {
      "key": "actions.complete",
      "scope": "own_dept"
    },
    {
      "key": "actions.progress",
      "scope": "all_depts"
    },
    {
      "key": "actions.read",
      "scope": "own_dept"
    },
    {
      "key": "assets.read",
      "scope": "own_dept"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "controls.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "own_dept"
    },
    {
      "key": "knowledge.query",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read_pack",
      "scope": "all_depts"
    },
    {
      "key": "risk_heatmap.read",
      "scope": "own_dept"
    },
    {
      "key": "risks.read",
      "scope": "own_dept"
    },
    {
      "key": "risk_trends.read",
      "scope": "own_dept"
    },
    {
      "key": "services.read",
      "scope": "own_dept"
    },
    {
      "key": "systems.read",
      "scope": "own_dept"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "own_dept"
    },
    {
      "key": "suppliers.write",
      "scope": "own_dept"
    }
  ],
  "meeting_secretary": [
    {
      "key": "findings.read",
      "scope": "all_depts"
    },
    {
      "key": "actions.org_view",
      "scope": "all_depts"
    },
    {
      "key": "actions.progress",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "all_depts"
    },
    {
      "key": "meetings.attendees",
      "scope": "all_depts"
    },
    {
      "key": "meetings.decide",
      "scope": "all_depts"
    },
    {
      "key": "meetings.issue",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read_pack",
      "scope": "all_depts"
    },
    {
      "key": "meetings.write",
      "scope": "all_depts"
    },
    {
      "key": "risk_heatmap.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.read",
      "scope": "all_depts"
    },
    {
      "key": "systems.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "all_depts"
    }
  ],
  "risk_analyst": [
    {
      "key": "findings.read",
      "scope": "all_depts"
    },
    {
      "key": "findings.act",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.enrich",
      "scope": "all_depts"
    },
    {
      "key": "actions.complete",
      "scope": "all_depts"
    },
    {
      "key": "actions.progress",
      "scope": "all_depts"
    },
    {
      "key": "actions.read",
      "scope": "all_depts"
    },
    {
      "key": "actions.write",
      "scope": "all_depts"
    },
    {
      "key": "assets.read",
      "scope": "all_depts"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "bil.write",
      "scope": "all_depts"
    },
    {
      "key": "components.read",
      "scope": "all_depts"
    },
    {
      "key": "components.write",
      "scope": "all_depts"
    },
    {
      "key": "controls.read",
      "scope": "all_depts"
    },
    {
      "key": "controls.write",
      "scope": "all_depts"
    },
    {
      "key": "architecture.write",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "all_depts"
    },
    {
      "key": "graph.read",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.query",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read_pack",
      "scope": "all_depts"
    },
    {
      "key": "probability_signals.read",
      "scope": "all_depts"
    },
    {
      "key": "risk_heatmap.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.write",
      "scope": "all_depts"
    },
    {
      "key": "services.adopt",
      "scope": "all_depts"
    },
    {
      "key": "services.delete",
      "scope": "all_depts"
    },
    {
      "key": "services.read",
      "scope": "all_depts"
    },
    {
      "key": "services.write",
      "scope": "all_depts"
    },
    {
      "key": "systems.read",
      "scope": "all_depts"
    },
    {
      "key": "systems.write",
      "scope": "all_depts"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "threats.write",
      "scope": "all_depts"
    },
    {
      "key": "users.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.write",
      "scope": "all_depts"
    }
  ],
  "security_consultant": [
    {
      "key": "findings.read",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.enrich",
      "scope": "all_depts"
    },
    {
      "key": "actions.progress",
      "scope": "all_depts"
    },
    {
      "key": "assets.read",
      "scope": "all_depts"
    },
    {
      "key": "assets.write",
      "scope": "all_depts"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "components.read",
      "scope": "all_depts"
    },
    {
      "key": "controls.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "all_depts"
    },
    {
      "key": "graph.read",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.query",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read_pack",
      "scope": "all_depts"
    },
    {
      "key": "services.delete",
      "scope": "all_depts"
    },
    {
      "key": "services.read",
      "scope": "all_depts"
    },
    {
      "key": "services.write",
      "scope": "all_depts"
    },
    {
      "key": "systems.read",
      "scope": "all_depts"
    },
    {
      "key": "systems.write",
      "scope": "all_depts"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "threats.write",
      "scope": "all_depts"
    },
    {
      "key": "users.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.write",
      "scope": "all_depts"
    }
  ],
  "siro": [
    {
      "key": "findings.read",
      "scope": "all_depts"
    },
    {
      "key": "scopes.manage",
      "scope": "all_depts"
    },
    {
      "key": "actions.adopt_queue",
      "scope": "all_depts"
    },
    {
      "key": "actions.read",
      "scope": "all_depts"
    },
    {
      "key": "bil.mandatory",
      "scope": "all_depts"
    },
    {
      "key": "bil.publish",
      "scope": "all_depts"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.accept",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.revoke",
      "scope": "all_depts"
    },
    {
      "key": "meetings.decide",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read",
      "scope": "all_depts"
    },
    {
      "key": "meetings.read_pack",
      "scope": "all_depts"
    },
    {
      "key": "siro.review",
      "scope": "all_depts"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.write",
      "scope": "all_depts"
    }
  ],
  "soc_integration": [
    {
      "key": "knowledge.enrich",
      "scope": "all_depts"
    }
  ],
  "soc_analyst": [
    {
      "key": "findings.read",
      "scope": "all_depts"
    },
    {
      "key": "actions.read",
      "scope": "all_depts"
    },
    {
      "key": "assets.read",
      "scope": "all_depts"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "components.read",
      "scope": "all_depts"
    },
    {
      "key": "controls.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "all_depts"
    },
    {
      "key": "graph.read",
      "scope": "all_depts"
    },
    {
      "key": "risk_heatmap.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.read",
      "scope": "all_depts"
    },
    {
      "key": "services.read",
      "scope": "all_depts"
    },
    {
      "key": "systems.read",
      "scope": "all_depts"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.enrich",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.query",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "all_depts"
    }
  ],
  "security_architect": [
    {
      "key": "architecture.write",
      "scope": "all_depts"
    },
    {
      "key": "components.write",
      "scope": "all_depts"
    },
    {
      "key": "actions.read",
      "scope": "all_depts"
    },
    {
      "key": "assets.read",
      "scope": "all_depts"
    },
    {
      "key": "bil.read",
      "scope": "all_depts"
    },
    {
      "key": "components.read",
      "scope": "all_depts"
    },
    {
      "key": "controls.read",
      "scope": "all_depts"
    },
    {
      "key": "exceptions.read",
      "scope": "all_depts"
    },
    {
      "key": "findings.read",
      "scope": "all_depts"
    },
    {
      "key": "graph.read",
      "scope": "all_depts"
    },
    {
      "key": "knowledge.query",
      "scope": "all_depts"
    },
    {
      "key": "risk_heatmap.read",
      "scope": "all_depts"
    },
    {
      "key": "risks.read",
      "scope": "all_depts"
    },
    {
      "key": "services.read",
      "scope": "all_depts"
    },
    {
      "key": "suppliers.read",
      "scope": "all_depts"
    },
    {
      "key": "systems.read",
      "scope": "all_depts"
    },
    {
      "key": "threats.read",
      "scope": "all_depts"
    },
    {
      "key": "users.read",
      "scope": "all_depts"
    }
  ]
};
