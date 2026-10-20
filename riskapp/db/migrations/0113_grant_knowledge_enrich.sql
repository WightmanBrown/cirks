-- v113 — grant knowledge.enrich, now that the role exists.
--
-- Split from 0111, which adds 'soc_integration' to the user_role enum. These
-- grants cannot live in that file: no-transaction prevents the runner opening an
-- explicit transaction, but the file is still sent as one query and therefore
-- runs in one implicit transaction, and Postgres refuses to use a new enum value
-- in the transaction that added it. A separate migration is a separate
-- execution, so by the time this runs the value is committed.
--
-- Guarded on role_permissions ALREADY being populated, and the guard is not
-- decoration. db/seed.js seeds that table from capabilityDefaults.js ONLY WHEN
-- IT IS EMPTY, and on a fresh database every migration runs first — so inserting
-- even one grant here would leave the table non-empty, the seed would skip, and
-- the install would come up with these rows and no other permissions at all.
-- Existing installs take the grants here; fresh installs no-op and seed the whole
-- matrix from capabilityDefaults, which carries the same entries.

-- Grants, guarded on role_permissions ALREADY being populated.
--
-- This guard is not decoration. db/seed.js seeds role_permissions from
-- capabilityDefaults.js ONLY WHEN THE TABLE IS EMPTY. On a fresh database the
-- runner applies every migration before that seed runs, so inserting even one
-- grant here would leave the table non-empty and the seed would skip — the
-- install would come up with these four rows and no other permissions at all.
-- Guarding on the table being populated means: existing installs take the grants
-- here, fresh installs no-op and seed the whole matrix from capabilityDefaults,
-- which carries the same entries. (v109 hit the neighbouring version of this and
-- guarded on the capability existing; that is not sufficient here, because this
-- migration creates the capability itself.)
INSERT INTO role_permissions (role, capability_key, scope)
SELECT r.role::user_role, 'knowledge.enrich', 'all_depts'
  FROM (VALUES ('soc_integration'), ('soc_analyst'), ('admin'), ('ciso'),
               ('risk_analyst'), ('security_consultant'),
               ('information_asset_manager'), ('information_asset_owner')) AS r(role)
 WHERE EXISTS (SELECT 1 FROM role_permissions)
ON CONFLICT DO NOTHING;
