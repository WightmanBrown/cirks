-- 0157 — what the Security Architect holds (owner, 2026-10-12)
--
-- A person switches INTO this role (authorisation follows the active role), so
-- it has to be a workable seat by itself, and it must not be a way round the
-- department wall on writes.
--
-- WRITES — two, and neither has a department:
--   architecture.write  the systems architecture template (which components
--                       answer each group) and the system architecture patterns
--   components.write    the component library the template and patterns are
--                       built from; the catalogue has no owning department (v114)
--
-- READS — everything under Risk Management, Business Architecture and Security
-- Controls, organisation-wide: the same read set the SOC analyst was given in
-- v110, plus users.read for the people pickers. An architect designing a pattern
-- has to see how every department's systems are actually built.
--
-- DELIBERATELY NOT HELD:
--   systems.write   an IAM acting as architect would otherwise be able to edit
--                   another department's systems by switching role. A system is
--                   created and changed from the person's own seat (IAM, analyst).
--   controls.write  security solutions and the rules that require them stay with
--                   the security team (v155).
--   risks.write, assets.write, services.write, meetings.*, governance.* — not
--                   architecture.
--
-- CONSEQUENCE worth knowing before granting it: a department manager who holds
-- this role can READ every department's systems and risks while acting in it.
-- Their own-department limit applies to their IAM role, not to this one.
--
-- The role-name lists that row scoping still lives in (H-23,
-- docs/scoping-choke-point.md) are edited alongside: GLOBAL_ROLES in both
-- heatmap controllers and the cross-department lists in routes/services.
--
-- Conditional on role_permissions being populated (db/seed.js seeds it only when
-- empty, from capabilityDefaults.js, which carries the same grants) and on each
-- capability existing (a fresh database runs migrations before the catalogue is
-- seeded). No capability is added, so db/seed/capabilities.sql is unchanged.

INSERT INTO role_permissions (role, capability_key, scope)
SELECT 'security_architect', c.key, 'all_depts'
  FROM capabilities c
 WHERE c.key IN (
   'architecture.write',
   'components.write',
   'actions.read',
   'assets.read',
   'bil.read',
   'components.read',
   'controls.read',
   'exceptions.read',
   'findings.read',
   'graph.read',
   'knowledge.query',
   'risk_heatmap.read',
   'risks.read',
   'services.read',
   'suppliers.read',
   'systems.read',
   'threats.read',
   'users.read'
 )
   AND EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
