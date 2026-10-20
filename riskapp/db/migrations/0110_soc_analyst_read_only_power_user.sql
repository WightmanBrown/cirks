-- v110 — the SOC analyst is a read-only power user.
--
-- soc_analyst was introduced in v79 as an enrichment consumer holding exactly
-- one capability, knowledge.query. That was enough for GET /knowledge/enrich and
-- /knowledge/graph, which apply no per-entity gates — but NOT for
-- GET /knowledge/search, whose eight entity blocks are each gated on that
-- entity's own read capability. The role therefore got HTTP 200 and eight empty
-- arrays from search, while the same information came back freely from enrich
-- one endpoint over. That was an inconsistency, not a boundary.
--
-- Owner's decision 2026-09-09: a SOC analyst is a READ-ONLY POWER USER and
-- should see everything under the Risk Management, Business Architecture and
-- Security Controls menus. The twelve capabilities below are exactly those menus
-- resolved from Shell.jsx, plus graph.read for the system Graph tab.
--
-- DELIBERATELY EXCLUDED:
--   meetings.read      — SWG packs and minutes are governance discussion, not
--                        operational data (owner's call).
--   governance.review  — the CISO's validation queue; an action, not a view.
--   meetings.write, actions.adopt_queue, and the department wizard — writes.
-- Every grant below is a read. The role gains no write capability of any kind.
--
-- all_depts throughout: a SOC is org-wide, and department-walling an incident
-- responder would defeat the purpose of the enrichment path they already have.
--
-- THE GRANT ALONE IS NOT ENOUGH — see docs/scoping-choke-point.md. Row scoping
-- lives in hardcoded role-name lists inside controllers, not in the capability's
-- scope, so this migration ships alongside edits to GLOBAL_ROLES in both
-- heatmap controllers and to isCrossDept/canViewAny in routes/services. Without
-- those the role passes the guard and then gets a catch-all 403 or an empty
-- list. That coupling is the subject of the design note.
--
-- Guarded on the capability existing, for the reason v109 documents: on a FRESH
-- database the runner applies every migration BEFORE db/seed.js loads the
-- capabilities catalogue, so an unguarded INSERT dies on
-- role_permissions_capability_key_fkey. Existing installs take the row here;
-- fresh installs no-op and seed from capabilityDefaults.js, which carries the
-- same grants.

INSERT INTO role_permissions (role, capability_key, scope)
SELECT 'soc_analyst', c.key, 'all_depts'
  FROM capabilities c
 WHERE c.key IN (
   'actions.read',
   'assets.read',
   'bil.read',
   'components.read',
   'controls.read',
   'exceptions.read',
   'graph.read',
   'risk_heatmap.read',
   'risks.read',
   'services.read',
   'systems.read',
   'threats.read'
 )
ON CONFLICT DO NOTHING;
