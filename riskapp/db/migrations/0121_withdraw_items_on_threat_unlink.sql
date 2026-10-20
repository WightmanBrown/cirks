-- 0121 — unlinking a control from a threat WITHDRAWS the work planned for it
--
-- WHY. A risk's mitigating controls are derived as `system_controls ∩
-- control_threats`, so removing a control↔threat link removes the control from
-- every risk for that threat. `DELETE /threats/:id/controls/:controlId` did
-- exactly that one DELETE and nothing else — its own comment noted the control
-- would stop surfacing as mitigating, and stopped there.
--
-- The security action items planned against that control survived their own
-- justification. Found 2026-09-18 on risk afff08d2 (Hardware or software
-- failure / Aircraft fuelling): two items for PR.IR-03 and RC.RP-01, controls
-- the CISO had unlinked from that threat on 2026-08-12 at 10:52. The coverage
-- panel correctly stopped listing them; the action kept asking someone to do
-- the work, and — worse — the items still fed the Target Risk column. That risk
-- sits at 2/2/2 and advertised a target of 1/2/2 built ENTIRELY from those two
-- orphans; its only legitimate item carries no target at all, so without them
-- the honest answer is "no target recorded".
--
-- This is 0119 again, one act along. Excluding a control from a SYSTEM withdraws
-- the work planned for it; unlinking a control from a THREAT has the same
-- consequence for the same reason, and was missed. Same fourth state, same
-- reason recorded on the item, same argument for doing it by trigger: the
-- invariant then holds however the link is removed, including by direct SQL.
--
-- MULTI-RISK CARE. An action can be linked to several risks, and an item is
-- justified by ANY live risk on the action whose threat still links the control
-- on that system. Only items with no remaining justification are withdrawn.
--
-- The unlink itself is now audited too. It was recorded nowhere in `audit_log`
-- before — the only evidence that it had happened was an `api_request_log` row
-- proving a DELETE was issued, which is precisely the H-15 gap: it can show that
-- someone changed something and never what. `link_control_threat` already exists
-- in the `audit_action` enum.

CREATE OR REPLACE FUNCTION public.fn_withdraw_items_on_threat_unlink() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  actor      uuid := NULLIF(current_setting('cirks.actor_id', true), '')::uuid;
  actor_name text;
  actor_role public.user_role;
  v_ctl      text;
  v_threat   text;
  v_item     RECORD;
BEGIN
  SELECT full_name, role INTO actor_name, actor_role FROM public.users WHERE id = actor;
  SELECT title INTO v_ctl    FROM public.controls WHERE id = OLD.control_id;
  SELECT name  INTO v_threat FROM public.threats  WHERE id = OLD.threat_id;

  INSERT INTO public.audit_log (
    user_id, user_name, user_role, entity_type, entity_id, entity_label,
    action, changes, human_narrative
  ) VALUES (
    actor, COALESCE(actor_name, 'unattributed'), actor_role,
    'control_threats', OLD.threat_id, v_threat, 'link_control_threat',
    jsonb_build_object('unlinked', true,
                       'control_id', OLD.control_id, 'control', v_ctl,
                       'threat_id',  OLD.threat_id,  'threat',  v_threat),
    format('Control "%s" removed from the controls countering threat "%s". '
           || 'It no longer counts towards any risk for that threat.', v_ctl, v_threat)
  );

  FOR v_item IN
    SELECT sai.id, sai.action_id, s.name AS system_name
      FROM public.security_action_items sai
      JOIN public.security_actions sa ON sa.id = sai.action_id
      JOIN public.systems s           ON s.id  = sai.system_id
     WHERE sai.control_id = OLD.control_id
       AND sai.element_type = 'control'
       AND sai.status IN ('pending', 'in_progress')
       AND sa.status NOT IN ('completed', 'cancelled')
       -- This unlink actually bears on the item: the action treats a live risk
       -- for THIS threat on the item's own system.
       AND EXISTS (
         SELECT 1 FROM public.security_action_risks sar
           JOIN public.risks r ON r.id = sar.risk_id AND r.is_active = TRUE
          WHERE sar.action_id = sai.action_id
            AND r.threat_id   = OLD.threat_id
            AND r.system_id   = sai.system_id)
       -- …and nothing else on the action still justifies it.
       AND NOT EXISTS (
         SELECT 1 FROM public.security_action_risks sar
           JOIN public.risks r           ON r.id = sar.risk_id AND r.is_active = TRUE
           JOIN public.control_threats ct ON ct.threat_id = r.threat_id
                                         AND ct.control_id = sai.control_id
          WHERE sar.action_id = sai.action_id
            AND r.system_id   = sai.system_id)
  LOOP
    UPDATE public.security_action_items
       SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = actor
     WHERE id = v_item.id;

    INSERT INTO public.security_action_notes (action_id, item_id, author_user_id, note)
    VALUES (v_item.action_id, v_item.id, actor,
            format('Withdrawn — "%s" is no longer one of the controls countering '
                   || '"%s", so this work would not treat the risk it was raised for. '
                   || 'Planned on %s.', v_ctl, v_threat, v_item.system_name));
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS z_withdraw_items_on_threat_unlink ON public.control_threats;
CREATE TRIGGER z_withdraw_items_on_threat_unlink
  AFTER DELETE ON public.control_threats
  FOR EACH ROW EXECUTE FUNCTION public.fn_withdraw_items_on_threat_unlink();

-- Reconcile the orphans already on the register. These were not withdrawn by a
-- decision, so `withdrawn_by` stays NULL and the note says plainly that this was
-- a reconciliation — attributing it to a person would invent an act nobody
-- performed. Two rows on the Misty Isles dataset; typically none elsewhere.
WITH orphaned AS (
  SELECT DISTINCT sai.id, sai.action_id, c.title AS control, s.name AS system_name
    FROM public.security_action_items sai
    JOIN public.security_actions sa ON sa.id = sai.action_id
    JOIN public.systems  s ON s.id = sai.system_id
    JOIN public.controls c ON c.id = sai.control_id
   WHERE sai.element_type = 'control'
     AND sai.status IN ('pending', 'in_progress')
     AND sa.status NOT IN ('completed', 'cancelled')
     AND NOT EXISTS (
       SELECT 1 FROM public.security_action_risks sar
         JOIN public.risks r            ON r.id = sar.risk_id AND r.is_active = TRUE
         JOIN public.control_threats ct ON ct.threat_id  = r.threat_id
                                       AND ct.control_id = sai.control_id
        WHERE sar.action_id = sai.action_id
          AND r.system_id   = sai.system_id)
), withdrawn AS (
  UPDATE public.security_action_items sai
     SET status = 'withdrawn', withdrawn_at = now()
    FROM orphaned o WHERE sai.id = o.id
  RETURNING sai.id
)
INSERT INTO public.security_action_notes (action_id, item_id, author_user_id, note)
SELECT o.action_id, o.id, NULL,
       format('Withdrawn on reconciliation — "%s" is not among the controls '
              || 'countering the threat this action treats, so the work planned '
              || 'on %s could not have reduced the risk. No record survives of '
              || 'when the control was unlinked.', o.control, o.system_name)
  FROM orphaned o WHERE o.id IN (SELECT id FROM withdrawn);
