-- v103 — the CISO may flag an impact table mandatory.
--
-- RATIONALE. `bil.mandatory` was held by admin and siro only, while the button
-- that uses it was offered to CAN_ORG in the frontend — ciso, siro, admin. A
-- CISO therefore saw "Make mandatory" and received a 403 on click.
--
-- The mismatch was resolved in the CISO's favour rather than by hiding the
-- button, because the capability belongs with the role. Making an impact scale
-- mandatory declares that every department must rate against it; that is the
-- CISO's own instrument — they already hold `bil.publish` and author the
-- organisation-scope tables in the first place. Withholding it meant the person
-- responsible for the impact model could publish a scale but not require its
-- use.
--
-- It also removes a dead end introduced by the publish-freeze work: a mandatory
-- table cannot be unpublished, so changing its levels means making it voluntary
-- first — a step the CISO could not perform on their own table.
--
-- SIRO and admin keep the capability. This grants, it does not move.
--
-- A migration and not merely a capabilityDefaults edit: db/seed.js seeds
-- role_permissions ONLY when the table is empty, so that an admin's later RBAC
-- edits are never clobbered on restart. On any existing install the defaults
-- file is therefore never re-read, and this grant would never arrive. Same trap
-- as v98's capability re-seed, from the other direction.

-- Guarded on the capability EXISTING, because migrations run before the
-- reference-data seed. On a FRESH database the baseline is schema-only, so
-- `capabilities` is still empty here and an unguarded insert violates
-- role_permissions_capability_key_fkey — it works on an existing install and
-- fails on a new one, which is precisely the asymmetry CI caught.
--
-- Skipping on a fresh database is correct, not a compromise: db/seed.js seeds
-- role_permissions from capabilityDefaults whenever the table is empty, and
-- that file now grants ciso bil.mandatory. So a fresh install gets the grant by
-- the defaults path and an existing one gets it here. Both arrive; neither
-- duplicates.
INSERT INTO role_permissions (role, capability_key, scope)
SELECT 'ciso', 'bil.mandatory', 'all_depts'
 WHERE EXISTS (SELECT 1 FROM capabilities WHERE key = 'bil.mandatory')
ON CONFLICT (role, capability_key) DO NOTHING;
