-- 0094 — only DEPLOYED controls drive the current risk probability
--
-- WHY. 0092 derived risks.probability_* = MAX over the threat's controls of
-- COALESCE(judged row, threat inherent) — looking only at whether a control had a
-- judged row, never at whether the control is actually IN PLACE on the system.
-- So scoring a missing/unknown control could pull the current risk down, crediting
-- a control that isn't deployed with reducing the attack likelihood. That's wrong:
-- a control that isn't operating can't reduce the current risk.
--
-- MODEL. A control's judged residual counts toward the CURRENT risk only when the
-- control is DEPLOYED and working — per-system status operational or degraded
-- (degraded is scored "as-is" by the analyst). Any other state — missing,
-- unknown, or not deployed at all — contributes the threat inherent (no
-- reduction). The judged value on a not-deployed control is still stored; it is a
-- dormant TARGET (a later sprint auto-populates security-action targets from it),
-- but it does not move the current risk.
--
--   current residual(control) = status IN (operational, degraded)
--                                 ? COALESCE(judged, threat inherent)
--                                 : threat inherent
--   risks.probability_* = MAX over control_threats of that
--
-- Because the contributing set now depends on system_controls.status, the risk
-- must also recompute when a control is deployed / undeployed / changes status —
-- a new trigger on system_controls covers that (0092 only fired on the rcp row,
-- control_threats, and the threat inherent).

CREATE OR REPLACE FUNCTION public.fn_rcp_recompute_risk(p_risk_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- MAX over every control linked to the risk's threat of that control's CURRENT
  -- residual: its judged row only when the control is deployed+working
  -- (system_controls.status operational|degraded), else the threat inherent. A
  -- threat with no linked controls still yields one row (LEFT JOINs NULL → the
  -- inherent). Guarded by IS DISTINCT so a no-op writes nothing.
  UPDATE public.risks r SET
    probability_c = sub.p_c,
    probability_i = sub.p_i,
    probability_a = sub.p_a
  FROM (
    SELECT
      MAX(CASE WHEN sc.status IN ('operational','degraded')
               THEN COALESCE(rcp.probability_c, t.probability_c)
               ELSE t.probability_c END)::smallint AS p_c,
      MAX(CASE WHEN sc.status IN ('operational','degraded')
               THEN COALESCE(rcp.probability_i, t.probability_i)
               ELSE t.probability_i END)::smallint AS p_i,
      MAX(CASE WHEN sc.status IN ('operational','degraded')
               THEN COALESCE(rcp.probability_a, t.probability_a)
               ELSE t.probability_a END)::smallint AS p_a
    FROM public.risks rr
    JOIN public.threats t ON t.id = rr.threat_id
    LEFT JOIN public.control_threats ct ON ct.threat_id = t.id
    LEFT JOIN public.system_controls sc
           ON sc.system_id = rr.system_id AND sc.control_id = ct.control_id
    LEFT JOIN public.risk_control_probability rcp
           ON rcp.risk_id = rr.id AND rcp.control_id = ct.control_id
    WHERE rr.id = p_risk_id
  ) sub
  WHERE r.id = p_risk_id
    AND (r.probability_c IS DISTINCT FROM sub.p_c
      OR r.probability_i IS DISTINCT FROM sub.p_i
      OR r.probability_a IS DISTINCT FROM sub.p_a);
END;
$$;

-- Recompute every risk on a system when one of its controls is deployed /
-- undeployed / changes status (the contributing set now depends on that).
CREATE FUNCTION public.fn_rcp_recompute_for_system(p_system_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.risks WHERE system_id = p_system_id LOOP
    PERFORM public.fn_rcp_recompute_risk(r.id);
  END LOOP;
END;
$$;

CREATE FUNCTION public.trg_fn_system_controls_recompute() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_rcp_recompute_for_system(OLD.system_id);
    RETURN OLD;
  END IF;
  PERFORM public.fn_rcp_recompute_for_system(NEW.system_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_system_controls_recompute
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.system_controls
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_system_controls_recompute();

-- Backfill: the derivation changed, so recompute every risk. Risks that had a
-- not-deployed control judged below inherent (the bug) correctly rise back toward
-- their threat inherent.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.risks LOOP
    PERFORM public.fn_rcp_recompute_risk(r.id);
  END LOOP;
END;
$$;
