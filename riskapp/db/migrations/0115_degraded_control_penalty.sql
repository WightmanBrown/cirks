-- 0115 — a DEGRADED control no longer contributes as if it were working
--
-- WHY. The current-risk probability is MIN over the DEPLOYED controls (0095, and
-- docs/threat-coverage-panel.md "The invariant"), where
--
--     deployed(control) := system_controls.status IN ('operational','degraded')
--
-- and a deployed control contributes its judged residual *as-is*. Nothing in that
-- aggregate distinguishes the two deployed states, so a control marked DEGRADED
-- counted exactly as one marked OPERATIONAL. Because the combiner is MIN, the
-- single best control sets the floor — and it could be the degraded one, holding
-- the risk down at a value that was judged on the assumption the control works.
--
-- That is not a MIN-vs-MAX question. It is wrong under either combiner, and it is
-- not rare: 163 of the 651 rows feeding the aggregate on CIRKS-test are degraded.
-- Marking a control degraded is an analyst telling the system something is wrong,
-- and the register was ignoring it.
--
-- CHANGE. A degraded control is worsened by one rung, bounded above by the threat
-- inherent:
--
--     contribution := CASE status
--                       WHEN 'operational' THEN COALESCE(judged, inherent)
--                       WHEN 'degraded'    THEN LEAST(inherent, COALESCE(judged, inherent) + 1)
--                     END                                    -- NULL otherwise (excluded)
--
-- One rung, not exclusion, because the four-state model already has a word for
-- "not there": `missing`. Degraded means present but impaired, and a penalty says
-- that where exclusion would collapse it into missing. The frequency ladder is
-- logarithmic (~3-4x per rung), so one rung is a real but proportionate cost.
--
-- WHAT IS PRESERVED. Every property 0095 was protecting:
--   * bounded above by the inherent — a control still can never make an attack
--     more likely than doing nothing;
--   * monotonic — every contribution is <= inherent, so adding or keeping a
--     control can still never RAISE the current risk. Defence in depth is not
--     punished;
--   * not-deployed controls still contribute nothing (dormant targets on the
--     coverage axis);
--   * a degraded-but-unjudged control is unchanged: COALESCE gives the inherent
--     and LEAST(inherent, inherent + 1) is the inherent.
--
-- The effect is that DEGRADING a control now raises the risk, and repairing it
-- lowers it again — which is the behaviour the status was introduced (v89) to
-- express.

CREATE OR REPLACE FUNCTION public.fn_rcp_recompute_risk(p_risk_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
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

-- Backfill: the derivation changed, recompute every risk. Scores follow via the
-- existing trg_fn_compute_cia_scores trigger on risks.probability_*.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.risks LOOP
    PERFORM public.fn_rcp_recompute_risk(r.id);
  END LOOP;
END;
$$;
