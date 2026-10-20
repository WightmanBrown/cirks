-- 0128 — the risk calculation counts a control wherever it REACHES
--
-- WHY. v127 recorded how each control is delivered — organisation-wide, for a
-- group, or on each system — and derived the systems each reaches
-- (v_control_reach), but the risk calculation still read system_controls, so an
-- organisation-wide control counted only on the systems someone had attached it to
-- by hand (PR.AT-01: 21 of 51). The owner approved the change on 2026-09-22 after
-- it was measured on a copy of CIRKS-test with the agreed modes: 2 of 204 active
-- risks move, both down (12 -> 8, 10 -> 4), none up. It is small because training
-- counters two threats and a control lowers a risk only where a residual has been
-- JUDGED; reach makes it present, the judgement makes it count.
-- docs/statement-of-applicability.md §4.8.
--
-- WHAT.
--   • v_control_presence(control_id, system_id, status, via, …): one row per control
--     per system it is on. On each system (or not stated): the system_controls row,
--     unchanged, exclusions included. Organisation-wide / for a group: every system
--     it reaches, with the status taken from the control as a whole (owner,
--     2026-09-22): implemented -> operational, partial -> degraded, otherwise
--     missing (which the calculation does not count). One mode per control, so a
--     control never appears by two routes.
--   • fn_rcp_recompute_risk reads presence instead of system_controls. With no
--     delivery mode stated anywhere — every install until someone chooses — the
--     view IS system_controls and every score is unchanged, so no recompute runs here.
--   • Reach now also changes when the mode, the SoA entry (applicability and
--     implementation status), an objective's scopes, a scope's systems, a people
--     group's presence on a system, a control's link to a people group, or a
--     system's active flag changes. Each gets a trigger that recomputes the risks
--     it can affect, so no score is left stale.

CREATE VIEW v_control_presence AS
SELECT syc.control_id, syc.system_id, syc.status::text AS status, 'deployed'::text AS via,
       syc.exclusion_reason, syc.excluded_by, syc.excluded_at, syc.created_at, syc.provenance
  FROM system_controls syc
  JOIN controls c ON c.id = syc.control_id
 WHERE c.delivery IS NULL OR c.delivery = 'system'
UNION ALL
SELECT r.control_id, r.system_id,
       CASE se.implementation_status WHEN 'implemented' THEN 'operational'
                                     WHEN 'partial'     THEN 'degraded'
                                     ELSE 'missing' END,
       r.via, NULL::text, NULL::uuid, NULL::timestamptz, NULL::timestamptz, NULL::text
  FROM v_control_reach r
  JOIN soa_entries se ON se.control_id = r.control_id
 WHERE r.via IN ('organisation', 'group');

COMMENT ON VIEW v_control_presence IS
  'Is this control on this system, with what status, by which route (v128). deployed = system_controls (on each system / not stated); organisation / group = reached, status from the control''s implementation status. Read by the risk calculation.';

