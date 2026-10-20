-- 0118 — excluding a control from a system requires a recorded reason
--
-- WHY. 0117 added the `not_applicable` state. Marking a control inappropriate on
-- a system is a judgement an auditor will ask about — "this control treats the
-- threat, so why is it not here?" — and a state with no reason cannot answer it.
-- The requirement is therefore enforced by the DATABASE, not merely by the form
-- that happens to collect it today.
--
-- SHAPE. Exclusion is a fact about the (system, control) PAIR, true whichever
-- action or review prompted the decision, so it lives on `system_controls` beside
-- the status rather than on any action. It is the per-system analogue of the
-- SoA's organisation-level `applicable`.
--
-- The CHECK is an equivalence, not an implication: a reason exists if and only if
-- the control is excluded. Re-including a control must clear the reason, because
-- a stale justification sitting on a live control is worse than none — it reads
-- as current.
--
-- WHAT EXCLUSION MEANS ARITHMETICALLY (owner's constraint, 2026-09-15):
-- an excluded control must not form part of the probability calculation for the
-- current risk OR the target. It is neither a contributor nor a gap.
--   * current risk — `fn_rcp_recompute_risk` already ignores any status that is
--     not operational|degraded, so `not_applicable` contributes nothing. No
--     change needed, and a test pins it so that stays true.
--   * target — derived from OPEN action items, so exclusion must stop an item
--     existing at all (the candidates query no longer offers an excluded
--     control) AND the target derivation skips items whose control is excluded,
--     which holds even for items created before the exclusion.
--
-- The exclusion is attributed and audited: who decided, when, and the reason go
-- to `audit_log` via a trigger rather than controller code, so a direct SQL
-- change is caught too — the same argument as v106's accountability triggers.

ALTER TABLE public.system_controls
  ADD COLUMN exclusion_reason text,
  ADD COLUMN excluded_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN excluded_at      timestamptz;

ALTER TABLE public.system_controls
  ADD CONSTRAINT chk_system_control_exclusion_reason
  CHECK ((status = 'not_applicable')
         = (exclusion_reason IS NOT NULL AND TRIM(BOTH FROM exclusion_reason) <> ''));

CREATE OR REPLACE FUNCTION public.fn_audit_control_exclusion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  actor      uuid := NULLIF(current_setting('cirks.actor_id', true), '')::uuid;
  actor_name text;
  actor_role public.user_role;   -- an enum, not text: audit_log.user_role is typed
  v_sys      text;
  v_ctl      text;
BEGIN
  -- Only the crossings in and out of exclusion are accountable; every other
  -- status change is ordinary health reporting and already visible.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'not_applicable' AND OLD.status <> 'not_applicable' THEN RETURN NEW; END IF;

  actor := COALESCE(NEW.excluded_by, actor);
  SELECT full_name, role INTO actor_name, actor_role FROM public.users WHERE id = actor;
  SELECT name  INTO v_sys FROM public.systems  WHERE id = NEW.system_id;
  SELECT title INTO v_ctl FROM public.controls WHERE id = NEW.control_id;

  INSERT INTO public.audit_log (
    user_id, user_name, user_role,
    entity_type, entity_id, entity_label,
    action, changes, human_narrative
  ) VALUES (
    actor,
    COALESCE(actor_name, 'unattributed'),   -- direct SQL, a migration, a script
    actor_role,
    'system_controls', NEW.system_id, v_sys,
    'update',
    jsonb_build_object(
      'control_id', NEW.control_id,
      'status', jsonb_build_object('from', OLD.status, 'to', NEW.status),
      'exclusion_reason', jsonb_build_object('from', OLD.exclusion_reason,
                                             'to',   NEW.exclusion_reason)),
    CASE WHEN NEW.status = 'not_applicable'
      THEN format('Control "%s" excluded from system "%s" — %s', v_ctl, v_sys, NEW.exclusion_reason)
      ELSE format('Control "%s" re-included on system "%s" (had been excluded: %s)',
                  v_ctl, v_sys, COALESCE(OLD.exclusion_reason, 'no reason recorded'))
    END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_control_exclusion
  AFTER UPDATE OF status ON public.system_controls
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_control_exclusion();
