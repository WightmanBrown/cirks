-- v109 — an administrator can see the risk register.
--
-- admin held risks.read and every other cross-department read capability, but
-- not risk_heatmap.read, which guards GET /operations/risk-heatmap/current and
-- /future — the endpoints behind the risk list. Switching to Admin therefore
-- returned 403 on the one page that shows the register. Nothing suggests this
-- was deliberate: it reads as an omission when the capability was introduced.
--
-- The grant alone is not sufficient. riskHeatmapDetailController scopes rows in
-- the controller rather than the guard, and its GLOBAL_ROLES set did not include
-- admin either — so a granted admin would have passed the guard and then fallen
-- through to the catch-all 403. That set is corrected in the same change.
--
-- all_depts, matching ciso and risk_analyst: an administrator is not
-- department-scoped anywhere else in the model.
--
-- GUARDED ON THE CAPABILITY EXISTING, which is not a formality. On a FRESH
-- database the runner applies baseline + every migration BEFORE db/seed.js loads
-- the capabilities catalogue, so `capabilities` is still empty here and a plain
-- INSERT fails on role_permissions_capability_key_fkey. 0107 and 0108 only
-- DELETEd, which is harmless against an empty table; this is the first migration
-- to add a grant and the first to hit it.
--
-- Both paths therefore converge: on an EXISTING install the catalogue is
-- populated, the row is inserted, and the admin gains the capability on upgrade.
-- On a FRESH install this is a no-op and db/seed.js seeds role_permissions from
-- capabilityDefaults.js, which now carries the same grant.
--
-- ON CONFLICT DO NOTHING so re-running against an installation whose admin was
-- already granted this through the Access Control screen is a no-op.

INSERT INTO role_permissions (role, capability_key, scope)
SELECT 'admin', 'risk_heatmap.read', 'all_depts'
 WHERE EXISTS (SELECT 1 FROM capabilities WHERE key = 'risk_heatmap.read')
ON CONFLICT DO NOTHING;
