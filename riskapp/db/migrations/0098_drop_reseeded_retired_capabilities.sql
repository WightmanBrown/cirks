-- 0098 — actually remove the retired action capabilities (fixes 0097)
--
-- WHY. 0097 deleted the `actions.verify` and `actions.search` capabilities, whose
-- endpoints it retired. That delete did not stick: the capability CATALOGUE is
-- reference data re-seeded on every boot from `db/seed/capabilities.sql` (via
-- `db/seed.js`, which the container entrypoint runs after migrating), and that
-- file still listed both keys. So the boot order was
--
--     migrate (0097 deletes them) → seed (re-inserts them)
--
-- and every restart quietly resurrected two grantable permissions that gate
-- nothing — exactly what 0097 set out to prevent. Caught on the CIRKS-test
-- deploy: the migration reported success, then the RBAC catalogue still had both.
--
-- The real fix is in the seed sources, and this migration is the other half:
-- `db/seed/capabilities.sql` (canonical catalogue), `src/auth/capabilityDefaults.js`
-- (the in-memory resolver's copy) and `test/e2e/db/seed.sql` (test fixture) have
-- had both keys removed, so nothing re-creates them. This deletes the rows on
-- installs where the re-seed already put them back. A fresh install hits both
-- deletes as no-ops.
--
-- NOTE for future capability retirements: the drift-guard covers three files, but
-- there is a FOURTH — `db/seed/capabilities.sql` is the catalogue the running
-- system actually seeds from. Removing a capability means editing all four, or the
-- migration is undone at the next restart.
--
-- role_permissions FKs capability_key ON DELETE CASCADE, so grants go with them.

DELETE FROM public.role_permissions WHERE capability_key IN ('actions.verify', 'actions.search');
DELETE FROM public.capabilities     WHERE key            IN ('actions.verify', 'actions.search');

-- Descriptions of the surviving action capabilities still described the retired
-- verify/adopt world. The seed is INSERT … ON CONFLICT DO NOTHING, so existing
-- installs never pick up edited text — refresh it here.
UPDATE public.capabilities SET description = 'View action queues/stats'
 WHERE key = 'actions.read';
UPDATE public.capabilities SET description = 'View the proposed-action acceptance queue'
 WHERE key = 'actions.adopt_queue';
UPDATE public.capabilities SET description = 'Accept a proposed action (SWG)'
 WHERE key = 'actions.adopt';
UPDATE public.capabilities SET description = 'Build actions from the gap and edit their items'
 WHERE key = 'actions.write';