CREATE OR REPLACE FUNCTION public.fn_rcp_recompute_risk(p_risk_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- MIN over the DEPLOYED controls of their current residual. An 'operational'
  -- control contributes its judged value (or the inherent when unscored); a
  -- 'degraded' one contributes that value worsened by a rung, capped at the
  -- inherent. Any other status -- and a control not on the system at all --
  -- yields NULL and is ignored by MIN. When NOTHING is deployed the MIN is NULL
  -- and we fall back to the threat inherent. Guarded by IS DISTINCT so a no-op
  -- writes nothing.
  UPDATE public.risks r SET
    probability_c = sub.p_c,
    probability_i = sub.p_i,
    probability_a = sub.p_a
  FROM (
    SELECT
      COALESCE(MIN(CASE sc.status
                     WHEN 'operational' THEN COALESCE(rcp.probability_c, t.probability_c)
                     WHEN 'degraded'    THEN LEAST(t.probability_c,
                                                   COALESCE(rcp.probability_c, t.probability_c) + 1)
                   END),
               t.probability_c)::smallint AS p_c,
      COALESCE(MIN(CASE sc.status
                     WHEN 'operational' THEN COALESCE(rcp.probability_i, t.probability_i)
                     WHEN 'degraded'    THEN LEAST(t.probability_i,
                                                   COALESCE(rcp.probability_i, t.probability_i) + 1)
                   END),
               t.probability_i)::smallint AS p_i,
      COALESCE(MIN(CASE sc.status
                     WHEN 'operational' THEN COALESCE(rcp.probability_a, t.probability_a)
                     WHEN 'degraded'    THEN LEAST(t.probability_a,
                                                   COALESCE(rcp.probability_a, t.probability_a) + 1)
                   END),
               t.probability_a)::smallint AS p_a
    FROM public.risks rr
    JOIN public.threats t ON t.id = rr.threat_id
    LEFT JOIN public.control_threats ct ON ct.threat_id = t.id
    -- v128: presence comes from v_control_presence — the deployment for a control
    -- delivered on each system (or not stated), the systems it reaches for one
    -- delivered organisation-wide or for a group. Same CASE on status as before.
    LEFT JOIN public.v_control_presence sc
           ON sc.system_id = rr.system_id AND sc.control_id = ct.control_id
    LEFT JOIN public.risk_control_probability rcp
           ON rcp.risk_id = rr.id AND rcp.control_id = ct.control_id
    WHERE rr.id = p_risk_id
    GROUP BY t.probability_c, t.probability_i, t.probability_a
  ) sub
  WHERE r.id = p_risk_id
    AND (r.probability_c IS DISTINCT FROM sub.p_c
      OR r.probability_i IS DISTINCT FROM sub.p_i
      OR r.probability_a IS DISTINCT FROM sub.p_a);
END;
$function$;


-- Recompute every risk a control can affect: the risks on the threats it counters.
CREATE OR REPLACE FUNCTION public.fn_rcp_recompute_for_control(p_control_id uuid)
 RETURNS void LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT threat_id FROM public.control_threats WHERE control_id = p_control_id LOOP
    PERFORM public.fn_rcp_recompute_for_threat(r.threat_id);
  END LOOP;
END;
$$;

-- The mode itself.
CREATE OR REPLACE FUNCTION public.trg_fn_control_delivery_recompute() RETURNS trigger
 LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_rcp_recompute_for_control(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_control_delivery_recompute
  AFTER UPDATE OF delivery ON controls
  FOR EACH ROW WHEN (OLD.delivery IS DISTINCT FROM NEW.delivery)
  EXECUTE FUNCTION public.trg_fn_control_delivery_recompute();

-- The SoA entry: applicability sets where it applies; implementation status sets
-- the status of an organisation-wide or group control. Only those modes read it.
CREATE OR REPLACE FUNCTION public.trg_fn_soa_entry_reach_recompute() RETURNS trigger
 LANGUAGE plpgsql AS $$
DECLARE v_control uuid := COALESCE(NEW.control_id, OLD.control_id);
BEGIN
  IF EXISTS (SELECT 1 FROM public.controls WHERE id = v_control AND delivery IN ('organisation', 'group')) THEN
    PERFORM public.fn_rcp_recompute_for_control(v_control);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_soa_entry_reach_recompute
  AFTER INSERT OR DELETE OR UPDATE OF applicable, implementation_status ON soa_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_soa_entry_reach_recompute();
CREATE TRIGGER trg_soa_entry_scopes_reach_recompute
  AFTER INSERT OR DELETE ON soa_entry_scopes
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_soa_entry_reach_recompute();

-- A system's membership of a scope, a people group's presence, a system going
-- (in)active: recompute that system's risks.
CREATE OR REPLACE FUNCTION public.trg_fn_system_reach_recompute() RETURNS trigger
 LANGUAGE plpgsql AS $$
DECLARE v_system uuid;
BEGIN
  IF TG_TABLE_NAME = 'systems' THEN
    v_system := NEW.id;
  ELSIF TG_TABLE_NAME = 'system_components' THEN
    v_system := COALESCE(NEW.system_id, OLD.system_id);
    -- Only a PEOPLE component changes a group control's reach.
    IF NOT EXISTS (SELECT 1 FROM public.control_components
                    WHERE id = COALESCE(NEW.component_id, OLD.component_id) AND component_type = 'people') THEN
      RETURN NULL;
    END IF;
  ELSE
    v_system := COALESCE(NEW.system_id, OLD.system_id);
  END IF;
  PERFORM public.fn_rcp_recompute_for_system(v_system);
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_scope_systems_reach_recompute
  AFTER INSERT OR DELETE ON scope_systems
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_system_reach_recompute();
CREATE TRIGGER trg_system_components_reach_recompute
  AFTER INSERT OR DELETE ON system_components
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_system_reach_recompute();
CREATE TRIGGER trg_systems_active_reach_recompute
  AFTER UPDATE OF is_active ON systems
  FOR EACH ROW WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.trg_fn_system_reach_recompute();

-- A control linked to (or unlinked from) a people group: its group reach changes.
CREATE OR REPLACE FUNCTION public.trg_fn_control_group_link_recompute() RETURNS trigger
 LANGUAGE plpgsql AS $$
DECLARE v_control uuid := COALESCE(NEW.control_id, OLD.control_id);
BEGIN
  IF EXISTS (SELECT 1 FROM public.controls WHERE id = v_control AND delivery = 'group')
     AND EXISTS (SELECT 1 FROM public.control_components
                  WHERE id = COALESCE(NEW.component_id, OLD.component_id) AND component_type = 'people') THEN
    PERFORM public.fn_rcp_recompute_for_control(v_control);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_control_group_link_recompute
  AFTER INSERT OR DELETE ON control_component_links
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_control_group_link_recompute();

-- ── Work planned system by system for a control that is now delivered once ──
-- An action item is one control on one system. Once the control is delivered
-- organisation-wide or for a group it has no per-system record — its status on
-- every system it reaches is the control's own — so completing the item would
-- write a system_controls row the risk calculation no longer reads. The work
-- cannot lower the risk however diligently it is done, yet it would stay on a
-- worklist and keep promising a reduction in the Target Risk column. The same
-- orphaning as v119 (exclusion) and v121 (threat unlink), handled the same way:
-- withdrawn by trigger, with a note on the item giving the reason, never deleted.
-- Returning the control to "on each system" does NOT resurrect them (as v119).
CREATE OR REPLACE FUNCTION public.fn_withdraw_items_on_delivery_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  actor  uuid := NULLIF(current_setting('cirks.actor_id', true), '')::uuid;
  v_mode text := CASE NEW.delivery WHEN 'organisation' THEN 'organisation-wide' ELSE 'for a group' END;
  v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT sai.id, sai.action_id, s.name AS system_name
      FROM public.security_action_items sai
      JOIN public.security_actions sa ON sa.id = sai.action_id
      JOIN public.systems s           ON s.id  = sai.system_id
     WHERE sai.control_id = NEW.id
       AND sai.element_type = 'control'
       AND sai.status IN ('pending', 'in_progress')
       AND sa.status NOT IN ('completed', 'cancelled')
  LOOP
    UPDATE public.security_action_items
       SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = actor
     WHERE id = v_item.id;

    INSERT INTO public.security_action_notes (action_id, item_id, author_user_id, note)
    VALUES (v_item.action_id, v_item.id, actor,
            format('Withdrawn — "%s" is now delivered %s, so it is improved once on the '
                   || 'control itself, not system by system. Planned on %s.',
                   NEW.title, v_mode, v_item.system_name));
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER z_withdraw_items_on_delivery_change
  AFTER UPDATE OF delivery ON controls
  FOR EACH ROW
  WHEN (NEW.delivery IN ('organisation', 'group') AND OLD.delivery IS DISTINCT FROM NEW.delivery)
  EXECUTE FUNCTION public.fn_withdraw_items_on_delivery_change();
