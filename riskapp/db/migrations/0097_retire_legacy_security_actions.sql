-- 0097 — retire the pre-item security-action model (gap-driven rebuild, step 4)
--
-- WHY. Migration 0096 introduced security_action_items and said the legacy link
-- tables and per-action target columns would be "retired in a later phase once
-- nothing reads them". That phase is now: the API and UI have been moved onto
-- items (acceptance queue, item-based stats, per-item completion, the roll-up
-- page), and the free-form authoring + adopt/start/complete/verify endpoints are
-- gone. Nothing in the codebase references any object dropped here.
--
-- WHAT CHANGES, and why each piece goes:
--
-- 1. LEGACY ACTION ROWS. An action created before the rebuild has no
--    security_action_items rows, so it cannot be completed under the new model —
--    per-item completion has nothing to complete, and the verify step that used
--    to finish it no longer exists. Rather than strand such rows in a UI that
--    cannot progress them, they are deleted. This is deliberate and authorised:
--    the only installs carrying them (cirks-test and the customer VM, both still
--    on v91) hold TEST data for this feature, and the operator asked for a clean
--    cut rather than a back-fill. Dev is already clean (0 rows). Deletions
--    cascade to security_action_risks / _controls / _components; the audit_log
--    entries those actions generated are untouched, so the governance trail of
--    what was done and by whom survives the row going away.
--
-- 2. LINK TABLES. security_action_controls / _components carried only `notes`
--    (plus a vestigial maturity_target) — no per-item owner, system, change kind
--    or target. security_action_items supersedes them completely.
--
-- 3. PER-ACTION TARGET. target_residual_* (6 cols) + target_locked_at are
--    replaced by per-item targets plus the accept snapshot added in 0096
--    (security_actions.accepted_at/by + security_action_risks.baseline_*).
--    Impact is derived from the system's assets since v90, so the three
--    target_residual_imp_* columns had already stopped meaning anything.
--
-- 4. VERIFICATION. verified_at/by, verification_result and verification_notes go
--    with the verify step. An action now finishes when its last item completes;
--    each item flips its own element operational as it lands, so there is no
--    after-the-fact sign-off to record. The trg_apply_verified_action_target
--    trigger (which pushed target_residual_* into the risk on verify) is
--    replaced by the per-item completion path writing risk_control_probability,
--    which the MIN-over-deployed derivation consumes. enforce_target_locked is
--    replaced by the endpoints refusing to edit a non-'proposed' action.
--
--    KEPT ON PURPOSE: the residual_change_source enum still carries
--    'action_verified' and risk_residual_history rows still reference it. Those
--    are immutable point-in-time snapshots of what happened — dropping the enum
--    value would rewrite history. The verification_result TYPE is dropped only
--    because nothing else uses it.
--
-- 5. CAPABILITIES. actions.verify and actions.search gated the verify endpoint
--    and the copy-from-existing search, both now removed. Left in place they
--    would show up in the RBAC admin matrix as grantable permissions that do
--    nothing. role_permissions cascades on delete.
--
-- NOT TOUCHED: swg_decision, the SIRO sign-off columns, security_action_plans,
-- and security_actions.completed_by/completed_at (the action-level completion
-- stamp is still written when the final item lands).

-- ── 1. Legacy (pre-item) action rows ────────────────────────────────────────
DELETE FROM public.security_actions sa
 WHERE NOT EXISTS (
   SELECT 1 FROM public.security_action_items sai WHERE sai.action_id = sa.id
 );

-- ── 2. Superseded link tables ───────────────────────────────────────────────
DROP TABLE IF EXISTS public.security_action_controls;
DROP TABLE IF EXISTS public.security_action_components;

-- ── 3/4. Triggers + functions that read the columns being dropped ───────────
DROP TRIGGER  IF EXISTS trg_apply_verified_action_target ON public.security_actions;
DROP FUNCTION IF EXISTS public.apply_verified_action_target();
DROP TRIGGER  IF EXISTS trg_enforce_target_locked ON public.security_actions;
DROP FUNCTION IF EXISTS public.enforce_target_locked();
DROP TRIGGER  IF EXISTS z_sod_action_verify ON public.security_actions;
DROP FUNCTION IF EXISTS public.sod_action_verify();

-- ── 3. Per-action target ────────────────────────────────────────────────────
ALTER TABLE public.security_actions
  DROP COLUMN IF EXISTS target_residual_p_c,
  DROP COLUMN IF EXISTS target_residual_p_i,
  DROP COLUMN IF EXISTS target_residual_p_a,
  DROP COLUMN IF EXISTS target_residual_imp_c,
  DROP COLUMN IF EXISTS target_residual_imp_i,
  DROP COLUMN IF EXISTS target_residual_imp_a,
  DROP COLUMN IF EXISTS target_locked_at;

-- ── 4. Verification columns + their enum ────────────────────────────────────
ALTER TABLE public.security_actions
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS verified_by,
  DROP COLUMN IF EXISTS verification_result,
  DROP COLUMN IF EXISTS verification_notes;

DROP TYPE IF EXISTS public.verification_result;

-- ── 5. Capabilities with no remaining endpoint ──────────────────────────────
DELETE FROM public.role_permissions WHERE capability_key IN ('actions.verify', 'actions.search');
DELETE FROM public.capabilities     WHERE key            IN ('actions.verify', 'actions.search');

COMMENT ON TABLE public.security_action_items IS
  'One remediation unit of a security action: a control or component on a system, '
  'add-or-improve, with its own Responsible owner (default system owner), target '
  '(control items, seeded from the coverage panel), status, and context comment. '
  'Completing an item flips the element to operational on that system and writes '
  'the control''s confirmed residual, which MIN-over-deployed then consumes. '
  'Sole scope mechanism since 0097 — the legacy link tables are gone.';
