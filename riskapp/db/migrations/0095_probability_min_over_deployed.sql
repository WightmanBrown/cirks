-- 0095 — current risk probability = MIN over the DEPLOYED controls (best wins)
--
-- WHY. Two corrections to how risks.probability_* is derived, closing a modelling
-- loop (see docs/threat-coverage-panel.md "The invariant"):
--
--   (1) NOT-DEPLOYED CONTROLS ARE EXCLUDED, NOT PINNED. 0094 made a not-deployed
--       control contribute the threat inherent, so gaps pinned the current risk at
--       inherent no matter how well the deployed controls scored. That conflated
--       two separate questions — "how do my deployed controls combine?" and "how
--       bad are my gaps?" — into one number. The current risk answers only the
--       first: not-deployed controls do not affect it at all (their scores are
--       dormant TARGETS driving the action plan). Gaps live on the coverage axis.
--
--   (2) COMBINER IS MIN, NOT MAX. Over the deployed set, the BEST (lowest) control
--       sets the floor. MAX (weakest governs) had a perverse property once gaps
--       were excluded: deploying an additional, weaker control RAISED the risk.
--       MIN means deploying/keeping a control can never increase the current risk —
--       defense-in-depth is never punished. Bounded above by the threat inherent.
--
-- MODEL.
--   deployed(control)         := system_controls.status IN (operational, degraded)
--   contribution(control)     := deployed ? COALESCE(judged, threat_inherent) : NULL
--   risks.probability_*       := COALESCE( MIN over control_threats of contribution,
--                                          threat_inherent )      -- inherent when none deployed
--
-- The recompute triggers (rcp row, control_threats, threat inherent — 0092; and
-- system_controls status — 0094) are unchanged; only the aggregate itself moves.

CREATE OR REPLACE FUNCTION public.fn_rcp_recompute_risk(p_risk_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- MIN over the DEPLOYED controls (operational|degraded) of their current
  -- residual (judged, else the inherent for a deployed-but-unscored control).
  -- Not-deployed controls contribute NULL and are ignored by MIN; when NOTHING is
  -- deployed the MIN is NULL and we fall back to the threat inherent. Guarded by
  -- IS DISTINCT so a no-op writes nothing.
  UPDATE public.risks r SET
    probability_c = sub.p_c,
    probability_i = sub.p_i,
    probability_a = sub.p_a
  FROM (
    SELECT
      COALESCE(MIN(CASE WHEN sc.status IN ('operational','degraded')
                        THEN COALESCE(rcp.probability_c, t.probability_c) END),
               t.probability_c)::smallint AS p_c,
      COALESCE(MIN(CASE WHEN sc.status IN ('operational','degraded')
                        THEN COALESCE(rcp.probability_i, t.probability_i) END),
               t.probability_i)::smallint AS p_i,
      COALESCE(MIN(CASE WHEN sc.status IN ('operational','degraded')
                        THEN COALESCE(rcp.probability_a, t.probability_a) END),
               t.probability_a)::smallint AS p_a
    FROM public.risks rr
    JOIN public.threats t ON t.id = rr.threat_id
    LEFT JOIN public.control_threats ct ON ct.threat_id = t.id
    LEFT JOIN public.system_controls sc
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
$$;

-- Backfill: the derivation changed, recompute every risk.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.risks LOOP
    PERFORM public.fn_rcp_recompute_risk(r.id);
  END LOOP;
END;
$$;
