-- 0091 — drop the retired maturity columns (Stage 3c)
--
-- WHY. Maturity became an ORGANISATION-WIDE property of the control
-- (controls.effectiveness) in Stage 3b; the per-system `system_controls.maturity`
-- is redundant with the per-system STATUS (v89, migration 0089) and is no longer
-- read or written by any code (all readers repointed in Stages 3a/3b). The v83
-- maturity CEILING (`controls.max_maturity` + `max_maturity_reason`) was retired in
-- Stage 3a — with one org-wide maturity there is nothing per-system to cap. These
-- columns are now dead, so this drops them. DROP COLUMN also removes their CHECK
-- constraints (chk_controls_max_maturity, system_controls_maturity_check) and column
-- comments automatically. Nothing else in the schema depends on them — verified by a
-- transactional dry-run of these DROPs (no error, no dependent view/function/trigger).
--
-- NOT dropped: `security_action_controls.maturity_target` (the action's per-control
-- target maturity). It is inert after the 3b verify-flow change (verify now sets the
-- per-system STATUS, not maturity) and is removed together with the action
-- propose/target UI cleanup as a follow-on.

ALTER TABLE system_controls DROP COLUMN maturity;
ALTER TABLE controls DROP COLUMN max_maturity;
ALTER TABLE controls DROP COLUMN max_maturity_reason;
