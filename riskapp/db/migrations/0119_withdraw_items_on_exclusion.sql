-- 0119 — excluding a control WITHDRAWS the open work planned for it
--
-- WHY. 0118 kept an excluded control out of both probability calculations, which
-- made the arithmetic right and left the WORKLIST wrong. An item created before
-- the exclusion stayed `pending` for ever: it counted in `open_items` on the SAP
-- dashboard, in the action's items_done/item_count, in the org-wide remediation
-- roll-up, in "Remediation items still open" on My Tasks, and on the Responsible
-- person's own list. The score said the work was unnecessary while five screens
-- still asked someone to do it.
--
-- There was nowhere to put such an item: status was CHECK (pending, in_progress,
-- completed). Marking it completed would be a lie and would flip the control
-- operational; deleting it would erase the fact that the work was ever planned,
-- which is the opposite of what an audit narrative is for.
--
-- `withdrawn` is therefore a fourth state meaning "planned, then judged
-- unnecessary". The item stays on the record, out of the work counts, and the
-- narrative can say what happened and why.
--
-- BY TRIGGER, not controller code, so the invariant holds however the exclusion
-- is made — including by direct SQL, which is the case controller-level logic
-- cannot cover (the v106 argument). The withdrawal also writes an item-level
-- note through the 0116 stream, so the reason appears in the narrative beside
-- the item rather than only in audit_log.
--
-- Re-including a control does NOT restore withdrawn items. They were withdrawn
-- deliberately; silently resurrecting stale work with stale targets would be
-- surprising. Build a fresh action from the gap, which will now offer the
-- control again.

ALTER TABLE public.security_action_items
  DROP CONSTRAINT IF EXISTS security_action_items_status_check;

ALTER TABLE public.security_action_items
  ADD CONSTRAINT security_action_items_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'withdrawn'));

ALTER TABLE public.security_action_items
  ADD COLUMN withdrawn_at timestamptz,
  ADD COLUMN withdrawn_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.fn_audit_control_exclusion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  actor      uuid := NULLIF(current_setting('cirks.actor_id', true), '')::uuid;
  actor_name text;
  actor_role public.user_role;
  v_sys      text;
  v_ctl      text;
  v_item     RECORD;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'not_applicable' AND OLD.status <> 'not_applicable' THEN RETURN NEW; END IF;

  actor := COALESCE(NEW.excluded_by, actor);
  SELECT full_name, role INTO actor_name, actor_role FROM public.users WHERE id = actor;
  SELECT name  INTO v_sys FROM public.systems  WHERE id = NEW.system_id;
  SELECT title INTO v_ctl FROM public.controls WHERE id = NEW.control_id;

  INSERT INTO public.audit_log (
    user_id, user_name, user_role, entity_type, entity_id, entity_label,
    action, changes, human_narrative
  ) VALUES (
    actor, COALESCE(actor_name, 'unattributed'), actor_role,
    'system_controls', NEW.system_id, v_sys, 'update',
    jsonb_build_object('control_id', NEW.control_id,
      'status', jsonb_build_object('from', OLD.status, 'to', NEW.status),
      'exclusion_reason', jsonb_build_object('from', OLD.exclusion_reason,
                                             'to',   NEW.exclusion_reason)),
    CASE WHEN NEW.status = 'not_applicable'
      THEN format('Control "%s" excluded from system "%s" — %s', v_ctl, v_sys, NEW.exclusion_reason)
      ELSE format('Control "%s" re-included on system "%s" (had been excluded: %s)',
                  v_ctl, v_sys, COALESCE(OLD.exclusion_reason, 'no reason recorded'))
    END
  );

  -- Withdraw the work nobody now intends to do, and say why on the item itself.
  IF NEW.status = 'not_applicable' THEN
    FOR v_item IN
      SELECT sai.id, sai.action_id
        FROM public.security_action_items sai
        JOIN public.security_actions sa ON sa.id = sai.action_id
       WHERE sai.system_id  = NEW.system_id
         AND sai.control_id = NEW.control_id
         AND sai.status IN ('pending', 'in_progress')
         AND sa.status NOT IN ('completed', 'cancelled')
    LOOP
      UPDATE public.security_action_items
         SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = actor
       WHERE id = v_item.id;

      INSERT INTO public.security_action_notes (action_id, item_id, author_user_id, note)
      VALUES (v_item.action_id, v_item.id, actor,
              format('Withdrawn — the control was excluded from %s: %s', v_sys, NEW.exclusion_reason));
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
