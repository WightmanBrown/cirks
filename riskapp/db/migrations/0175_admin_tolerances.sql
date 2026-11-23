-- 0175 — the administrator may set the board's tolerances too (owner,
--        2026-11-06: "give the control on the tolerances to the admin account
--        as well"). v169 gave reports.tolerances to the SIRO alone.
--
-- A grant only: the capability already exists, so the catalogue
-- (db/seed/capabilities.sql) is unchanged. Guarded like every grant: on a
-- fresh install role_permissions is empty here and db/seed.js seeds it from
-- capabilityDefaults.js, which carries the same grant.

INSERT INTO role_permissions (role, capability_key, scope)
SELECT 'admin'::user_role, 'reports.tolerances', 'all_depts'
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
